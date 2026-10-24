/* ===== 潜水現場記録 ===== */
(() => {
'use strict';
const BUILTIN_TABLE = JSON.parse(document.getElementById('builtin-table').textContent);
const BUILTIN_ID = 'builtin:' + BUILTIN_TABLE.version;
const LS_KEY = 'diveops.v1';
const APP_VERSION = '__APP_VERSION__';
const TZ = 'Asia/Tokyo';
const TYPES = ['災害', '訓練', '研修', 'その他'];

/* ---------- 小道具 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const nowISO = () => new Date().toISOString();
const fmtParts = (d, o) => new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, ...o }).formatToParts(new Date(d)).reduce((a, p) => (a[p.type] = p.value, a), {});
const ymd = d => { const p = fmtParts(d, { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}/${p.month}/${p.day}`; };
const ymdCompact = d => ymd(d).replaceAll('/', '');
const hm = d => { if (!d) return '—'; const p = fmtParts(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return `${p.hour}:${p.minute}`; };
const hms = d => { const p = fmtParts(d, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); return `${p.hour}:${p.minute}:${p.second}`; };
const md = d => { const p = fmtParts(d, { month: 'numeric', day: 'numeric', weekday: 'short' }); return `${p.month}/${p.day}（${p.weekday}）`; };
const minsBetween = (a, b) => (new Date(b) - new Date(a)) / 60000;
// 全角の数字・記号を半角に。数字として読めなければ NaN（空なら ''）
const toHalf = v => String(v ?? '').replace(/[０-９．－]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[ー−]/g, '-').trim();
const numOrBlank = v => { const s = toHalf(v).replace(/[^\d.\-]/g, ''); return toHalf(v) === '' ? '' : (s === '' || isNaN(Number(s)) ? NaN : Number(s)); };
function clockText(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
const hmText = min => { const m = Math.max(0, Math.floor(min)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
// 日本時間の HH:MM を、基準日時と同じ日付の ISO に変換
function isoFromHM(baseISO, hhmm) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const day = ymd(baseISO).replaceAll('/', '-');
  return new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`).toISOString();
}

/* ---------- 保存 ---------- */
function sampleState() {
  const members = [
    { id: 'S01', name: '見本 一郎', sample: true },
    { id: 'S02', name: '見本 二郎', sample: true },
    { id: 'S03', name: '見本 三郎', sample: true },
    { id: 'S04', name: '見本 四郎', sample: true }
  ];
  const base = new Date(Date.now() - 3 * 86400000);
  const at = (h, m) => isoFromHM(base.toISOString(), `${h}:${String(m).padStart(2, '0')}`);
  const inc = {
    id: uid(), sample: true, createdAt: at(9, 0), type: '訓練', title: '定期潜水訓練（見本）', site: '佐良浜漁港', commanderId: 'S01',
    memo: '', waterTemp: '26', visibility: '12', sea: '凪', strict: false, status: 'closed', closedAt: at(12, 0), tableId: BUILTIN_ID,
    divers: [
      { memberId: 'S02', tank: 10, sac: 20, current: null, nextFirst: false, dives: [
        { id: uid(), startAt: at(9, 20), endAt: at(10, 0), plannedDepth: 15, startP: 200, endP: 80, maxDepth: 14, adt: 37, safetyStop: true, condition: '無', note: '' },
        { id: uid(), startAt: at(11, 10), endAt: at(11, 38), plannedDepth: 12, startP: 200, endP: 110, maxDepth: 11, adt: 25, safetyStop: true, condition: '無', note: '' }] },
      { memberId: 'S03', tank: 10, sac: 20, current: null, nextFirst: false, dives: [
        { id: uid(), startAt: at(9, 20), endAt: at(9, 58), plannedDepth: 15, startP: 200, endP: 70, maxDepth: 15, adt: 35, safetyStop: true, condition: '無', note: '' }] }
    ]
  };
  return {
    v: 1,
    members,
    settings: { tank: 10, sac: 20, reserve: 50, startP: 200, theme: 'auto' },
    tables: { activeId: BUILTIN_ID, list: [] },
    incidents: [inc]
  };
}
let loadNote = '';
function load() {
  let raw = null;
  try { raw = localStorage.getItem(LS_KEY); } catch (e) { return sampleState(); }
  if (!raw) return sampleState();
  try { const s = JSON.parse(raw); if (s && s.v === 1 && Array.isArray(s.incidents)) return s; } catch (e) {}
  // 壊れた記録は消さずに別の場所へ退避してから始める
  try { localStorage.setItem(LS_KEY + '.broken.' + Date.now(), raw); } catch (e) {}
  loadNote = '前回の記録を読み込めませんでした。読めなかったデータは端末内に退避してあります。';
  return { ...sampleState(), members: [], incidents: [] };
}
let S = load();
S.settings = { lastBackup: null, ...S.settings };
let storageOK = true;
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); storageOK = true; }
  catch (e) { storageOK = false; }
  return storageOK;
}
let persisted = null;
try { navigator.storage?.persist?.().then(v => { persisted = v; }).catch(() => {}); } catch (e) {}

/* ---------- 潜水表 ---------- */
function allTables() { return [{ id: BUILTIN_ID, builtin: true, importedAt: null, data: BUILTIN_TABLE }, ...S.tables.list]; }
function tableById(id) { return allTables().find(t => t.id === id) || null; }
function activeTable() { return tableById(S.tables.activeId) || tableById(BUILTIN_ID); }
function tableLabel(t) { return t ? `${t.data.name}・${t.data.version}` : '—'; }
// 事案は始めたときの表で計算する（アプリの更新で内蔵表が変わっても、写しで計算を続ける）
function incidentTable(inc) {
  return tableById(inc.tableId) || (inc.tableSnap ? { id: inc.tableId, data: inc.tableSnap, snap: true } : { ...activeTable(), missing: true });
}

/* ---------- 計算 ---------- */
const member = id => S.members.find(m => m.id === id) || { id, name: `職員番号 ${id}` };
// 削除した潜水は計算から外す（本数は振り直さない）
const liveDives = dv => dv.dives.filter(d => !d.deleted);
function diverResults(inc, dv) {
  const t = incidentTable(inc).data;
  const out = [];
  let prev = null;
  dv.dives.forEach((d, i) => {
    if (d.deleted) { out.push({ deleted: true, no: i + 1, warnings: [], status: 'na' }); return; }
    const r = Engine.computeDive(t, prev, d, { strict: inc.strict });
    r.endAt = d.endAt; r.no = i + 1;
    out.push(r);
    prev = r;
  });
  return out;
}
const lastResult = res => [...res].reverse().find(r => !r.deleted) || null;
function diverState(dv) { return dv.current ? 'down' : (liveDives(dv).length ? 'rest' : 'wait'); }
function allowanceFor(inc, dv, at = nowISO()) {
  const t = incidentTable(inc).data;
  const prev = lastResult(diverResults(inc, dv));
  return Engine.allowance(t, prev, at, { forceFirst: dv.nextFirst, strict: inc.strict });
}
function limitFor(inc, dv, depth, startP, at) {
  const al = allowanceFor(inc, dv, at);
  const td = Engine.tableDepthFor(incidentTable(inc).data, depth);
  const row = al.ok ? al.rows.find(r => r.depth === td) : null;
  const tableLim = row ? row.limit : null;
  const air = Engine.airMinutes(dv.tank ?? S.settings.tank, startP, S.settings.reserve, depth, dv.sac ?? S.settings.sac);
  const airLim = air == null ? null : Math.floor(air);
  // 潜水表で決められないときは、空気の時間で代わりに埋めない（甘い上限を出さないため）
  let lim = null, by = null;
  if (tableLim == null) { lim = null; by = null; }
  else if (airLim != null && airLim < tableLim) { lim = airLim; by = '空気'; }
  else { lim = tableLim; by = '潜水表'; }
  return { al, td, tableLim, airLim, lim, by };
}

/* ---------- 画面の状態 ---------- */
let view = { name: 'home' };
let sheet = null;
function go(name, extra = {}, push = true) {
  view = { name, ...extra };
  sheet = null;
  if (push) { try { history.pushState({ view }, ''); } catch (e) {} }
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', e => { view = e.state?.view || { name: 'home' }; sheet = null; render(); });
try { history.replaceState({ view }, ''); } catch (e) {}
const curInc = () => S.incidents.find(i => i.id === view.incidentId);

/* ---------- 元に戻す ---------- */
let undoSnap = null, toastTimer = null;
function snapshot() { undoSnap = JSON.stringify(S); }
function toast(msg, undo = false) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button class="btn" data-act="undo">${ic('undo-2')}元に戻す</button>` : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; if (undo) undoSnap = null; }, undo ? 6000 : 2500);
}

/* ---------- 描画 ---------- */
function bar(title, sub, back, right = '') {
  return `<header class="bar"><div class="bar-in">
    ${back ? `<button class="btn btn-icon" data-act="back" aria-label="戻る">${ic('chevron-left')}</button>` : ''}
    <div class="bar-title">${title}${sub ? `<span class="bar-sub">${sub}</span>` : ''}</div>${right}</div></header>${globalAlerts()}`;
}
let updateReady = false;
function globalAlerts() {
  const a = [];
  const upd = updateReady && view.name !== 'board' ? `<div class="alert soft row">${ic('rotate-ccw')}<span class="spacer">新しい版があります。記録中でなければ更新してください。</span><button class="btn" data-act="reload">更新する</button></div>` : '';
  if (!storageOK) a.push('この端末に記録を保存できていません。このまま閉じると記録が消えます。紙にも控え、設定の「控えを作る」を試してください。');
  if (loadNote) a.push(loadNote);
  return a.length || upd ? `<div class="wrap wrap-alert">${a.map(t => `<div class="alert" role="alert">${ic('triangle-alert')}<span>${esc(t)}</span></div>`).join('')}${upd}</div>` : '';
}
function render() {
  applyTheme();
  const app = $('#app');
  const v = {
    home: viewHome, new: viewNew, board: viewBoard, summary: viewSummary,
    tables: viewTables, settings: viewSettings, calc: viewCalc
  }[view.name] || viewHome;
  app.innerHTML = v();
  renderSheet();
  tick();
  if (view.name === 'board') keepAwake(); else releaseAwake();
}
function renderSheet() {
  const box = $('#sheet');
  if (!sheet) { box.innerHTML = ''; box.hidden = true; document.body.style.overflow = ''; if (sheetOpener?.isConnected) sheetOpener.focus(); sheetOpener = null; return; }
  const fn = { down: sheetDown, up: sheetUp, diver: sheetDiver, edit: sheetEdit, addDiver: sheetAddDiver, editInc: sheetEditInc, clearSample: sheetClearSample }[sheet.name];
  const wasOpen = !box.hidden;
  box.innerHTML = `<div class="sheet-back" data-act="sheet-close-back"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">${fn()}</div></div>`;
  if (!wasOpen) { $('#sheet-title')?.focus(); $('#toast').hidden = true; }
  box.hidden = false;
  document.body.style.overflow = 'hidden';
}
let sheetOpener = null;
function openSheet(name, extra = {}) { sheetOpener = document.activeElement; sheet = { name, ...extra }; renderSheet(); }
function closeSheet() { sheet = null; renderSheet(); }
const sheetHead = t => `<div class="sheet-head"><h1 id="sheet-title" tabindex="-1">${t}</h1><button class="btn btn-icon" data-act="sheet-close" aria-label="閉じる">${ic('x')}</button></div>`;

/* ===== ホーム ===== */
function viewHome() {
  const active = S.incidents.filter(i => i.status === 'active');
  const past = S.incidents.filter(i => i.status !== 'active').sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const t = activeTable();
  const hasSample = S.members.some(m => m.sample) || S.incidents.some(i => i.sample);
  return `${bar('潜水現場記録', '宮古島市消防本部 潜水隊', false, `<button class="btn btn-icon" data-act="go" data-to="settings" aria-label="設定">${ic('settings')}</button>`)}
  <main class="wrap">
    ${backupHint()}
    ${active.length ? `<section class="stack"><h2>進行中</h2><div class="list">${active.map(incRow).join('')}</div></section>` : ''}
    <section class="stack">
      <button class="btn btn-primary btn-big btn-block" data-act="go" data-to="new">${ic('plus')}新しい事案を始める</button>
      <div class="grid2">
        <button class="btn" data-act="go" data-to="calc">${ic('calculator')}空気の計算</button>
        <button class="btn" data-act="go" data-to="tables">${ic('table-2')}潜水表</button>
      </div>
    </section>
    <section class="stack"><h2>これまでの事案</h2>
      ${past.length ? `<div class="list">${past.map(incRow).join('')}</div>` : '<p class="small">まだありません。終了した事案がここに並びます。</p>'}
    </section>
    <section class="stack small">
      <div class="badge-line">${ic(t.data.verified ? 'shield-check' : 'circle-alert')}<span>使用中の潜水表：${esc(tableLabel(t))}（${t.data.verified ? '照合済み' : '照合前'}）</span></div>
      ${hasSample ? `<div class="stack"><span>「見本」と付いた隊員と事案は動作確認用です。運用を始める前に消してください。</span><button class="btn" data-act="sheet" data-sheet="clearSample">${ic('trash-2')}見本を消す</button></div>` : ''}
    </section>
  </main>`;
}
function incTitle(inc) { return inc.title || `${inc.type} ${inc.site || ''} ${md(inc.createdAt)}`.replace(/\s+/g, ' ').trim(); }
function incRow(inc) {
  const n = inc.divers.reduce((a, d) => a + liveDives(d).length, 0);
  const down = inc.divers.filter(d => d.current).length;
  const unsent = !inc.sample && inc.status !== 'active' && n && (!inc.sentAt || inc.sentAt < (inc.updatedAt || ''));
  return `<button class="item" data-act="open-inc" data-id="${esc(inc.id)}">
    <div class="item-main">
      <div class="item-title">${esc(incTitle(inc))}${unsent ? ` <span class="state">${ic('send')}未送信</span>` : ''}</div>
      <div class="small">${md(inc.createdAt)} ${hm(inc.createdAt)}・${esc(inc.type)}・${esc(inc.site || '地点未入力')}・${inc.divers.length}人 ${n}本${down ? `・<b>潜水中 ${down}人</b>` : ''}</div>
    </div>${ic('chevron-right')}</button>`;
}
function backupHint() {
  const real = S.incidents.filter(i => !i.sample).length;
  if (!real) return '';
  const last = S.settings.lastBackup;
  const days = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;
  if (days != null && days < 30) return '';
  return `<div class="alert soft">${ic('hard-drive-download')}<span>${last ? `最後に控えを作ってから ${days}日たちました。` : 'まだ控えを作っていません。'}端末の故障に備えて、設定の「控えを作る」で記録をファイルに残してください。</span></div>`;
}

/* ===== 新しい事案 ===== */
let draft = null;
function viewNew() {
  if (!draft) draft = { type: '訓練', title: '', site: '', commanderId: '', watchId: '', gas: '空気', divers: [], strict: false };
  const sites = [...new Set(S.incidents.map(i => i.site).filter(Boolean))];
  return `${bar('新しい事案', '', true)}
  <main class="wrap">
    <section class="stack"><h2>区分</h2>
      <div class="chips">${TYPES.map(t => `<button class="chip" data-act="draft-type" data-v="${t}" aria-pressed="${draft.type === t}">${ic('check')}${t}</button>`).join('')}</div>
    </section>
    <section class="stack">
      <label class="field"><span>地点</span><input class="input" id="n-site" list="site-list" value="${esc(draft.site)}" placeholder="例：佐良浜漁港 北側岸壁" autocomplete="off"></label>
      <datalist id="site-list">${sites.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <label class="field"><span>事案名（あとで入力できます）</span><input class="input" id="n-title" value="${esc(draft.title)}" placeholder="例：定期潜水訓練"></label>
      <div class="grid2">
        <label class="field"><span>指揮者</span>${memberSelect('n-cmd', draft.commanderId)}</label>
        <label class="field"><span>監視員</span>${memberSelect('n-watch', draft.watchId)}</label>
      </div>
    </section>
    <section class="stack"><h2>潜水員（あとで追加できます）</h2>
      ${S.members.length ? `<div class="chips">${S.members.map(m => `<button class="chip" data-act="draft-diver" data-v="${esc(m.id)}" aria-pressed="${draft.divers.includes(m.id)}">${ic('check')}${esc(m.name)}</button>`).join('')}</div>`
        : `<p class="small">隊員が登録されていません。<button class="link" data-act="go" data-to="settings">設定で隊員を登録</button></p>`}
    </section>
    <label class="check"><input type="checkbox" id="n-strict" ${draft.strict ? 'checked' : ''}><span>低水温・重作業のため、計算を1段階厳しくする<br><span class="small">NAUIの使い方に沿って、グループを1つ重い側にします。</span></span></label>
  </main>
  <div class="dock"><div class="dock-in"><button class="btn btn-primary btn-big" data-act="start-inc">${ic('play')}記録を始める</button></div></div>`;
}
function readDraft() {
  if (!draft) return;
  draft.site = $('#n-site')?.value.trim() ?? draft.site;
  draft.title = $('#n-title')?.value.trim() ?? draft.title;
  draft.commanderId = $('#n-cmd')?.value ?? draft.commanderId;
  draft.watchId = $('#n-watch')?.value ?? draft.watchId;
  draft.strict = $('#n-strict')?.checked ?? draft.strict;
}

const memberSelect = (id, cur) => `<select class="input" id="${id}"><option value="">選ぶ</option>${S.members.map(m => `<option value="${esc(m.id)}" ${cur === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`;

/* ===== 潜水員ボード ===== */
function viewBoard() {
  const inc = curInc();
  if (!inc) return viewHome();
  const t = incidentTable(inc);
  return `${bar(esc(incTitle(inc)), `${inc.title ? `${esc(inc.type)}・${esc(inc.site || '地点未入力')}・` : ''}${hm(inc.createdAt)}開始${inc.commanderId ? `・指揮 ${esc(member(inc.commanderId).name)}` : ''}`, true,
    `<button class="btn btn-icon" data-act="sheet" data-sheet="editInc" aria-label="事案の情報">${ic('pencil')}</button>`)}
  <main class="wrap">
    ${inc.status !== 'active' ? `<div class="alert soft">${ic('info')}<span>この事案は終了しています。記録の修正はできます。</span></div>` : ''}
    ${t.missing ? `<div class="alert">${ic('triangle-alert')}<span>この事案を始めたときの潜水表が見つからないため、使用中の表で計算しています。</span></div>` : ''}
    <section>
      ${inc.divers.length ? `<div class="list">${inc.divers.map((dv, i) => diverRow(inc, dv, i)).join('')}</div>`
        : `<p>潜水員がまだいません。下の「潜水員を追加」から加えてください。</p>`}
    </section>
    <section class="row">
      <button class="btn" data-act="sheet" data-sheet="addDiver">${ic('user-plus')}潜水員を追加</button>
      <span class="spacer"></span>
      <span class="small badge-line">${ic(t.data.verified ? 'shield-check' : 'circle-alert')}${esc(tableLabel(t))}${inc.strict ? '・1段階厳しく' : ''}</span>
    </section>
  </main>
  <div class="dock"><div class="dock-in"><button class="btn btn-big" data-act="go-summary">${ic('flag')}${inc.status === 'active' ? '終了の手続きへ' : '記録を見る・送る'}</button></div></div>`;
}
function diverRow(inc, dv, i) {
  const st = diverState(dv);
  const m = member(dv.memberId);
  const res = diverResults(inc, dv);
  const last = lastResult(res);
  const n = liveDives(dv).length;
  let clock = '', info = '', btn = '', stateLabel = '';
  if (st === 'down') {
    const c = dv.current;
    const L = limitFor(inc, dv, c.plannedDepth, c.startP, c.startAt);
    stateLabel = c.ascentAt ? `<span class="state on">${ic('arrow-up')}浮上中 ${hm(c.ascentAt)}〜</span>` : `<span class="state on">${ic('arrow-down-to-line')}潜水中</span>`;
    clock = `<div class="clock" data-from="${esc(c.startAt)}">00:00</div>`;
    info = `<div>予定 ${c.plannedDepth ?? '—'}m・上限 <b class="num">${L.lim ?? '—'}分</b>${L.by ? `（${L.by}で決まる）` : '（潜水表で判断できません）'}</div>`;
    info += `<div class="remain" data-remain-from="${esc(c.startAt)}" data-limit="${L.lim ?? ''}" data-stop="${esc(c.ascentAt || '')}"></div>`;
    btn = c.ascentAt
      ? `<button class="btn btn-primary" data-act="sheet" data-sheet="up" data-i="${i}">${ic('arrow-up-from-line')}水面に着いた</button><button class="btn btn-quiet btn-under" data-act="ascent-undo" data-i="${i}">浮上開始を取り消す</button>`
      : `<button class="btn btn-primary" data-act="ascent" data-i="${i}">${ic('arrow-up')}浮上開始</button><button class="btn btn-quiet btn-under" data-act="sheet" data-sheet="up" data-i="${i}">もう水面にいる</button>`;
  } else if (st === 'rest') {
    const al = allowanceFor(inc, dv);
    stateLabel = `<span class="state">${ic('timer')}水面休息</span>`;
    clock = `<div class="clock" data-from="${esc(last.endAt)}" data-mode="hm">0:00</div>`;
    const g = last.group ? `グループ ${last.group}` : 'グループなし';
    if (al.ok) {
      const lastD = liveDives(dv).slice(-1)[0];
      const td = Engine.tableDepthFor(incidentTable(inc).data, lastD.plannedDepth ?? lastD.maxDepth);
      const row = al.rows.find(r => r.depth === td);
      info = `<div class="next">次に${td ?? '—'}mなら <b class="num">${row && row.limit ? row.limit + '分まで' : '潜れません'}</b></div>
        <div class="small">${g} → 今は${al.first ? '1本目扱い' : `グループ ${al.incoming}`}${inc.strict ? '・1段階厳しく' : ''}</div>`;
    } else info = `<div class="small">${g}・${esc(al.note || '')}</div>`;
    btn = `<button class="btn btn-primary" data-act="sheet" data-sheet="down" data-i="${i}">${ic('arrow-down-to-line')}潜降</button>`;
  } else {
    stateLabel = `<span class="state">待機</span>`;
    info = '<div class="small">まだ潜っていません</div>';
    btn = `<button class="btn btn-primary" data-act="sheet" data-sheet="down" data-i="${i}">${ic('arrow-down-to-line')}潜降</button>`;
  }
  const recentDel = dv.dives.some(d => d.deleted && Date.now() - new Date(d.endAt) < 86400000);
  if (recentDel) info += '<div class="small"><b>削除した潜水は計算に入っていません。</b>本当に潜った記録なら、削除を取り消すか指揮者が判断してください。</div>';
  const warn = last && (last.status === 'deco' || last.status === 'out' || last.omitted)
    ? `<div class="alert" style="grid-column:1/-1">${ic('triangle-alert')}<span>${esc(last.warnings.filter(w => w.level === 'stop').map(w => w.text).join(' ') || '判定を確認してください')}</span></div>` : '';
  return `<div class="diver">
    <button class="diver-head" data-act="sheet" data-sheet="diver" data-i="${i}"><span class="diver-name">${esc(m.name)}</span>${stateLabel}<span class="small">${st === 'down' ? `${n + 1}本目` : `${n}本`}${ic('chevron-right')}</span></button>
    <div class="diver-act">${btn}</div>
    ${clock}
    <div class="diver-info">${info}</div>
    ${warn}
  </div>`;
}

/* ----- 潜降 ----- */
function sheetDown() {
  const inc = curInc(), dv = inc.divers[sheet.i], m = member(dv.memberId);
  const t = incidentTable(inc).data;
  sheet.depth ??= liveDives(dv).length ? (liveDives(dv).slice(-1)[0].plannedDepth ?? null) : null;
  sheet.startP ??= S.settings.startP;
  sheet.tank ??= dv.tank ?? S.settings.tank;
  const L = sheet.depth != null ? limitFor(inc, dv, sheet.depth, sheet.startP, nowISO()) : null;
  const al = allowanceFor(inc, dv);
  return `${sheetHead(`${esc(m.name)}　${liveDives(dv).length + 1}本目の潜降`)}
  ${!al.ok ? `<div class="alert">${ic('triangle-alert')}<span>${esc(al.note)}${al.over ? '' : ''}</span></div>${al.over ? `<button class="btn" data-act="next-first" data-i="${sheet.i}">${ic('rotate-ccw')}1本目として扱う（指揮者判断）</button>` : ''}` : ''}
  <section class="stack"><h2>予定の最大水深</h2>
    <div class="chips chips-grid">${t.depths.map(d => `<button class="chip num" data-act="down-depth" data-v="${d}" aria-pressed="${sheet.depth === d}">${ic('check')}${d}m</button>`).join('')}</div>
  </section>
  <div class="grid2">
    <label class="field"><span>開始圧（気圧）</span><input class="input num" id="d-startp" inputmode="numeric" value="${esc(sheet.startP)}"></label>
    <label class="field"><span>タンク容量（L）</span><input class="input num" id="d-tank" inputmode="decimal" value="${esc(sheet.tank)}"></label>
  </div>
  ${L ? `<section class="stack">
    <div class="verdict">${ic('clock')}<span>${L.lim == null ? '潜水表で上限を決められません' : `この潜水の上限 <span class="num">${L.lim}</span>分`}</span></div>
    <p class="small">計算の目安です。ダイブコンピュータと指揮者の判断を優先してください。</p>
    <dl class="kv small"><dt>潜水表</dt><dd class="num">${L.tableLim ?? '—'}分（表の水深 ${L.td ?? '—'}m${L.al.ok && !L.al.first ? `・グループ ${L.al.incoming}` : ''}）</dd>
    <dt>空気</dt><dd class="num">${L.airLim ?? '—'}分（残圧 ${S.settings.reserve}気圧を残す・消費 ${dv.sac ?? S.settings.sac}L/分）</dd></dl>
    ${L.tableLim === 0 ? `<div class="alert">${ic('triangle-alert')}<span>潜水表ではこの水深に潜れる時間がありません。</span></div>` : ''}
    ${L.al.ok && !L.al.first && L.al.rows.find(r => r.depth === L.td)?.avoid ? `<div class="alert soft">${ic('info')}<span>${incidentTable(inc).data.rules.avoidRepetitiveDeeperThan}mより深い反復潜水は避けるよう、潜水表に記載があります。</span></div>` : ''}
  </section>` : '<p class="small">水深を選ぶと、潜れる時間を表示します。</p>'}
  ${sheet.depth == null ? `<button class="btn btn-primary btn-big btn-block" disabled>${ic('arrow-down-to-line')}予定の水深を選んでください</button>`
    : `<button class="btn btn-primary btn-big btn-block" data-act="do-down">${ic('arrow-down-to-line')}潜降を記録（<span data-now>${hm(nowISO())}</span>）</button>`}`;
}

/* ----- 浮上 ----- */
function upDefaults(inc, dv) {
  const c = dv.current, t = incidentTable(inc).data;
  const stopMin = t.rules?.safetyStopMinutes ?? 3;
  const endAt = sheet.endTouched ? sheet.endAt : nowISO();
  const ascentAt = sheet.ascentTouched ? sheet.ascentAt : (c.ascentAt || null);
  const elapsed = Math.ceil(minsBetween(c.startAt, endAt));
  // NAUIの潜水時間は、潜降開始から浮上開始まで。浮上開始がなければ経過時間から安全停止の分を引いた目安（安全停止を選ぶまでは引かない）
  const adt = ascentAt ? Math.max(1, Math.ceil(minsBetween(c.startAt, ascentAt))) : Math.max(1, elapsed - (sheet.safety === '有' ? stopMin : 0));
  return { endAt, ascentAt, elapsed, adt, stopMin };
}
function upDive(inc, dv) {
  const c = dv.current, dec = numOrBlank(sheet.decoStop);
  return { maxDepth: numOrBlank(sheet.maxDepth) === '' ? null : numOrBlank(sheet.maxDepth), adt: numOrBlank(sheet.adt) === '' ? null : numOrBlank(sheet.adt),
    startAt: c.startAt, endAt: upDefaults(inc, dv).endAt, treatAsFirst: dv.nextFirst, decoStopDone: dec === '' ? null : dec };
}
function upResult(inc, dv) { return Engine.computeDive(incidentTable(inc).data, lastResult(diverResults(inc, dv)), upDive(inc, dv), { strict: inc.strict }); }
function sheetUp() {
  const inc = curInc(), dv = inc.divers[sheet.i], m = member(dv.memberId), c = dv.current;
  if (!sheet.init) {
    sheet.init = true; sheet.safety = null; sheet.endTouched = false; sheet.ascentTouched = false;
    sheet.maxDepth = ''; sheet.endP = ''; sheet.cond = null; sheet.note = ''; sheet.decoStop = ''; sheet.adtTouched = false;
  }
  const u = upDefaults(inc, dv);
  if (!sheet.adtTouched) sheet.adt = String(u.adt);
  const r = upResult(inc, dv);
  sheet.shown = r.status;
  const pd = Number(c.plannedDepth);
  const quick = isFinite(pd) && pd > 0 ? [pd - 2, pd - 1, pd, pd + 1, pd + 2].filter(x => x > 0) : [];
  const ascLong = u.ascentAt && minsBetween(u.ascentAt, u.endAt) > 15;
  return `${sheetHead(`${esc(m.name)}　${liveDives(dv).length + 1}本目の浮上`)}
  <p class="small num">潜降 ${hm(c.startAt)}・予定 ${c.plannedDepth ?? '—'}m</p>
  <div class="grid3">
    <label class="field"><span>浮上開始</span><input class="input num" id="u-asc" type="time" value="${u.ascentAt ? hm(u.ascentAt) : ''}" data-live></label>
    <label class="field"><span>水面に着いた</span><input class="input num" id="u-end" type="time" value="${hm(u.endAt)}" data-live></label>
    <label class="field"><span>潜水時間（分）</span><input class="input num" id="u-adt" inputmode="numeric" value="${esc(sheet.adt)}" data-live></label>
  </div>
  <p class="small">${u.ascentAt ? '潜水時間は、潜降から浮上開始までです。' : '浮上開始の時刻がないため、潜水時間は経過時間からの目安です。浮上開始の時刻を入れると正確になります。'}</p>
  ${ascLong ? `<div class="alert soft">${ic('info')}<span>浮上開始から水面まで ${Math.round(minsBetween(u.ascentAt, u.endAt))}分あります。浮上開始の時刻を確かめてください。</span></div>` : ''}
  <div class="field"><span>最大水深（m）<b>必須</b></span>
    <input class="input num" id="u-depth" inputmode="decimal" value="${esc(sheet.maxDepth)}" placeholder="深度計の最大値" data-live>
    ${quick.length ? `<div class="chips chips-grid5">${quick.map(x => `<button class="chip num" data-act="up-depth" data-v="${x}" aria-pressed="${String(sheet.maxDepth) === String(x)}">${ic('check')}${x}m</button>`).join('')}</div>` : ''}
  </div>
  <section class="stack" id="u-result">${resultBlock(r)}</section>
  <div class="field"><span>5mで${u.stopMin}分の安全停止<b>必須</b></span><div class="chips">${['有', '無'].map(v => `<button class="chip" data-act="up-safety" data-v="${v}" aria-pressed="${sheet.safety === v}">${ic('check')}${v}</button>`).join('')}</div></div>
  ${r.status === 'deco' ? `<label class="field"><span>5mで実際に止まった時間（分）<b>必須</b></span><input class="input num" id="u-deco" inputmode="numeric" value="${esc(sheet.decoStop)}" placeholder="表では ${r.stop5}分" data-live></label>` : ''}
  <div class="grid2">
    <label class="field"><span>終了圧（気圧）</span><input class="input num" id="u-endp" inputmode="numeric" value="${esc(sheet.endP)}"></label>
    <div class="field"><span>体調異常<b>必須</b></span><div class="chips">${['無', '有'].map(v => `<button class="chip" data-act="up-cond" data-v="${v}" aria-pressed="${sheet.cond === v}">${ic('check')}${v}</button>`).join('')}</div></div>
  </div>
  <label class="field"><span>${sheet.cond === '有' ? '体調異常の内容' : '備考'}</span><input class="input" id="u-note" value="${esc(sheet.note)}" placeholder="${sheet.cond === '有' ? '例：右耳の違和感。浮上後に回復' : '例：視界不良のため早めに浮上'}"></label>
  <button class="btn btn-primary btn-big btn-block" data-act="do-up">${ic('arrow-up-from-line')}浮上を記録</button>`;
}
function resultBlock(r) {
  if (!r || r.status === 'na') return `<p class="small">最大水深と潜水時間を入れると判定を表示します。</p>${(r?.warnings || []).map(w => `<div class="alert">${ic('triangle-alert')}<span>${esc(w.text)}</span></div>`).join('')}`;
  const verdict = { ok: [ 'circle-check', '無減圧' ], deco: [ 'triangle-alert', `減圧停止 5mで${r.stop5}分` ], out: [ 'triangle-alert', '表の範囲外' ] }[r.status] || ['info', '—'];
  return `<div class="verdict">${ic(verdict[0])}<span>${verdict[1]}</span></div>
    <div class="result">
      <div><b>${r.group ?? '—'}</b><span>グループ</span></div>
      <div><b>${r.tnt ?? '—'}</b><span>合計窒素時間（分）</span></div>
      <div><b>${r.amdt ?? '—'}</b><span>上限（分）</span></div>
    </div>
    ${r.warnings.map(w => `<div class="alert ${w.level === 'stop' ? '' : 'soft'}">${ic(w.level === 'stop' ? 'triangle-alert' : 'info')}<span>${esc(w.text)}</span></div>`).join('')}
    <p class="small">潜水表による計算の目安です。ダイブコンピュータと指揮者の判断を優先してください。</p>`;
}

/* ----- 潜水員の詳細 ----- */
const after14h = iso => hm(new Date(new Date(iso).getTime() + 14 * 3600000).toISOString());
function diveLine(d, r, k, act) {
  if (d.deleted) return `<div class="item dive-line is-deleted"><div class="item-main"><div class="item-title">${k + 1}本目（削除済み）</div><div class="small num">${hm(d.startAt)}→${hm(d.endAt)}・${d.maxDepth ?? '—'}m・${d.adt ?? '—'}分</div></div></div>`;
  const alertish = r.status === 'deco' || r.status === 'out' || d.condition === '有';
  return `<button class="item dive-line" ${act}>
    <div class="item-main">
      <div class="item-title num">${alertish ? ic('triangle-alert') : ''}${k + 1}本目　${hm(d.startAt)}→${hm(d.endAt)}　${d.maxDepth ?? '—'}m　${d.adt ?? '—'}分</div>
      <div class="small">グループ ${r.group ?? '—'}・${statusText(r)}${d.condition === '有' ? '・<b>体調異常 有</b>' : ''}${d.edits?.length ? `・修正${d.edits.length}回` : ''}${d.treatAsFirst ? '・1本目扱い' : ''}</div>
    </div>${act ? ic('pencil') : ''}</button>`;
}
function sheetDiver() {
  const inc = curInc(), dv = inc.divers[sheet.i], m = member(dv.memberId);
  const res = diverResults(inc, dv);
  const al = dv.current ? null : allowanceFor(inc, dv);
  const lastD = liveDives(dv).slice(-1)[0];
  return `${sheetHead(esc(m.name))}
  <section class="stack"><h2>潜水の記録</h2>
  ${dv.dives.length ? `<div class="list">${dv.dives.map((d, k) => diveLine(d, res[k], k, `data-act="sheet" data-sheet="edit" data-i="${sheet.i}" data-k="${k}" aria-label="${k + 1}本目を修正"`)).join('')}</div>` : '<p class="small">まだ潜っていません。</p>'}
  ${lastD ? `<p class="small">浮上から14時間（${after14h(lastD.endAt)} まで）は、重激な業務を避けてください（高圧則 第18条）。</p>` : ''}
  </section>
  ${al ? `<section class="stack"><h2>今から潜る場合の上限</h2>
    ${al.ok ? `<p class="small">${al.first ? '1本目として計算' : `休息 ${hmText(al.siMin)}・グループ ${al.incoming}`}${inc.strict ? '・1段階厳しく' : ''}</p>
    <div class="tablebox"><table class="t"><thead><tr><th>表の水深</th><th>残留窒素（分）</th><th>潜れる時間（分）</th></tr></thead><tbody>
    ${al.rows.map(r => `<tr><td>${r.depth}m</td><td>${r.rnt ?? '—'}</td><td>${r.limit ? r.limit : (r.noData ? '記載なし（0）' : '0')}${r.avoid ? '・避ける' : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="small">「記載なし」は表に数値がない水深で、潜らない扱いです。「避ける」は表に「30mより深い反復潜水は避ける」とある水深です。</p>`
    : `<div class="alert">${ic('triangle-alert')}<span>${esc(al.note)}</span></div>${al.over ? `<button class="btn" data-act="next-first" data-i="${sheet.i}">${ic('rotate-ccw')}1本目として扱う（指揮者判断）</button>` : ''}`}
  </section>` : ''}
  ${dv.nextFirst ? `<p class="small">次の潜水は1本目として扱います（指揮者判断）。<button class="link" data-act="next-first-off" data-i="${sheet.i}">取り消す</button></p>` : ''}
  ${!dv.dives.length && !dv.current ? `<button class="btn" data-act="remove-diver" data-i="${sheet.i}">${ic('trash-2')}この事案から外す</button>` : ''}`;
}
function statusText(r) { return r.deleted ? '削除' : (({ ok: '無減圧', deco: `減圧 ${r.stop5}分`, out: '範囲外', na: '—' })[r.status] || '—'); }

/* ----- 記録の修正（前の値と日時を履歴に残す） ----- */
function sheetEdit() {
  const inc = curInc(), dv = inc.divers[sheet.i], d = dv.dives[sheet.k];
  return `${sheetHead(`${esc(member(dv.memberId).name)}　${sheet.k + 1}本目を修正`)}
  <div class="grid2">
    <label class="field"><span>潜降時刻</span><input class="input num" id="e-start" type="time" value="${hm(d.startAt)}"></label>
    <label class="field"><span>水面に着いた時刻</span><input class="input num" id="e-end" type="time" value="${hm(d.endAt)}"></label>
    <label class="field"><span>最大水深（m）</span><input class="input num" id="e-depth" inputmode="decimal" value="${esc(d.maxDepth ?? '')}"></label>
    <label class="field"><span>潜水時間（分）</span><input class="input num" id="e-adt" inputmode="numeric" value="${esc(d.adt ?? '')}"></label>
    <label class="field"><span>開始圧（気圧）</span><input class="input num" id="e-startp" inputmode="numeric" value="${esc(d.startP ?? '')}"></label>
    <label class="field"><span>終了圧（気圧）</span><input class="input num" id="e-endp" inputmode="numeric" value="${esc(d.endP ?? '')}"></label>
  </div>
  <div class="field"><span>体調異常</span><div class="chips">${['無', '有'].map(v => `<button class="chip" data-act="edit-cond" data-v="${v}" aria-pressed="${(sheet.cond ?? d.condition) === v}">${ic('check')}${v}</button>`).join('')}</div></div>
  <label class="field"><span>備考</span><input class="input" id="e-note" value="${esc(d.note ?? '')}"></label>
  <label class="field"><span>直す・削除する理由<b>必須</b></span><input class="input" id="e-why" placeholder="例：深度計の読み違い"></label>
  ${d.edits?.length ? `<details><summary class="small"><b>これまでの修正（${d.edits.length}回）</b></summary><ul class="small">${d.edits.map(x => `<li>${ymd(x.at)} ${hm(x.at)}　${esc(x.why || '')}（前：${esc(x.before)}）</li>`).join('')}</ul></details>` : ''}
  <button class="btn btn-primary btn-big btn-block" data-act="save-edit">${ic('check')}修正を保存</button>
  <hr class="rule">
  <button class="btn btn-quiet" data-act="delete-dive">${ic('trash-2')}この記録を削除（削除した記録も署へ送るCSVに残ります）</button>`;
}
const diveSummary = d => `${hm(d.startAt)}→${hm(d.endAt)} ${d.maxDepth ?? '—'}m ${d.adt ?? '—'}分 開始圧${d.startP ?? '—'} 終了圧${d.endP ?? '—'} 体調${d.condition || '—'}`;

/* ----- 見本を消す ----- */
function sheetClearSample() {
  const sm = S.members.filter(m => m.sample), ids = sm.map(m => m.id);
  const si = S.incidents.filter(i => i.sample);
  const mixed = S.incidents.filter(i => !i.sample && (ids.includes(i.commanderId) || ids.includes(i.watchId) || i.divers.some(d => ids.includes(d.memberId))));
  return `${sheetHead('見本を消す')}
  <p>見本の隊員 ${sm.length}人と、見本の事案 ${si.length}件を消します。</p>
  ${mixed.length ? `<div class="alert">${ic('triangle-alert')}<span>見本の隊員が入った、自分で作った事案が ${mixed.length}件あります（${mixed.map(i => esc(incTitle(i))).join('、')}）。これらも消します。</span></div>` : ''}
  <button class="btn btn-primary btn-big btn-block" data-act="clear-sample">${ic('trash-2')}見本を消す</button>`;
}

/* ----- 潜水員の追加 ----- */
function sheetAddDiver() {
  const inc = curInc();
  const inIds = inc.divers.map(d => d.memberId);
  const cand = S.members.filter(m => !inIds.includes(m.id));
  return `${sheetHead('潜水員を追加')}
  ${cand.length ? `<div class="list">${cand.map(m => `<button class="item" data-act="add-diver" data-v="${esc(m.id)}"><div class="item-main"><div class="item-title">${esc(m.name)}</div><div class="small num">職員番号 ${esc(m.id)}</div></div>${ic('plus')}</button>`).join('')}</div>`
    : `<p>追加できる隊員がいません。<button class="link" data-act="go" data-to="settings">設定で隊員を登録</button></p>`}`;
}

/* ----- 事案情報の編集 ----- */
function sheetEditInc() {
  const inc = curInc();
  return `${sheetHead('事案の情報')}
  <div class="chips">${TYPES.map(t => `<button class="chip" data-act="inc-type" data-v="${t}" aria-pressed="${(sheet.type ?? inc.type) === t}">${ic('check')}${t}</button>`).join('')}</div>
  <label class="field"><span>事案名</span><input class="input" id="i-title" value="${esc(inc.title)}"></label>
  <label class="field"><span>地点</span><input class="input" id="i-site" value="${esc(inc.site)}"></label>
  <div class="grid2">
    <label class="field"><span>指揮者</span>${memberSelect('i-cmd', inc.commanderId)}</label>
    <label class="field"><span>監視員</span>${memberSelect('i-watch', inc.watchId)}</label>
  </div>
  <label class="field"><span>呼吸ガス</span><input class="input" id="i-gas" value="${esc(inc.gas ?? '空気')}"></label>
  <div class="grid3">
    <label class="field"><span>水温（℃）</span><input class="input num" id="i-temp" inputmode="decimal" value="${esc(inc.waterTemp)}"></label>
    <label class="field"><span>透視度（m）</span><input class="input num" id="i-vis" inputmode="decimal" value="${esc(inc.visibility)}"></label>
    <label class="field"><span>海況</span><input class="input" id="i-sea" value="${esc(inc.sea)}" placeholder="例：凪"></label>
  </div>
  <label class="field"><span>備考</span><textarea class="input" id="i-memo">${esc(inc.memo)}</textarea></label>
  <button class="btn btn-primary btn-big btn-block" data-act="save-inc">${ic('check')}保存</button>
  ${inc.status === 'active' && !inc.divers.some(d => d.dives.length || d.current) ? `<button class="btn" data-act="delete-inc">${ic('trash-2')}この事案を削除</button>` : ''}`;
}

/* ===== 終了・送る ===== */
function viewSummary() {
  const inc = curInc();
  if (!inc) return viewHome();
  const rows = csvRows(inc);
  const live = rows.filter(r => !r.deleted);
  const downNow = inc.divers.filter(d => d.current).map(d => member(d.memberId).name);
  const active = inc.status === 'active';
  const missing = [!inc.site && '地点', !inc.commanderId && '指揮者', !inc.watchId && '監視員'].filter(Boolean);
  return `${bar(active ? '終了の手続き' : '記録と送信', esc(incTitle(inc)), true)}
  <main class="wrap">
    <section class="stack">
      <h1><span class="u">${esc(incTitle(inc))}</span></h1>
      <dl class="kv">
        <dt>日時</dt><dd>${ymd(inc.createdAt)} ${hm(inc.createdAt)}〜${inc.closedAt ? hm(inc.closedAt) : ''}</dd>
        <dt>区分・地点</dt><dd>${esc(inc.type)}・${esc(inc.site || '未入力')}</dd>
        <dt>指揮者</dt><dd>${esc(inc.commanderId ? member(inc.commanderId).name : '未入力')}</dd>
        <dt>監視員</dt><dd>${esc(inc.watchId ? member(inc.watchId).name : '未入力')}</dd>
        <dt>呼吸ガス</dt><dd>${esc(inc.gas ?? '空気')}</dd>
        <dt>海況</dt><dd>水温 ${esc(inc.waterTemp || '—')}℃・透視度 ${esc(inc.visibility || '—')}m・${esc(inc.sea || '—')}</dd>
        <dt>潜水表</dt><dd>${esc(tableLabel(incidentTable(inc)))}</dd>
      </dl>
      <button class="btn" data-act="sheet" data-sheet="editInc">${ic('pencil')}事案の情報を直す</button>
    </section>
    <section class="stack"><h2>潜水の記録（${live.length}本）</h2>
      ${rows.length ? `<div class="list">${rows.map(r => diveLine(r, r.res, r.no - 1, '').replace(/(<div class="item-title[^>]*>)/, `$1${esc(r.name)}　`)).join('')}</div>` : '<p class="small">記録がありません。</p>'}
    </section>
    ${active ? `<section class="stack"><h2>1. 終了</h2>
      ${downNow.length ? `<div class="alert">${ic('triangle-alert')}<span>まだ水中の人がいます：${esc(downNow.join('、'))}。浮上を記録してから終了してください。</span></div>` : ''}
      ${missing.length ? `<div class="alert soft">${ic('info')}<span>${missing.join('・')}が未入力です。「事案の情報を直す」から入れられます。</span></div>` : ''}
      <button class="btn btn-primary btn-big btn-block" data-act="close-inc" ${downNow.length ? 'disabled' : ''}>${ic('flag')}事案を終了する（${hm(nowISO())}）</button>
    </section>` : ''}
    <section class="stack"><h2 id="send-head">${active ? '2. 署へ送る' : '次：署へ送る'}</h2>
      ${active ? '<p class="small">事案を終了すると送れます（終了時刻もCSVに入ります）。</p>'
        : `<p class="small">CSVファイル（潜水管理台帳で取り込む形式）を作ります。「メールで送る」を押し、共有先でメールを選んでください。${inc.sentAt ? `<br><b>前回送った日時：${ymd(inc.sentAt)} ${hm(inc.sentAt)}</b>${inc.updatedAt > inc.sentAt ? '（そのあと記録を直しています。もう一度送ってください）' : ''}` : ''}</p>`}
      <button class="btn ${active ? '' : 'btn-primary'} btn-big btn-block" data-act="share-csv" ${rows.length && !active ? '' : 'disabled'}>${ic('mail')}メールで送る</button>
      <div class="grid2">
        <button class="btn" data-act="save-csv" ${rows.length && !active ? '' : 'disabled'}>${ic('download')}保存</button>
        <button class="btn" data-act="copy-csv" ${rows.length && !active ? '' : 'disabled'}>${ic('copy')}コピー</button>
      </div>
      <textarea class="input small" id="csv-fallback" hidden readonly></textarea>
    </section>
    ${!active ? `<section class="stack"><button class="btn btn-block" data-act="reopen-inc">${ic('rotate-ccw')}記録を再開する</button></section>` : ''}
  </main>`;
}
function csvRows(inc) {
  const out = [];
  inc.divers.forEach(dv => {
    const res = diverResults(inc, dv);
    dv.dives.forEach((d, k) => {
      const r = res[k];
      out.push({ ...d, memberId: dv.memberId, name: member(dv.memberId).name, no: k + 1, tank: d.tank ?? dv.tank ?? S.settings.tank,
        si: r.siMin != null ? Math.floor(r.siMin) : '', res: r });
    });
  });
  return out.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)) || String(a.memberId).localeCompare(String(b.memberId)));
}
// 列の並びは台帳マクロ（ledger/make_bas.py）の取り込みと対になっている。片方だけ変えない
const CSV_HEAD = ['日付', '職員番号', '氏名', '区分', '事案・訓練名', '地点', '最大水深(m)', '潜水時間(分)', '前の潜水からの水面休息(分)', 'タンク容量(L)', '開始圧(気圧)', '終了圧(気圧)', '水温(℃)', '透視度(m)', '減圧停止(表の判定)', '体調異常', '指揮者', '備考',
  '事案ID', '本数', '潜降時刻', '浮上時刻', '表の水深(m)', 'グループ', '残留窒素時間(分)', '合計窒素時間(分)', '最大潜水時間(分)', '修正最大潜水時間(分)', '判定', '5m減圧停止(分)', '潜水表', '海況', '事案備考', '事案開始', '事案終了',
  '記録ID', '状態', '予定水深(m)', '浮上開始時刻', '安全停止', '浮上停止の水深(m)', '浮上停止の時間(分)', '平均浮上速度(m/分)', '呼吸ガス', '監視員', '1本目扱い', '修正記録', '記録更新日時'];
function ascentRate(d) {
  if (!d.ascentAt || !d.maxDepth) return '';
  const mins = minsBetween(d.ascentAt, d.endAt) - (d.stopMin || 0);
  return mins > 0 ? Math.round(d.maxDepth / mins * 10) / 10 : '';
}
function buildCSV(inc) {
  const t = incidentTable(inc);
  // カンマ・引用符・改行を囲む。= + - @ で始まる文字は、Excelで直接開いても数式にならないよう ' を付ける
  const q = v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = v => (v == null || v === '' ? '' : Number(v));
  const lines = [CSV_HEAD.map(q).join(',')];
  csvRows(inc).forEach(r => {
    const x = r.res;
    const edits = r.edits?.length ? `${r.edits.length}回・最終 ${ymd(r.edits[r.edits.length - 1].at)} ${hm(r.edits[r.edits.length - 1].at)}` : '';
    lines.push([ymd(r.startAt), String(r.memberId), r.name, inc.type, inc.title, inc.site, num(r.maxDepth), num(r.adt), r.si, num(r.tank), num(r.startP), num(r.endP), inc.waterTemp, inc.visibility,
      x.status === 'deco' ? '有' : '無', r.condition || '', inc.commanderId ? member(inc.commanderId).name : '', r.note || '',
      inc.id, r.no, hm(r.startAt), hm(r.endAt), x.tableDepth ?? '', x.group ?? '', x.rnt ?? '', x.tnt ?? '', x.mdt ?? '', x.amdt ?? '', statusText(x), x.stop5 ?? '', tableLabel(t), inc.sea, inc.memo,
      `${ymd(inc.createdAt)} ${hm(inc.createdAt)}`, inc.closedAt ? `${ymd(inc.closedAt)} ${hm(inc.closedAt)}` : '',
      r.id, r.deleted ? '削除' : '記録', num(r.plannedDepth), r.ascentAt ? hm(r.ascentAt) : '', r.safetyStop ? '有' : '無', ...(r.stopMin || r.decoStopDone != null ? [5, num(r.stopMin)] : ['', '']), ascentRate(r),
      inc.gas ?? '空気', inc.watchId ? member(inc.watchId).name : '', r.treatAsFirst ? '指揮者判断' : '', edits,
      `${ymd(r.updatedAt || r.endAt)} ${hms(r.updatedAt || r.endAt)}`].map(q).join(','));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}
const csvName = inc => `潜水記録_${ymdCompact(inc.createdAt)}_${incTitle(inc).replace(/[\\/:*?"<>|\s]/g, '')}.csv`;

/* ===== 潜水表 ===== */
let pending = null; // 読み込んだ表（切り替え前）
function viewTables() {
  const act = activeTable();
  const v = Engine.validate(act.data);
  return `${bar('潜水表', '', true)}
  <main class="wrap">
    <section class="stack">
      <h1><span class="u">${esc(act.data.name)}</span></h1>
      <dl class="kv">
        <dt>版</dt><dd>${esc(act.data.version)}</dd>
        <dt>照合</dt><dd>${act.data.verified ? `照合済み（${esc(act.data.verifiedBy || '確認者未記入')}）` : '照合前。正本との照合が必要です'}</dd>
        <dt>更新日</dt><dd>${esc(act.data.updatedAt || '—')}</dd>
        <dt>出典</dt><dd>${esc(act.data.source || '—')}</dd>
      </dl>
      ${(act.data.notes || []).length ? `<ul class="small notes">${act.data.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <p class="small">アプリの判定は計算の目安です。ダイブコンピュータと指揮者の判断を優先してください。進行中の事案は、始めたときの表のまま計算します。</p>
    </section>
    <section class="stack"><h2>自動点検（${v.warnings.length}件）</h2>
      ${v.warnings.length ? `<div class="list">${v.warnings.map(w => `<div class="row" style="padding-block:.6rem">${ic('circle-alert')}<span class="small" style="flex:1;min-width:0">${esc(w.text)}</span></div>`).join('')}</div>`
        : '<p class="small">足し算の合わない箇所や、並びのおかしい箇所は見つかりませんでした。</p>'}
    </section>
    <section class="stack"><h2>最大潜水時間（1本目）</h2>
      <div class="tablebox"><table class="t"><thead><tr>${act.data.depths.map(d => `<th>${esc(d)}m</th>`).join('')}</tr></thead><tbody><tr>${act.data.depths.map(d => `<td>${esc(act.data.mdt[d])}</td>`).join('')}</tr></tbody></table></div>
    </section>
    <section class="stack"><h2>表の差し替え</h2>
      <p class="small">Excelから書き出した潜水表ファイル（.json）を読み込みます。点検して、変わる箇所を確かめてから切り替えます。</p>
      <label class="btn btn-block">${ic('upload')}潜水表ファイルを読み込む<input type="file" id="table-file" accept=".json,application/json" hidden></label>
      ${pending ? pendingBlock() : ''}
      <button class="btn btn-block" data-act="export-table">${ic('download')}使用中の表を書き出す</button>
    </section>
    <section class="stack"><h2>保存している版</h2>
      <div class="list">${allTables().map(t => `<div class="row" style="padding-block:.75rem">
        <div class="item-main"><div class="item-title">${esc(tableLabel(t))}</div><div class="small">${t.builtin ? 'アプリに内蔵' : `読み込み ${ymd(t.importedAt)}`}${t.id === act.id ? '・使用中' : ''}</div></div>
        ${t.id !== act.id ? `<button class="btn" data-act="use-table" data-id="${esc(t.id)}">この版を使う</button>` : `<span class="state active">${ic('check')}使用中</span>`}
        ${!t.builtin && t.id !== act.id ? `<button class="btn btn-icon" data-act="del-table" data-id="${esc(t.id)}" aria-label="この版を削除">${ic('trash-2')}</button>` : ''}
      </div>`).join('')}</div>
    </section>
  </main>`;
}
function pendingBlock() {
  const { data, check, changes, error } = pending;
  if (error) return `<div class="alert">${ic('triangle-alert')}<span>${esc(error)}</span></div>`;
  if (check.errors.length) return `<div class="alert">${ic('triangle-alert')}<span>このファイルは使えません。<br>${check.errors.slice(0, 8).map(esc).join('<br>')}${check.errors.length > 8 ? `<br>ほか ${check.errors.length - 8}件` : ''}</span></div>`;
  return `<div class="stack" style="border:2px solid var(--ink);border-radius:var(--r);padding:1rem">
    <div class="item-title">${esc(data.name)}・${esc(data.version)}${data.verified ? '（照合済み）' : '（照合前）'}</div>
    <p class="small">変わる箇所 ${changes.length}件・点検の注意 ${check.warnings.length}件</p>
    ${changes.length ? `<div class="tablebox"><table class="t"><thead><tr><th>箇所</th><th>今</th><th>新しい表</th></tr></thead><tbody>${changes.slice(0, 60).map(c => `<tr><td>${esc(c.label)}</td><td>${esc(c.from)}</td><td><b>${esc(c.to)}</b></td></tr>`).join('')}</tbody></table></div>${changes.length > 60 ? `<p class="small">ほか ${changes.length - 60}件</p>` : ''}` : '<p class="small">数値の違いはありません。</p>'}
    ${check.warnings.length ? `<details><summary class="small"><b>点検の注意を見る</b></summary><ul class="small">${check.warnings.map(w => `<li>${esc(w.text)}</li>`).join('')}</ul></details>` : ''}
    <div class="grid2"><button class="btn" data-act="cancel-table">やめる</button><button class="btn btn-primary" data-act="apply-table">${ic('check')}この表に切り替える</button></div>
  </div>`;
}

/* ===== 計算 ===== */
let calc = { tank: null, start: null, reserve: null, depth: 15, maxDepth: 18, sac: null };
function viewCalc() {
  const st = S.settings;
  const c = { tank: calc.tank ?? st.tank, start: calc.start ?? st.startP, reserve: calc.reserve ?? st.reserve, depth: calc.depth, sac: calc.sac ?? st.sac };
  const air = Engine.airMinutes(c.tank, c.start, c.reserve, c.depth, c.sac);
  const t = activeTable().data;
  const td = Engine.tableDepthFor(t, calc.maxDepth);
  const ndl = td != null ? t.mdt[td] : null;
  const atm = 1 + Number(c.depth) / 10;
  return `${bar('空気と時間の計算', '', true)}
  <main class="wrap">
    <section class="stack">
      <div class="grid2">
        <label class="field"><span>タンク容量（L）</span><input class="input num" data-calc="tank" inputmode="decimal" value="${esc(c.tank)}"></label>
        <label class="field"><span>最大水深（m）潜水表用</span><input class="input num" data-calc="maxDepth" inputmode="decimal" value="${esc(calc.maxDepth)}"></label>
        <label class="field"><span>平均水深（m）空気用</span><input class="input num" data-calc="depth" inputmode="decimal" value="${esc(c.depth)}"></label>
        <label class="field"><span>開始圧（気圧）</span><input class="input num" data-calc="start" inputmode="numeric" value="${esc(c.start)}"></label>
        <label class="field"><span>残しておく圧（気圧）</span><input class="input num" data-calc="reserve" inputmode="numeric" value="${esc(c.reserve)}"></label>
        <label class="field"><span>水面での空気消費（L/分）</span><input class="input num" data-calc="sac" inputmode="decimal" value="${esc(c.sac)}"></label>
      </div>
    </section>
    <section class="stack" id="calc-out">
      <div class="verdict">${ic('clock')}<span>潜れる時間 <span class="num">${air == null || ndl == null ? '—' : Math.min(Math.floor(air), ndl)}</span>分</span></div>
      <div class="result">
        <div><b>${air == null ? '—' : Math.floor(air)}</b><span>空気で潜れる時間（分）</span></div>
        <div><b>${ndl ?? '—'}</b><span>潜水表の上限（${td ?? '—'}m・1本目）</span></div>
      </div>
      <p class="small">短い方を表示しています。反復潜水の上限は、潜水員ボードで確かめてください。</p>
      ${air != null ? `<div class="stack">
        <h2>計算のしかた</h2>
        <div class="list">
          <div style="padding-block:.6rem"><div class="small"><b>① 使える空気</b>（タンク容量 ×（開始圧 − 残しておく圧））</div><div class="num">${c.tank}L × （${c.start} − ${c.reserve}）＝ <b>${(c.tank * (c.start - c.reserve)).toLocaleString()} L</b></div></div>
          <div style="padding-block:.6rem"><div class="small"><b>② その水深の気圧</b>（10mごとに1気圧ふえる）</div><div class="num">1 ＋ ${c.depth} ÷ 10 ＝ <b>${atm.toFixed(1)} 気圧</b></div></div>
          <div style="padding-block:.6rem"><div class="small"><b>③ 水中で1分に使う空気</b>（水面の消費 × ②）</div><div class="num">${c.sac}L × ${atm.toFixed(1)} ＝ <b>${(c.sac * atm).toFixed(1)} L/分</b></div></div>
          <div style="padding-block:.6rem"><div class="small"><b>④ 潜れる時間</b>（① ÷ ③）</div><div class="num">${(c.tank * (c.start - c.reserve)).toLocaleString()} ÷ ${(c.sac * atm).toFixed(1)} ＝ <b>${air.toFixed(1)} 分</b></div></div>
        </div>
        <p class="small">安全のため、小数点以下を切り捨てた ${Math.floor(air)}分 を表示しています。</p>
      </div>` : '<p class="small">数値を入れると計算します。開始圧は残しておく圧より大きくしてください。</p>'}
    </section>
  </main>`;
}

/* ===== 設定 ===== */
let confirmWipe = '';
function viewSettings() {
  const st = S.settings;
  return `${bar('設定', '', true)}
  <main class="wrap">
    <section class="stack"><h2>隊員（${S.members.length}人）</h2>
      ${S.members.length ? `<div class="list">${S.members.map(m => `<div class="row" style="padding-block:.6rem"><div class="item-main"><div class="item-title">${esc(m.name)}</div><div class="small num">職員番号 ${esc(m.id)}</div></div><button class="btn btn-icon" data-act="del-member" data-id="${esc(m.id)}" aria-label="${esc(m.name)}を削除">${ic('trash-2')}</button></div>`).join('')}</div>` : '<p class="small">まだ登録がありません。</p>'}
      <div class="grid2">
        <label class="field"><span>職員番号</span><input class="input num" id="m-id" inputmode="numeric"></label>
        <label class="field"><span>氏名</span><input class="input" id="m-name"></label>
      </div>
      <button class="btn" data-act="add-member">${ic('user-plus')}隊員を追加</button>
      <details class="stack"><summary class="small"><b>まとめて登録する（Excelの隊員マスタから貼り付け）</b></summary>
        <p class="small">1行に「職員番号,氏名」。Excelの2列をコピーして貼り付けても読み取れます。</p>
        <textarea class="input" id="m-bulk" placeholder="1001,宮古 太郎&#10;1002,伊良部 次郎"></textarea>
        <button class="btn" data-act="bulk-member">${ic('upload')}まとめて登録</button>
      </details>
    </section>
    <section class="stack"><h2>標準値</h2>
      <div class="grid2">
        <label class="field"><span>タンク容量（L）</span><input class="input num" data-set="tank" inputmode="decimal" value="${esc(st.tank)}"></label>
        <label class="field"><span>開始圧（気圧）</span><input class="input num" data-set="startP" inputmode="numeric" value="${esc(st.startP)}"></label>
        <label class="field"><span>残しておく圧（気圧）</span><input class="input num" data-set="reserve" inputmode="numeric" value="${esc(st.reserve)}"></label>
        <label class="field"><span>水面での空気消費（L/分）</span><input class="input num" data-set="sac" inputmode="decimal" value="${esc(st.sac)}"></label>
      </div>
    </section>
    <section class="stack"><h2>表示</h2>
      <div class="chips">${[['auto', '端末に合わせる'], ['light', '明るい'], ['dark', '暗い']].map(([v, l]) => `<button class="chip" data-act="theme" data-v="${v}" aria-pressed="${st.theme === v}">${ic('check')}${l}</button>`).join('')}</div>
    </section>
    <section class="stack"><h2>データの控え</h2>
      <p class="small">記録はこのスマホの中だけにあります。端末の故障や機種変更に備えて、月に1回はすべての記録をファイルに控え、署のパソコンなど端末の外に保管してください。<br>
      最後に控えを作った日：<b>${st.lastBackup ? `${ymd(st.lastBackup)} ${hm(st.lastBackup)}` : 'まだありません'}</b>${persisted === false ? '<br>この端末では、空き容量が少ないと記録が消される設定です。ホーム画面に追加して使ってください。' : ''}</p>
      <div class="grid2">
        <button class="btn" data-act="backup">${ic('download')}控えを作る</button>
        <label class="btn">${ic('upload')}控えから戻す<input type="file" id="restore-file" accept=".json,application/json" hidden></label>
      </div>
    </section>
    <section class="stack"><h2>すべての記録を消す</h2>
      <p class="small">この端末の記録を消します。元に戻せません。メールで送ったCSVと控えのファイルは消えません。</p>
      <label class="field"><span>確認のため「削除」と入力</span><input class="input" id="wipe" value="${esc(confirmWipe)}" autocomplete="off"></label>
      <button class="btn" data-act="wipe" ${confirmWipe === '削除' ? '' : 'disabled'}>${ic('trash-2')}すべて消す</button>
    </section>
    <p class="small">潜水現場記録 v${APP_VERSION}・潜水表 ${esc(tableLabel(activeTable()))}</p>
  </main>`;
}

/* ---------- 時計 ---------- */
function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-from]').forEach(el => {
    const from = new Date(el.dataset.from).getTime();
    el.textContent = el.dataset.mode === 'hm' ? hmText((now - from) / 60000) : clockText(now - from);
  });
  document.querySelectorAll('[data-remain-from]').forEach(el => {
    const from = new Date(el.dataset.remainFrom).getTime();
    const stop = el.dataset.stop ? new Date(el.dataset.stop).getTime() : null;
    const used = ((stop ?? now) - from) / 60000;
    if (!el.dataset.limit) { el.className = 'remain'; el.innerHTML = stop ? `潜水時間 <b class="num">${Math.ceil(used)}分</b>（浮上開始まで）` : ''; return; }
    const left = Number(el.dataset.limit) - used;
    let cls = 'remain', html;
    if (stop) html = `潜水時間 <b class="num">${Math.ceil(used)}分</b>（浮上開始まで）${left < 0 ? `・<b>上限を ${Math.ceil(-left)}分 超えました</b>` : ''}`;
    else if (left < 0) { cls += ' over'; html = `${ic('triangle-alert')}上限超過 <b class="num">${Math.ceil(-left)}分</b>`; }
    else if (left <= 5) { cls += ' warn'; html = `${ic('triangle-alert')}残り <b class="num">${Math.floor(left)}分</b>・まもなく上限`; }
    else html = `残り <b class="num">${Math.floor(left)}分</b>`;
    el.className = cls; el.innerHTML = html;
  });
  document.querySelectorAll('[data-now]').forEach(el => el.textContent = hm(nowISO()));
}
setInterval(tick, 1000);
setInterval(() => { if (view.name === 'board' && !sheet && !document.activeElement?.matches('input,select,textarea')) render(); }, 20000);

/* ---------- 画面を点けたままにする ---------- */
let wake = null;
async function keepAwake() { try { if (!wake && 'wakeLock' in navigator && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener?.('release', () => wake = null); } } catch (e) { wake = null; } }
function releaseAwake() { try { wake?.release(); } catch (e) {} wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); } });

/* ---------- テーマ ---------- */
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

/* ---------- ファイル ---------- */
const IN_PREVIEW = /claude|anthropic/.test(location.hostname);
function downloadText(name, text, type) {
  if (IN_PREVIEW) return false;
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) { return false; }
}
async function shareText(name, text, type) {
  if (IN_PREVIEW) return 'unsupported';
  try {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  return 'unsupported';
}
function showFallback(text) { const ta = $('#csv-fallback'); if (ta) { ta.hidden = false; ta.value = text; ta.focus(); ta.select(); } }
function readFile(input, cb) {
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => cb(String(r.result)); r.onerror = () => toast('ファイルを読めませんでした'); r.readAsText(f, 'utf-8');
  input.value = '';
}

/* ---------- 操作 ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const inc = curInc();
  const I = el.dataset.i != null ? Number(el.dataset.i) : null;

  switch (act) {
    case 'reload': location.reload(); break;
    case 'back': history.length > 1 ? history.back() : go('home'); break;
    case 'go': if (view.name === 'new') readDraft(); if (el.dataset.to === 'new') draft = null; go(el.dataset.to); break;
    case 'open-inc': { const x = S.incidents.find(i => i.id === el.dataset.id); go(x.status === 'active' ? 'board' : 'summary', { incidentId: x.id }); break; }
    case 'go-summary': go('summary', { incidentId: inc.id }); break;
    case 'undo': if (undoSnap) { S = JSON.parse(undoSnap); undoSnap = null; saved(); $('#toast').hidden = true; sheet = null; render(); toast('元に戻しました'); } break;
    case 'sheet-close': closeSheet(); break;
    case 'sheet-close-back': if (e.target === el) closeSheet(); break;
    case 'sheet': openSheet(el.dataset.sheet, { i: I, k: el.dataset.k != null ? Number(el.dataset.k) : null }); break;
    case 'clear-sample': {
      snapshot();
      const ids = S.members.filter(m => m.sample).map(m => m.id);
      S.members = S.members.filter(m => !m.sample);
      S.incidents = S.incidents.filter(i => !i.sample && !(ids.includes(i.commanderId) || ids.includes(i.watchId) || i.divers.some(d => ids.includes(d.memberId))));
      saved(); sheet = null; render(); toast('見本を消しました', true); break;
    }

    /* 新しい事案 */
    case 'draft-type': readDraft(); draft.type = el.dataset.v; render(); break;
    case 'draft-diver': { readDraft(); const v = el.dataset.v; draft.divers = draft.divers.includes(v) ? draft.divers.filter(x => x !== v) : [...draft.divers, v]; render(); break; }
    case 'start-inc': {
      readDraft();
      const now0 = nowISO();
      const tb = activeTable();
      const x = { id: `${ymdCompact(now0)}-${hm(now0).replace(':', '')}-${uid().replace(/[^0-9a-z]/gi, '').slice(0, 6).toUpperCase()}`, createdAt: now0, updatedAt: now0, type: draft.type, title: draft.title, site: draft.site, commanderId: draft.commanderId, watchId: draft.watchId, gas: draft.gas || '空気', memo: '', waterTemp: '', visibility: '', sea: '',
        strict: draft.strict, status: 'active', closedAt: null, tableId: tb.id, tableSnap: tb.data,
        divers: draft.divers.map(id => ({ memberId: id, tank: S.settings.tank, sac: S.settings.sac, current: null, nextFirst: false, dives: [] })) };
      S.incidents.push(x); saved(); draft = null;
      view = { name: 'board', incidentId: x.id };
      try { history.replaceState({ view }, ''); } catch (er) {}
      render(); toast('記録を始めました'); break;
    }

    /* 潜降 */
    case 'down-depth': readDownInputs(); sheet.depth = Number(el.dataset.v); renderSheet(); break;
    case 'do-down': {
      readDownInputs();
      const dv = inc.divers[sheet.i];
      snapshot();
      const sp = numOrBlank(sheet.startP), tk = numOrBlank(sheet.tank);
      if (Number.isNaN(sp) || Number.isNaN(tk)) { toast('開始圧とタンク容量は数字で入れてください'); break; }
      dv.tank = tk || dv.tank;
      dv.current = { startAt: nowISO(), plannedDepth: sheet.depth, startP: sp === '' ? null : sp, tank: dv.tank };
      touch(inc); saved(); sheet = null; render(); toast(`${member(dv.memberId).name}　潜降 ${hm(dv.current.startAt)}`, true); break;
    }
    case 'ascent-undo': { const dv = inc.divers[I]; snapshot(); dv.current.ascentAt = null; touch(inc); saved(); render(); toast('浮上開始を取り消しました'); break; }
    case 'ascent': {
      const dv = inc.divers[I]; snapshot();
      dv.current.ascentAt = nowISO();
      touch(inc); saved(); render(); toast(`${member(dv.memberId).name}　浮上開始 ${hm(dv.current.ascentAt)}`, true); break;
    }
    case 'next-first': { const dv = inc.divers[I]; snapshot(); dv.nextFirst = true; saved(); if (sheet) renderSheet(); render(); toast('次の潜水を1本目として扱います', true); break; }
    case 'next-first-off': { const dv = inc.divers[I]; dv.nextFirst = false; saved(); renderSheet(); render(); break; }

    /* 浮上 */
    case 'up-cond': readUpInputs(); sheet.cond = el.dataset.v; renderSheet(); break;
    case 'up-depth': readUpInputs(); sheet.maxDepth = el.dataset.v; renderSheet(); break;
    case 'up-safety': readUpInputs(); sheet.safety = el.dataset.v; renderSheet(); break;
    case 'do-up': {
      readUpInputs();
      const dv = inc.divers[sheet.i], c = dv.current;
      const u = upDefaults(inc, dv);
      if (!sheet.adtTouched) sheet.adt = String(u.adt);
      const depth = numOrBlank(sheet.maxDepth), adt = numOrBlank(sheet.adt), endP = numOrBlank(sheet.endP), deco = numOrBlank(sheet.decoStop);
      const r = upResult(inc, dv);
      // 画面を開いたまま時間がたって判定が変わったら、描き直して確かめてもらう
      if (r.status !== sheet.shown) { renderSheet(); toast('時間がたって判定が変わりました。確かめてから記録してください'); break; }
      const msg = !(depth > 0) ? '最大水深を数字で入れてください'
        : !(adt >= 1) ? '潜水時間を1分以上の数字で入れてください'
        : u.elapsed > 720 ? '潜降から水面まで12時間を超えています。時刻を確かめてください'
        : adt > u.elapsed + 1 ? `潜水時間が、潜降から水面までの時間（${u.elapsed}分）より長くなっています`
        : u.ascentAt && (u.ascentAt < c.startAt || u.ascentAt > u.endAt) ? '浮上開始の時刻が、潜降と水面の間に入っていません'
        : Number.isNaN(endP) ? '終了圧は数字で入れてください'
        : !sheet.safety ? '安全停止の「有」か「無」を選んでください'
        : !sheet.cond ? '体調異常の「無」か「有」を選んでください'
        : r.status === 'deco' && !(deco >= 0 && deco !== '') ? '5mで実際に止まった時間を入れてください' : '';
      if (msg) { toast(msg); break; }
      const stopMin = r.status === 'deco' ? deco : (sheet.safety === '有' ? u.stopMin : 0);
      snapshot();
      dv.dives.push({ id: uid(), startAt: c.startAt, ascentAt: u.ascentAt, endAt: u.endAt, plannedDepth: c.plannedDepth, tank: c.tank ?? dv.tank, startP: c.startP, endP: endP === '' ? null : endP,
        updatedAt: nowISO(), maxDepth: depth, adt, safetyStop: sheet.safety === '有', stopMin: stopMin || 0, decoStopDone: r.status === 'deco' ? deco : null, condition: sheet.cond, note: sheet.note, treatAsFirst: !!dv.nextFirst });
      dv.nextFirst = false; dv.current = null;
      touch(inc); saved(); sheet = null; render(); toast(`${member(dv.memberId).name}　浮上 ${hm(u.endAt)}`, true); break;
    }

    /* 修正 */
    case 'edit-cond': sheet.cond = el.dataset.v; readEditInputsToSheet(); renderSheet(); restoreEditInputs(); break;
    case 'save-edit': {
      const dv = inc.divers[sheet.i], d = dv.dives[sheet.k];
      const st = isoFromHM(d.startAt, $('#e-start').value), en = isoFromHM(d.startAt, $('#e-end').value);
      if (!st || !en) { toast('時刻を「時:分」で入れてください'); break; }
      const vals = ['#e-depth', '#e-adt', '#e-startp', '#e-endp'].map(id => numOrBlank($(id).value));
      if (vals.some(Number.isNaN)) { toast('水深・時間・圧は数字で入れてください'); break; }
      if (!(vals[0] > 0) || !(vals[1] >= 1)) { toast('最大水深と潜水時間を入れてください'); break; }
      const why = $('#e-why').value.trim();
      if (!why) { toast('直す理由を入れてください'); break; }
      const ns = $('#e-start').value !== hm(d.startAt) ? st : d.startAt;
      let ne = $('#e-end').value !== hm(d.endAt) ? en : d.endAt;
      if (new Date(ne) <= new Date(ns)) ne = new Date(new Date(ne).getTime() + 86400000).toISOString();
      const span = minsBetween(ns, ne);
      if (span > 720) { toast('潜降から水面まで12時間を超えます。時刻を確かめてください'); break; }
      if (vals[1] > Math.ceil(span) + 1) { toast(`潜水時間が、潜降から水面までの時間（${Math.ceil(span)}分）より長くなっています`); break; }
      snapshot();
      const before = diveSummary(d);
      // 時刻を変えていなければ、秒まで元のまま残す
      d.startAt = ns; d.endAt = ne;
      if (d.ascentAt && (d.ascentAt < d.startAt || d.ascentAt > d.endAt)) d.ascentAt = null;
      [d.maxDepth, d.adt, d.startP, d.endP] = vals.map(v => (v === '' ? null : v));
      d.condition = sheet.cond ?? d.condition; d.note = $('#e-note').value.trim();
      (d.edits ||= []).push({ at: nowISO(), why, before }); d.updatedAt = nowISO();
      touch(inc); saved(); sheet = { name: 'diver', i: sheet.i }; render(); toast('修正しました', true); break;
    }
    case 'delete-dive': {
      const why = $('#e-why')?.value.trim();
      if (!why) { toast('削除する理由を入れてください'); $('#e-why')?.focus(); break; }
      const i = sheet.i; snapshot();
      const d = inc.divers[i].dives[sheet.k];
      d.deleted = true; d.updatedAt = nowISO(); (d.edits ||= []).push({ at: nowISO(), why: `削除：${why}`, before: diveSummary(d) });
      touch(inc); saved(); sheet = { name: 'diver', i }; render(); toast('記録を削除しました', true); break;
    }
    case 'add-diver': snapshot(); inc.divers.push({ memberId: el.dataset.v, tank: S.settings.tank, sac: S.settings.sac, current: null, nextFirst: false, dives: [] }); saved(); sheet = null; render(); toast(`${member(el.dataset.v).name}を追加しました`, true); break;
    case 'remove-diver': snapshot(); inc.divers.splice(I, 1); saved(); sheet = null; render(); toast('潜水員を外しました', true); break;

    /* 事案 */
    case 'inc-type': readIncInputsToSheet(); sheet.type = el.dataset.v; renderSheet(); restoreIncInputs(); break;
    case 'save-inc': {
      snapshot();
      inc.type = sheet.type ?? inc.type; inc.title = $('#i-title').value.trim(); inc.site = $('#i-site').value.trim(); inc.commanderId = $('#i-cmd').value;
      inc.watchId = $('#i-watch').value; inc.gas = $('#i-gas').value.trim() || '空気';
      inc.waterTemp = toHalf($('#i-temp').value); inc.visibility = toHalf($('#i-vis').value); inc.sea = $('#i-sea').value.trim(); inc.memo = $('#i-memo').value.trim();
      touch(inc); saved(); sheet = null; render(); toast('事案の情報を保存しました', true); break;
    }
    case 'delete-inc': snapshot(); S.incidents = S.incidents.filter(i => i !== inc); saved(); go('home'); toast('事案を削除しました', true); break;
    case 'close-inc': snapshot(); inc.status = 'closed'; inc.closedAt = nowISO(); touch(inc); saved(); render(); $('#send-head')?.scrollIntoView({ block: 'start' }); break;
    case 'reopen-inc': inc.status = 'active'; touch(inc); saved(); go('board', { incidentId: inc.id }); break;

    /* 書き出し */
    case 'share-csv': {
      const text = buildCSV(inc), name = csvName(inc);
      const r = await shareText(name, text, 'text/csv');
      if (r === 'shared') { markSent(inc); toast('送る画面を開きました。メールを送ったか確かめてください'); }
      else if (r === 'unsupported') { if (downloadText(name, text, 'text/csv')) { markSent(inc); toast('共有できないため、ファイルに保存しました。メールに添付してください'); } else { showFallback(text); toast('この画面では送れないため、下に文字で表示しました'); } }
      break;
    }
    case 'save-csv': { const text = buildCSV(inc); if (downloadText(csvName(inc), text, 'text/csv')) { markSent(inc); toast('ファイルに保存しました'); } else { showFallback(text); toast('この画面では保存できないため、下に文字で表示しました'); } break; }
    case 'copy-csv': {
      const text = buildCSV(inc).replace(/^\ufeff/, '');
      try { await navigator.clipboard.writeText(text); markSent(inc); toast('CSVをコピーしました'); } catch (er) { showFallback(text); toast('下の欄を選んでコピーしてください'); }
      break;
    }

    /* 潜水表 */
    case 'use-table': S.tables.activeId = el.dataset.id; saved(); render(); toast('潜水表を切り替えました（新しい事案から使います）'); break;
    case 'del-table': snapshot(); S.tables.list = S.tables.list.filter(t => t.id !== el.dataset.id); saved(); render(); toast('版を削除しました', true); break;
    case 'cancel-table': pending = null; render(); break;
    case 'apply-table': {
      const id = `import:${pending.data.version}:${Date.now()}`;
      S.tables.list.push({ id, importedAt: nowISO(), data: pending.data });
      S.tables.activeId = id; pending = null; saved(); render(); toast('潜水表を切り替えました（新しい事案から使います）'); break;
    }
    case 'export-table': { const t = activeTable().data; downloadText(`潜水表_${t.version}.json`, JSON.stringify(t, null, 1), 'application/json') ? toast('潜水表を書き出しました') : toast('この環境では保存できません'); break; }

    /* 設定 */
    case 'add-member': {
      const id = toHalf($('#m-id').value), name = $('#m-name').value.trim();
      if (!id || !name) { toast('職員番号と氏名を入れてください'); break; }
      if (S.members.some(m => m.id === id)) { toast('同じ職員番号がすでにあります'); break; }
      S.members.push({ id, name }); saved(); render(); toast(`${name}を登録しました`); break;
    }
    case 'bulk-member': {
      const lines = $('#m-bulk').value.split(/\r?\n/).map(l => l.split(/[,\t]/).map(s => s.trim())).filter(p => p[0] && p[1]);
      let add = 0; const skip = [];
      lines.forEach(([id, name]) => { id = toHalf(id); if (!/^[0-9A-Za-z_-]+$/.test(id)) skip.push(`${id}（番号の形）`); else if (S.members.some(m => m.id === id)) skip.push(`${id}（登録済み）`); else { S.members.push({ id, name }); add++; } });
      saved(); render(); toast(`${add}人を登録しました${skip.length ? `。登録しなかった行：${skip.slice(0, 5).join('、')}${skip.length > 5 ? ` ほか${skip.length - 5}行` : ''}` : ''}`); break;
    }
    case 'del-member': {
      const id = el.dataset.id;
      if (S.incidents.some(i => i.status === 'active' && i.divers.some(d => d.memberId === id))) { toast('進行中の事案に入っているため削除できません'); break; }
      snapshot(); S.members = S.members.filter(m => m.id !== id); saved(); render(); toast('隊員を削除しました', true); break;
    }
    case 'theme': S.settings.theme = el.dataset.v; saved(); render(); break;
    case 'backup': {
      const name = `潜水現場記録_控え_${ymdCompact(nowISO())}.json`, text = JSON.stringify(S);
      const r = await shareText(name, text, 'application/json');
      if (r === 'shared' || (r === 'unsupported' && downloadText(name, text, 'application/json'))) { S.settings.lastBackup = nowISO(); saved(); render(); toast('控えを作りました。署のパソコンなど、この端末の外に保管してください'); }
      else if (r !== 'cancel') toast('この環境では保存できません');
      break;
    }
    case 'wipe': if (confirmWipe === '削除') { localStorage.removeItem(LS_KEY); S = { ...sampleState(), members: [], incidents: [] }; confirmWipe = ''; saved(); go('home'); toast('すべての記録を消しました'); } break;
  }
});

function touch(inc) { if (inc) inc.updatedAt = nowISO(); }
function markSent(inc) { inc.sentAt = nowISO(); saved(); render(); }
// 保存して、失敗したらその場で知らせる
function saved() { if (!save()) setTimeout(() => toast('保存できませんでした。この記録は端末に残っていません'), 0); return storageOK; }

/* 入力値をシートの状態へ */
function readDownInputs() { if (!sheet) return; sheet.startP = $('#d-startp')?.value.trim() ?? sheet.startP; sheet.tank = $('#d-tank')?.value.trim() ?? sheet.tank; }
function readUpInputs() {
  if (!sheet) return;
  sheet.maxDepth = $('#u-depth')?.value.trim() ?? sheet.maxDepth; sheet.adt = $('#u-adt')?.value.trim() ?? sheet.adt;
  sheet.endP = $('#u-endp')?.value.trim() ?? sheet.endP; sheet.note = $('#u-note')?.value.trim() ?? sheet.note;
  sheet.decoStop = $('#u-deco')?.value.trim() ?? sheet.decoStop;
}
let editBuf = null, incBuf = null;
function readEditInputsToSheet() { editBuf = ['#e-start', '#e-end', '#e-depth', '#e-adt', '#e-startp', '#e-endp', '#e-note'].map(id => [id, $(id)?.value]); editBuf.push(['#e-first', $('#e-first')?.checked]); }
function restoreEditInputs() { (editBuf || []).forEach(([id, v]) => { const el = $(id); if (!el) return; if (id === '#e-first') el.checked = v; else el.value = v; }); }
function readIncInputsToSheet() { incBuf = ['#i-title', '#i-site', '#i-cmd', '#i-watch', '#i-gas', '#i-temp', '#i-vis', '#i-sea', '#i-memo'].map(id => [id, $(id)?.value]); }
function restoreIncInputs() { (incBuf || []).forEach(([id, v]) => { const el = $(id); if (el) el.value = v; }); }

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'wipe') { confirmWipe = t.value.trim(); const b = document.querySelector('[data-act="wipe"]'); if (b) b.disabled = confirmWipe !== '削除'; return; }
  if (t.dataset.calc) { const v = numOrBlank(t.value); calc[t.dataset.calc] = v === '' || Number.isNaN(v) ? null : v; const out = $('#calc-out'); if (out) { const tmp = document.createElement('div'); tmp.innerHTML = viewCalc(); out.replaceWith(tmp.querySelector('#calc-out')); } return; }
  if (t.dataset.set) { const v = numOrBlank(t.value); if (v !== '' && isFinite(v) && v > 0) { S.settings[t.dataset.set] = v; saved(); } return; }
  if (sheet?.name === 'down' && (t.id === 'd-startp' || t.id === 'd-tank')) {
    readDownInputs();
    const inc = curInc(), dv = inc.divers[sheet.i];
    const keepTank = dv.tank; dv.tank = Number(sheet.tank) || dv.tank;
    const pos = t.selectionStart, id = t.id; renderSheet(); dv.tank = keepTank;
    const n = $('#' + id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) {} }
    return;
  }
  if (sheet?.name === 'up' && t.hasAttribute('data-live')) {
    readUpInputs();
    const inc = curInc(), dv = inc.divers[sheet.i], c = dv.current;
    if (t.id === 'u-adt') sheet.adtTouched = true;
    const later = v => (new Date(v) < new Date(c.startAt) ? new Date(new Date(v).getTime() + 86400000).toISOString() : v);
    if (t.id === 'u-end') { const v = isoFromHM(c.startAt, t.value); if (v) { sheet.endTouched = true; sheet.endAt = later(v); } }
    if (t.id === 'u-asc') { const v = isoFromHM(c.startAt, t.value); sheet.ascentTouched = true; sheet.ascentAt = v ? later(v) : null; }
    if ((t.id === 'u-end' || t.id === 'u-asc') && !sheet.adtTouched) { sheet.adt = String(upDefaults(inc, dv).adt); const a = $('#u-adt'); if (a) a.value = sheet.adt; }
    const r = upResult(inc, dv);
    sheet.shown = r.status;
    if ((r.status === 'deco') !== !!$('#u-deco')) {
      // 減圧が必要かどうかで入力欄が変わるので、入力位置を保ったまま描き直す
      const id = t.id, pos = t.selectionStart; renderSheet();
      const n = $('#' + id); if (n) { n.focus(); try { if (pos != null) n.setSelectionRange(pos, pos); } catch (er) {} }
    } else $('#u-result').innerHTML = resultBlock(r);
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'table-file') readFile(t, text => {
    try {
      const data = JSON.parse(text.replace(/^\ufeff/, ''));
      const check = Engine.validate(data);
      pending = { data, check, changes: check.errors.length ? [] : Engine.diff(activeTable().data, data) };
    } catch (er) { pending = { error: 'ファイルの中身を読み取れませんでした。Excelから書き出した潜水表ファイル（.json）を選んでください。' }; }
    render();
  });
  if (t.id === 'restore-file') readFile(t, text => {
    try { const s = JSON.parse(text.replace(/^\ufeff/, '')); if (!validBackup(s)) throw 0; snapshot(); S = s; S.settings = { lastBackup: null, ...S.settings }; saved(); go('home'); toast('控えから戻しました', true); }
    catch (er) { toast('控えのファイルではありません'); }
  });
});
// 控えのファイルの形を確かめる（壊れた・細工したファイルで画面が崩れないように）
function validBackup(s) {
  const str = v => typeof v === 'string', okId = v => str(v) && /^[0-9A-Za-z_:.\-]+$/.test(v);
  return !!s && s.v === 1 && s.settings && typeof s.settings === 'object' && s.tables && Array.isArray(s.tables.list)
    && Array.isArray(s.members) && s.members.every(m => m && okId(m.id) && str(m.name))
    && Array.isArray(s.incidents) && s.incidents.every(i => i && okId(i.id) && Array.isArray(i.divers) && i.divers.every(d => d && Array.isArray(d.dives)))
    && s.tables.list.every(t => t && okId(t.id) && Engine.validate(t.data).errors.length === 0);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) closeSheet(); });

/* ---------- 起動 ---------- */
save();
render();
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|anthropic/.test(location.hostname)) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => reg.update?.()).catch(() => {});
  // 新しい版が入ったら知らせる（記録中に勝手に読み込み直さない）
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    updateReady = true; render();
  });
}
})();
