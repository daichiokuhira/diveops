/* 潜水現場記録 共有 API（Cloudflare Workers + D1）
 *
 * POST /api/login  { memberId, passcode }          → { token, member }
 * POST /api/sync   { since, changes: [doc...] }     → { seq, changes: [doc...], rejected: [...], more, limit }
 * GET  /api/me                                      → { member }
 *
 * 文書（doc）= { kind, id, data, deleted, updatedAt }。種類ごとに id で1件。
 * 同じ文書は updatedAt（端末で変更した日時。サーバーとの時計の差を端末が直す）の新しい方を正とする。
 * 権限：隊員の追加・異動・資格の確認は隊長（leader）と管理者（admin）。隊長の指名と隊長の名簿の変更は管理者だけ。
 * 秘密の値（wrangler secret）：TEAM_PASSCODE（隊共通）、SECRET_KEY（証明の鍵）、ADMIN_PASSCODE（管理者用・任意）、ADMIN_IDS（管理者の職員番号）
 */
import { DocSchema } from './schema.js';
const KINDS = DocSchema.kinds;
const MERGE_KINDS = ['incident', 'member'];
const MAX_BODY = 2 * 1024 * 1024;
const MAX_DOC_BYTES = 64 * 1024;
const PAGE_ROWS = 500, PAGE_BYTES = 2 * 1024 * 1024;
const TOKEN_DAYS = 30, TOKEN_MAX_DAYS = 90;
const WINDOW_MS = 15 * 60 * 1000, LIMIT_ID_IP = 10, LIMIT_IP = 50;
const WRITES_PER_HOUR = 3000;
// 1回の送信で受け付ける件数。無料プランは1回の処理で D1 の問い合わせが50回までなので、少なめにする（有料なら CHANGES_PER_REQUEST で増やせる）
const changesLimit = env => Math.max(1, Math.min(100, Number(env.CHANGES_PER_REQUEST) || 5));

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = s => b64url(enc.encode(s));
const unb64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
async function hmac(key, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}
// 文字列の比較を、長さと中身で時間が変わらないように
function sameText(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
const okId = v => typeof v === 'string' && v.length > 0 && v.length <= 120 && !/[\u0000-\u001f<>"'`&]/.test(v);
const okMemberId = v => typeof v === 'string' && /^[0-9A-Za-z_-]{1,20}$/.test(v);
// 日時は形を確かめてから、ミリ秒まで入った同じ書き方にそろえる（文字の比較で新旧を決めるため）
const normIso = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const h = { 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' };
  if (list(env.ALLOWED_ORIGINS).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

// 本文を読みながら大きさを数える（Content-Length が無くても上限を守る）
async function readJson(req, max) {
  if (Number(req.headers.get('Content-Length') || 0) > max) return { tooBig: true };
  if (!req.body) return { value: {} };
  const r = req.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.length;
    if (n > max) { try { await r.cancel(); } catch (e) {} return { tooBig: true }; }
    parts.push(value);
  }
  const buf = new Uint8Array(n); let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  try { return { value: JSON.parse(new TextDecoder().decode(buf)) }; } catch (e) { return { bad: true }; }
}

async function memberRow(env, id) {
  const r = await env.DB.prepare("SELECT data, deleted FROM docs WHERE kind = 'member' AND id = ?").bind(id).first();
  if (!r || r.deleted) return null;
  try { return { id, ...JSON.parse(r.data) }; } catch (e) { return null; }
}
// 役割：管理者 > 隊長 > 隊員。管理者は ADMIN_IDS で決まる（名簿に無くても入れる）
function roleOf(env, id, m) {
  if (list(env.ADMIN_IDS).includes(id)) return 'admin';
  return m && m.role === 'leader' ? 'leader' : 'member';
}
// パスコードの版：鍵つきで作るので、証明からパスコードを割り出せない。パスコードを変えると全員の証明が切れる
const passVersion = async env => (await hmac(env.SECRET_KEY, 'pv:' + env.TEAM_PASSCODE + '|' + (env.ADMIN_PASSCODE || ''))).slice(0, 22);

async function issueToken(env, sub, iat = Date.now()) {
  const body = b64urlText(JSON.stringify({ sub, pv: await passVersion(env), iat, exp: Math.min(Date.now() + TOKEN_DAYS * 86400000, iat + TOKEN_MAX_DAYS * 86400000) }));
  return body + '.' + await hmac(env.SECRET_KEY, body);
}
// ログインの証明を確かめ、いまの名簿から役割を引き直す（異動・退職・隊長の指名がすぐ効く）
async function auth(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || !sameText(sig, await hmac(env.SECRET_KEY, body))) return null;
  let t; try { t = JSON.parse(unb64url(body)); } catch (e) { return null; }
  if (!t || typeof t.sub !== 'string' || !(t.exp > Date.now()) || !sameText(t.pv, await passVersion(env))) return null;
  const mem = await memberRow(env, t.sub);
  const role = roleOf(env, t.sub, mem);
  if (role !== 'admin' && (!mem || (mem.status || '在籍') !== '在籍')) return null;
  // 期限まで7日を切ったら延ばす。ただし最初のログインから90日でログインし直し
  const renew = t.exp - Date.now() < 7 * 86400000 && Date.now() - (t.iat || 0) < TOKEN_MAX_DAYS * 86400000 - 86400000;
  return { sub: t.sub, role, name: mem?.name || `職員番号 ${t.sub}`, iat: t.iat || Date.now(), renew };
}

// ログインの回数を、職員番号＋場所ごと・場所ごとに数える（数えるのと判定を1つの文で行う）
async function bump(env, key, win) {
  const r = await env.DB.prepare('INSERT INTO login_cnt (k, win, n) VALUES (?, ?, 1) ON CONFLICT (k, win) DO UPDATE SET n = n + 1 RETURNING n').bind(key, win).first();
  return r ? r.n : 1;
}
const ipKey = req => {
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip; // IPv6 は /64 ごと
};
async function login(req, env) {
  const win = Math.floor(Date.now() / WINDOW_MS), ip = ipKey(req);
  await env.DB.prepare('DELETE FROM login_cnt WHERE win < ?').bind(win - 1).run();
  const got = await readJson(req, 4096);
  const b = got.value || {};
  const id = String(b.memberId || '').normalize('NFKC').trim().slice(0, 40);
  const [nIdIp, nIp] = [await bump(env, `id:${id}|${ip}`, win), await bump(env, `ip:${ip}`, win)];
  if (nIdIp > LIMIT_ID_IP || nIp > LIMIT_IP) return json({ error: 'ログインの失敗が続いたため、15分ほど待ってから試してください。' }, 429);
  const no = () => json({ error: 'IDかパスコードが違います。名簿に無い場合は、隊長に登録を頼んでください。' }, 401);
  if (!okMemberId(id) || !env.TEAM_PASSCODE) return no();
  const mem = await memberRow(env, id);
  const role = roleOf(env, id, mem);
  // 管理者は、管理者用のパスコードがあればそれで入る（隊共通のパスコードだけでは管理者になれない）
  const pass = role === 'admin' && env.ADMIN_PASSCODE ? env.ADMIN_PASSCODE : env.TEAM_PASSCODE;
  if (!sameText(String(b.passcode || ''), pass)) return no();
  if (role !== 'admin' && (!mem || (mem.status || '在籍') !== '在籍')) return no();
  // 成功したら、その職員番号＋場所の失敗の数を戻す
  await env.DB.prepare('DELETE FROM login_cnt WHERE k = ?').bind(`id:${id}|${ip}`).run();
  return json({ token: await issueToken(env, id), member: { id, name: mem?.name || `職員番号 ${id}`, role } }, 200);
}

// 1件の変更を、権限に照らして確かめる。だめなら理由を返す
function checkChange(user, ch, cur) {
  const leader = user.role === 'leader' || user.role === 'admin', admin = user.role === 'admin';
  const d = ch.data || {}, old = cur && !cur.deleted ? cur.data : null;
  switch (ch.kind) {
    case 'member':
      if (!leader) return '隊員の追加・変更は隊長だけができます';
      if (!okMemberId(ch.id)) return '職員番号は半角の英数字（20字まで）にしてください';
      if ((d.role || 'member') !== ((old && old.role) || 'member') && !admin) return '隊長の指名は管理者だけができます';
      if (old && old.role === 'leader' && !admin && ch.id !== user.sub) return '隊長の名簿の変更は管理者だけができます';
      return null;
    case 'qual': {
      const owner = ch.deleted ? old && old.memberId : d.memberId;
      const mine = owner === user.sub && (!old || old.memberId === user.sub);
      if (!leader && !mine) return '自分以外の資格・研修は入力できません';
      if (!leader && old && old.confirmedAt) return '確認済みの資格・研修は隊長だけが直せます';
      if (!leader && d.confirmedAt) return '資格の確認は隊長だけができます';
      return null;
    }
    case 'incident':
      // 潜水表の写しを、あとから別の表に替えるのは隊長だけ（計算の元が変わるため）
      if (old && old.tableSnap && JSON.stringify(old.tableSnap) !== JSON.stringify(d.tableSnap ?? old.tableSnap) && !leader) return '事案の潜水表を替えるのは隊長だけができます';
      // 潜水の記録がある事案の削除（削除済みの印）と、その取り消しは隊長だけ。記録そのものは消さずに残す
      if (!!old?.removed !== !!d.removed && !leader) return '事案の削除と元に戻すのは隊長だけができます';
      return null;
    default: return null; // 潜水員・潜水は、ログインした隊員なら誰でも
  }
}

// 記録を守るための決まり（潜水中の人や、潜水の記録が消えるのを防ぐ）
async function guard(env, ch, cur, data, batchIds, nowMs) {
  if (ch.deleted && ch.kind === 'dive') return '潜水の記録は消せません（「削除済み」にしてください）';
  if (!ch.deleted && ch.kind === 'diver' && ch.id !== `${data.incidentId}~${data.memberId}`) return '形が正しくありません';
  if (!ch.deleted && cur && cur.data && (ch.kind === 'dive' || ch.kind === 'diver' || ch.kind === 'qual')) {
    // 潜水・潜水員・資格の持ち主（事案・職員番号）は、あとから替えられない
    if (cur.data.memberId && cur.data.memberId !== data.memberId) return '記録の持ち主は替えられません';
    if (cur.data.incidentId && cur.data.incidentId !== data.incidentId) return '記録の事案は替えられません';
  }
  if (!cur || cur.deleted) return null;
  if (ch.kind === 'diver') {
    const was = cur.data.current;
    // 潜水中の印を外すのは、浮上の記録（同じ記録ID）があるとき、または潜降から15分以内（押し間違いの取り消し）だけ
    if (was && (ch.deleted || !data.current)) {
      const startedMs = Date.parse(was.startAt || '') || 0;
      const surfaced = was.id && (batchIds.has('dive:' + was.id) || await env.DB.prepare("SELECT 1 AS x FROM docs WHERE kind = 'dive' AND id = ? AND deleted = 0").bind(was.id).first());
      if (!surfaced && nowMs - startedMs > 15 * 60 * 1000) return ch.deleted ? '潜水中の潜水員は外せません' : '浮上の記録がないまま、潜水中の印は外せません';
      if (ch.deleted) return '潜水中の潜水員は外せません';
    }
    if (ch.deleted) {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind = 'dive' AND deleted = 0 AND incident_id = ? AND member_id = ?").bind(cur.data.incidentId, cur.data.memberId).first();
      if (n.n) return '潜水の記録がある潜水員は外せません';
    }
  }
  if (ch.kind === 'incident' && ch.deleted) {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind IN ('dive', 'diver') AND deleted = 0 AND incident_id = ? AND (kind = 'dive' OR json_extract(data, '$.current') IS NOT NULL)").bind(ch.id).first();
    if (n.n) return '潜水の記録がある事案は消せません';
  }
  return null;
}

async function sync(req, env, user) {
  const got = await readJson(req, MAX_BODY);
  if (got.tooBig) return json({ error: '一度に送る量が多すぎます。' }, 413);
  if (got.bad) return json({ error: '形が正しくありません。' }, 400);
  const b = got.value || {}, limit = changesLimit(env);
  let since = Number.isInteger(b.since) && b.since >= 0 ? b.since : 0;
  // サーバーの番号より先を指していたら（データベースを作り直したときなど）、最初から送り直してもらう
  const top0 = await env.DB.prepare("SELECT v FROM meta WHERE k = 'seq'").first();
  const reset = since > (top0?.v || 0);
  if (reset) since = 0;
  const changes = Array.isArray(b.changes) ? b.changes : [];
  if (changes.length > limit) return json({ error: `一度に送れるのは${limit}件までです。`, limit }, 413);
  // 書き込みの量の上限（1人あたり1時間）
  if (changes.length) {
    const w = await env.DB.prepare('SELECT COUNT(*) AS n FROM audit WHERE updated_by = ? AND server_at > ?').bind(user.sub, new Date(Date.now() - 3600e3).toISOString()).first();
    if ((w?.n || 0) > WRITES_PER_HOUR) return json({ error: '書き込みが多すぎます。しばらく待ってください。', limit }, 429);
  }
  const rejected = [], now = new Date().toISOString(), nowMs = Date.now();
  const batchIds = new Set(changes.filter(c => c && !c.deleted).map(c => `${c.kind}:${c.id}`));
  for (const ch of changes) {
    const key = { kind: ch && ch.kind, id: ch && ch.id };
    const upd = ch && normIso(ch.updatedAt);
    if (!ch || !KINDS.includes(ch.kind) || !okId(ch.id) || !upd || typeof ch.deleted !== 'boolean' || typeof ch.data !== 'object' || ch.data === null || Array.isArray(ch.data)) { rejected.push({ ...key, reason: '形が正しくありません' }); continue; }
    const cleaned = ch.deleted ? {} : DocSchema.clean(ch.kind, ch.data);
    if (!cleaned) { rejected.push({ ...key, reason: '形が正しくありません' }); continue; }
    // 端末の時計が大きく進んでいる変更は受け取らない（新しい方が勝つ仕組みを壊さないため）
    if (Date.parse(upd) > nowMs + 10 * 60 * 1000) { rejected.push({ ...key, reason: '端末の時計が進んでいます。日時を合わせてください' }); continue; }
    // 欄ごとに新しい方を取る種類（事案・隊員）。端末は変えた欄の名前を fields で送る
    const patchable = MERGE_KINDS.includes(ch.kind) && !ch.deleted && Array.isArray(ch.fields) && ch.fields.every(f => typeof f === 'string' && f.length <= 40);
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const row = await env.DB.prepare('SELECT data, deleted, updated_at, updated_by, seq FROM docs WHERE kind = ? AND id = ?').bind(ch.kind, ch.id).first();
      const cur = row ? { data: JSON.parse(row.data), deleted: !!row.deleted, updatedAt: row.updated_at } : null;
      // 受け付けないときは、サーバーのいまの文書を一緒に返す（端末はそれに合わせる）
      const reject = reason => { rejected.push({ ...key, reason, doc: row ? { kind: ch.kind, id: ch.id, data: cur.data, deleted: cur.deleted, updatedAt: cur.updatedAt, updatedBy: row.updated_by, seq: row.seq } : null }); done = true; };
      // 電波のない間の潜降（潜水中の潜水員）は、先に届いた「外す」より優先する（潜水中の人を消さない）
      const revive = !!(cur && cur.deleted && !ch.deleted && ch.kind === 'diver' && cleaned.current);
      let data, stamp = upd, cond = 'newer';
      if (patchable && cur && !cur.deleted) {
        // 欄ごと：その欄の前の日時より新しければ取る
        const ft = { ...(cur.data._ft || {}) }, merged = { ...cur.data };
        let applied = 0;
        for (const f of ch.fields) if (upd > (ft[f] || '')) { if (f in cleaned) merged[f] = cleaned[f]; else delete merged[f]; ft[f] = upd; applied++; }
        if (!applied) { reject('stale'); break; }
        data = DocSchema.clean(ch.kind, merged);
        if (!data) { reject('形が正しくありません'); break; }
        data._ft = ft;
        stamp = upd > cur.updatedAt ? upd : new Date(Date.parse(cur.updatedAt) + 1).toISOString();
        cond = 'same'; // 読んだときから変わっていなければ書く（変わっていたら読み直す）
      } else {
        if (cur && cur.updatedAt >= upd && !revive) { reject('stale'); break; } // サーバーの方が新しい
        // 削除のときも前の中身は残す（あとで戻すときに使う）
        data = ch.deleted ? (cur ? cur.data : {}) : { ...cleaned };
        if (!ch.deleted && MERGE_KINDS.includes(ch.kind)) data._ft = Object.fromEntries(Object.keys(DocSchema.fields(ch.kind)).map(f => [f, upd]));
        if (revive) stamp = now;
      }
      const why = checkChange(user, { ...ch, data: ch.deleted ? {} : data }, cur) || await guard(env, ch, cur, data, batchIds, nowMs);
      if (why) { reject(why); break; }
      if (ch.kind === 'qual' && !ch.deleted) {
        // 確認した人と日時は、サーバーが入れる（端末から送られた値は使わない）
        const was = cur && !cur.deleted ? cur.data : null;
        if (!data.confirmedAt) { delete data.confirmedBy; delete data.confirmedById; }
        else if (was && was.confirmedAt) { data.confirmedAt = was.confirmedAt; data.confirmedBy = was.confirmedBy; data.confirmedById = was.confirmedById; }
        else { data.confirmedAt = now; data.confirmedById = user.sub; data.confirmedBy = user.name; }
      }
      const out = JSON.stringify(data);
      if (enc.encode(out).length > MAX_DOC_BYTES) { reject('大きすぎます'); break; }
      // 番号を取り、条件に合うときだけ書き、記録を残す、を1つの処理で行う（2台が同時に送っても古い方が残らない）
      const where = cond === 'same' ? 'WHERE docs.updated_at = ? AND docs.deleted = 0' : 'WHERE excluded.updated_at > docs.updated_at OR (? = 1 AND docs.deleted = 1)';
      const stmts = [
        env.DB.prepare("UPDATE meta SET v = v + 1 WHERE k = 'seq'"),
        env.DB.prepare(`INSERT INTO docs (kind, id, data, deleted, updated_at, updated_by, server_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT v FROM meta WHERE k = 'seq'))
          ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, updated_by = excluded.updated_by, server_at = excluded.server_at, seq = excluded.seq
          ${where}`).bind(ch.kind, ch.id, out, ch.deleted ? 1 : 0, stamp, user.sub, now, cond === 'same' ? cur.updatedAt : (revive ? 1 : 0)),
        env.DB.prepare(`INSERT INTO audit (seq, kind, id, deleted, updated_by, server_at, data) SELECT v, ?, ?, ?, ?, ?, ? FROM meta WHERE k = 'seq' AND v = (SELECT seq FROM docs WHERE kind = ? AND id = ?)`)
          .bind(ch.kind, ch.id, ch.deleted ? 1 : 0, user.sub, now, out, ch.kind, ch.id)
      ];
      // 潜水員・潜水が届いた事案が消されていたら、事案を中身ごと戻す（電波のない間の記録を消さない）
      if (!ch.deleted && (ch.kind === 'diver' || ch.kind === 'dive')) {
        stmts.push(env.DB.prepare("UPDATE meta SET v = v + 1 WHERE k = 'seq' AND EXISTS (SELECT 1 FROM docs WHERE kind = 'incident' AND id = ? AND deleted = 1)").bind(data.incidentId));
        stmts.push(env.DB.prepare("UPDATE docs SET deleted = 0, server_at = ?, updated_at = ?, seq = (SELECT v FROM meta WHERE k = 'seq') WHERE kind = 'incident' AND id = ? AND deleted = 1").bind(now, now, data.incidentId));
      }
      if (!ch.deleted && ch.kind === 'dive' && !data.deleted) {
        // 外された潜水員に、電波のない間の潜水が届いたら、潜水員も戻す（潜水の記録が宙に浮かないように）
        const did = `${data.incidentId}~${data.memberId}`;
        stmts.push(env.DB.prepare("UPDATE meta SET v = v + 1 WHERE k = 'seq' AND EXISTS (SELECT 1 FROM docs WHERE kind = 'diver' AND id = ? AND deleted = 1)").bind(did));
        stmts.push(env.DB.prepare("UPDATE docs SET deleted = 0, server_at = ?, updated_at = ?, seq = (SELECT v FROM meta WHERE k = 'seq') WHERE kind = 'diver' AND id = ? AND deleted = 1").bind(now, now, did));
      }
      const res = await env.DB.batch(stmts);
      if (res[1].meta.changes) { done = true; break; }
      if (cond !== 'same') { reject('stale'); break; } // 同時に新しい方が書かれた
      // 欄ごとの合わせ：読んだあとに変わっていたので、読み直してやり直す
    }
    if (!done) rejected.push({ ...key, reason: 'stale', doc: null });
  }
  // 受け取り：件数と大きさの両方で区切る
  const rows = await env.DB.prepare('SELECT kind, id, data, deleted, updated_at, updated_by, seq FROM docs WHERE seq > ? ORDER BY seq LIMIT ?').bind(since, PAGE_ROWS + 1).all();
  const all = rows.results || [], page = [];
  let bytes = 0, more = all.length > PAGE_ROWS;
  for (const r of all.slice(0, PAGE_ROWS)) {
    bytes += r.data.length * 3;
    if (page.length && bytes > PAGE_BYTES) { more = true; break; }
    page.push({ kind: r.kind, id: r.id, data: JSON.parse(r.data), deleted: !!r.deleted, updatedAt: r.updated_at, updatedBy: r.updated_by, seq: r.seq });
  }
  const token = user.renew ? await issueToken(env, user.sub, user.iat) : undefined;
  return json({ seq: page.length ? page[page.length - 1].seq : since, changes: page, rejected, more, reset, limit, me: { id: user.sub, name: user.name, role: user.role }, token, now: new Date().toISOString() }, 200);
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    if (!env.SECRET_KEY || !env.TEAM_PASSCODE) return json({ error: 'サーバーの設定（パスコード・鍵）がまだです。' }, 503, h);
    try {
      if (url.pathname === '/api/login' && req.method === 'POST') return withHeaders(await login(req, env), h);
      const user = await auth(req, env);
      if (!user) return json({ error: 'ログインし直してください。' }, 401, h);
      if (url.pathname === '/api/sync' && req.method === 'POST') return withHeaders(await sync(req, env, user), h);
      if (url.pathname === '/api/me' && req.method === 'GET') return json({ member: { id: user.sub, name: user.name, role: user.role } }, 200, h);
      return json({ error: 'ありません。' }, 404, h);
    } catch (e) {
      return json({ error: 'サーバーで問題が起きました。時間をおいて試してください。' }, 500, h);
    }
  }
};
function withHeaders(res, h) { for (const [k, v] of Object.entries(h)) res.headers.set(k, v); return res; }
