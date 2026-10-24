/* 潜水現場記録 共有 API（Cloudflare Workers + D1）
 *
 * POST /api/login  { memberId, passcode }          → { token, member }
 * POST /api/sync   { since, changes: [doc...] }     → { seq, changes: [doc...], rejected: [...], more }
 * GET  /api/me                                      → { member }
 *
 * 文書（doc）= { kind, id, data, deleted, updatedAt }。種類ごとに id で1件。
 * 同じ文書は updatedAt（端末で変更した日時）の新しい方を正とする。
 * 権限：隊員の追加・異動・資格の確認は隊長（leader）と管理者（admin）。隊長の指名は管理者だけ。
 */
import { DocSchema } from './schema.js';
const KINDS = DocSchema.kinds;
const MAX_BODY = 2 * 1024 * 1024;
const FAIL_LIMIT_IP = 50; // 署の回線など、同じ場所から大勢がログインしても止めすぎない
const TOKEN_DAYS = 30;
const MAX_DATA = 64 * 1024;
const MAX_CHANGES = 500;
const PAGE = 500;
const FAIL_WINDOW_MS = 15 * 60 * 1000, FAIL_LIMIT = 10; // 職員番号ごと

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = s => b64url(enc.encode(s));
const unb64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
async function hmac(key, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}
async function sha256hex(text) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// 文字列の比較を、長さと中身で時間が変わらないように
function sameText(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
const okId = v => typeof v === 'string' && v.length > 0 && v.length <= 120 && !/[\u0000-\u001f<>"'`]/.test(v);
const okIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) && !isNaN(Date.parse(v));
const adminIds = env => String(env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

async function memberRow(env, id) {
  const r = await env.DB.prepare("SELECT data, deleted FROM docs WHERE kind = 'member' AND id = ?").bind(id).first();
  if (!r || r.deleted) return null;
  try { return { id, ...JSON.parse(r.data) }; } catch (e) { return null; }
}
// 役割：管理者 > 隊長 > 隊員。管理者は ADMIN_IDS で決まる（名簿に無くても入れる）
function roleOf(env, id, m) {
  if (adminIds(env).includes(id)) return 'admin';
  return m && m.role === 'leader' ? 'leader' : 'member';
}
const passVersion = async env => (await sha256hex('pv:' + env.TEAM_PASSCODE)).slice(0, 12);

async function issueToken(env, sub) {
  const body = b64urlText(JSON.stringify({ sub, pv: await passVersion(env), exp: Date.now() + TOKEN_DAYS * 86400000 }));
  return body + '.' + await hmac(env.SECRET_KEY, body);
}
// ログインの証明を確かめ、いまの名簿から役割を引き直す（異動・退職・隊長の指名がすぐ効く）
async function auth(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || !sameText(sig, await hmac(env.SECRET_KEY, body))) return null;
  let t; try { t = JSON.parse(unb64url(body)); } catch (e) { return null; }
  if (!t || typeof t.sub !== 'string' || !(t.exp > Date.now()) || t.pv !== await passVersion(env)) return null;
  const mem = await memberRow(env, t.sub);
  const role = roleOf(env, t.sub, mem);
  if (role !== 'admin' && (!mem || (mem.status || '在籍') !== '在籍')) return null;
  return { sub: t.sub, role, name: mem?.name || `職員番号 ${t.sub}`, renew: t.exp - Date.now() < 7 * 86400000 };
}

async function login(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  const now = Date.now();
  await env.DB.prepare('DELETE FROM login_fail WHERE at < ?').bind(now - FAIL_WINDOW_MS).run();
  let b; try { b = await req.json(); } catch (e) { b = {}; }
  const id = String(b.memberId || '').normalize('NFKC').trim().slice(0, 120);
  const byId = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_fail WHERE ip = ?').bind('id:' + id).first();
  const byIp = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_fail WHERE ip = ?').bind('ip:' + ip).first();
  if ((byId?.n || 0) >= FAIL_LIMIT || (byIp?.n || 0) >= FAIL_LIMIT_IP) return json({ error: 'ログインの失敗が続いたため、15分ほど待ってから試してください。' }, 429);
  const fail = async () => {
    await env.DB.batch([env.DB.prepare('INSERT INTO login_fail (ip, at) VALUES (?, ?)').bind('id:' + id, now), env.DB.prepare('INSERT INTO login_fail (ip, at) VALUES (?, ?)').bind('ip:' + ip, now)]);
    return json({ error: '職員番号かパスコードが違います。名簿に無い場合は、隊長に登録を頼んでください。' }, 401);
  };
  if (!okId(id) || !env.TEAM_PASSCODE || !sameText(String(b.passcode || ''), env.TEAM_PASSCODE)) return fail();
  const mem = await memberRow(env, id);
  const role = roleOf(env, id, mem);
  if (role !== 'admin' && (!mem || (mem.status || '在籍') !== '在籍')) return fail();
  return json({ token: await issueToken(env, id), member: { id, name: mem?.name || `職員番号 ${id}`, role } }, 200);
}

// 1件の変更を、権限に照らして確かめる。だめなら理由を返す
function checkChange(user, ch, cur) {
  const leader = user.role === 'leader' || user.role === 'admin';
  const d = ch.data || {}, old = cur ? cur.data : null;
  switch (ch.kind) {
    case 'member':
      if (!leader) return '隊員の追加・変更は隊長だけができます';
      if ((d.role || 'member') !== ((old && old.role) || 'member') && user.role !== 'admin') return '隊長の指名は管理者だけができます';
      if (ch.deleted && !leader) return '隊員の削除は隊長だけができます';
      return null;
    case 'qual': {
      const owner = ch.deleted ? old && old.memberId : d.memberId;
      const mine = owner === user.sub && (!old || old.memberId === user.sub);
      if (!leader && !mine) return '自分以外の資格・研修は入力できません';
      if (!leader && old && old.confirmedAt) return '確認済みの資格・研修は隊長だけが直せます';
      if (!leader && d.confirmedAt) return '資格の確認は隊長だけができます';
      return null;
    }
    default: return null; // 事案・潜水員・潜水は、ログインした隊員なら誰でも
  }
}

// 記録のある潜水員・事案は消させない（潜水中の人や、潜水の記録が消えるのを防ぐ）
async function guardDelete(env, ch, cur) {
  if (!ch.deleted || !cur || cur.deleted) return null;
  if (ch.kind === 'diver') {
    if (cur.data.current) return '潜水中の潜水員は外せません';
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind = 'dive' AND deleted = 0 AND json_extract(data, '$.incidentId') = ? AND json_extract(data, '$.memberId') = ?").bind(cur.data.incidentId, cur.data.memberId).first();
    if (n.n) return '潜水の記録がある潜水員は外せません';
  }
  if (ch.kind === 'incident') {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE kind IN ('dive', 'diver') AND deleted = 0 AND json_extract(data, '$.incidentId') = ? AND (kind = 'dive' OR json_extract(data, '$.current') IS NOT NULL)").bind(ch.id).first();
    if (n.n) return '潜水の記録がある事案は消せません';
  }
  return null;
}
async function sync(req, env, user) {
  if (Number(req.headers.get('Content-Length') || 0) > MAX_BODY) return json({ error: '一度に送る量が多すぎます。' }, 413);
  let b; try { b = await req.json(); } catch (e) { return json({ error: '形が正しくありません。' }, 400); }
  let since = Number.isInteger(b.since) && b.since >= 0 ? b.since : 0;
  // サーバーの番号より先を指していたら（データベースを作り直したときなど）、最初から送り直す
  const top0 = await env.DB.prepare("SELECT v FROM meta WHERE k = 'seq'").first();
  const reset = since > (top0?.v || 0);
  if (reset) since = 0;
  const changes = Array.isArray(b.changes) ? b.changes : [];
  if (changes.length > MAX_CHANGES) return json({ error: `一度に送れるのは${MAX_CHANGES}件までです。` }, 413);
  const rejected = [], now = new Date().toISOString();
  for (const ch of changes) {
    const key = { kind: ch && ch.kind, id: ch && ch.id };
    if (!ch || !KINDS.includes(ch.kind) || !okId(ch.id) || !okIso(ch.updatedAt) || typeof ch.data !== 'object' || ch.data === null || Array.isArray(ch.data)) { rejected.push({ ...key, reason: '形が正しくありません' }); continue; }
    const text = JSON.stringify(ch.data);
    if (text.length > MAX_DATA) { rejected.push({ ...key, reason: '大きすぎます' }); continue; }
    const cleaned = ch.deleted ? {} : DocSchema.clean(ch.kind, ch.data);
    if (!cleaned) { rejected.push({ ...key, reason: '形が正しくありません' }); continue; }
    // 端末の時計が大きく進んでいる変更は受け取らない（新しい方が勝つ仕組みを壊さないため）
    if (Date.parse(ch.updatedAt) > Date.now() + 10 * 60 * 1000) { rejected.push({ ...key, reason: '端末の時計が進んでいます。日時を合わせてください' }); continue; }
    const row = await env.DB.prepare('SELECT data, deleted, updated_at FROM docs WHERE kind = ? AND id = ?').bind(ch.kind, ch.id).first();
    const cur = row ? { data: JSON.parse(row.data), deleted: !!row.deleted, updatedAt: row.updated_at } : null;
    // 電波のない間の潜降（潜水中の潜水員）は、先に届いた「外す」より優先する（潜水中の人を消さない）
    const revive = cur && cur.deleted && !ch.deleted && ch.kind === 'diver' && cleaned.current;
    if (cur && cur.updatedAt >= ch.updatedAt && !revive) { rejected.push({ ...key, reason: 'stale' }); continue; } // サーバーの方が新しい（端末は次の取得で受け取る）
    const why = checkChange(user, { ...ch, data: cleaned }, cur) || await guardDelete(env, ch, cur);
    if (why) { rejected.push({ ...key, reason: why }); continue; }
    const data = { ...cleaned };
    if (ch.kind === 'qual' && data.confirmedAt && !(cur && cur.data.confirmedAt === data.confirmedAt)) { data.confirmedById = user.sub; data.confirmedBy = user.name; }
    const out = JSON.stringify(data);
    // 番号を取り、新しい方だけを書き、記録を残す、を1つの処理で行う（2台が同時に送っても古い方が残らない）
    const stamp = revive ? now : ch.updatedAt;
    const res = await env.DB.batch([
      env.DB.prepare("UPDATE meta SET v = v + 1 WHERE k = 'seq'"),
      env.DB.prepare(`INSERT INTO docs (kind, id, data, deleted, updated_at, updated_by, server_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT v FROM meta WHERE k = 'seq'))
        ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, updated_by = excluded.updated_by, server_at = excluded.server_at, seq = excluded.seq
        WHERE excluded.updated_at > docs.updated_at OR (? = 1 AND docs.deleted = 1)`).bind(ch.kind, ch.id, out, ch.deleted ? 1 : 0, stamp, user.sub, now, revive ? 1 : 0),
      env.DB.prepare(`INSERT INTO audit (seq, kind, id, deleted, updated_by, server_at, data) SELECT v, ?, ?, ?, ?, ?, ? FROM meta WHERE k = 'seq' AND v = (SELECT seq FROM docs WHERE kind = ? AND id = ?)`)
        .bind(ch.kind, ch.id, ch.deleted ? 1 : 0, user.sub, now, out, ch.kind, ch.id)
    ]);
    if (!res[1].meta.changes) { rejected.push({ ...key, reason: 'stale' }); continue; }
    // 潜水員・潜水が届いた事案が消されていたら、事案を戻す（電波のない間の記録を消さない）
    if (!ch.deleted && (ch.kind === 'diver' || ch.kind === 'dive')) {
      await env.DB.batch([
        env.DB.prepare("UPDATE meta SET v = v + 1 WHERE k = 'seq'"),
        env.DB.prepare("UPDATE docs SET deleted = 0, server_at = ?, seq = (SELECT v FROM meta WHERE k = 'seq') WHERE kind = 'incident' AND id = ? AND deleted = 1").bind(now, data.incidentId)
      ]);
    }
  }
  const rows = await env.DB.prepare('SELECT kind, id, data, deleted, updated_at, updated_by, seq FROM docs WHERE seq > ? ORDER BY seq LIMIT ?').bind(since, PAGE + 1).all();
  const list = rows.results || [];
  const more = list.length > PAGE;
  const page = list.slice(0, PAGE).map(r => ({ kind: r.kind, id: r.id, data: JSON.parse(r.data), deleted: !!r.deleted, updatedAt: r.updated_at, updatedBy: r.updated_by, seq: r.seq }));
  // 期限まで7日を切っていたら、新しい証明を渡す（使っている間は切れない）
  const token = user.renew ? await issueToken(env, user.sub) : undefined;
  return json({ seq: page.length ? page[page.length - 1].seq : since, changes: page, rejected, more, reset, me: { id: user.sub, name: user.name, role: user.role }, token, now: new Date().toISOString() }, 200);
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
