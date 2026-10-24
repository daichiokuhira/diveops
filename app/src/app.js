/* ===== 潜水現場記録 ===== */
(() => {
'use strict';
const BUILTIN_TABLE = JSON.parse(document.getElementById('builtin-table').textContent);
const BUILTIN_ID = 'builtin:' + BUILTIN_TABLE.version;
const LS_KEY = 'diveops.v1';
const APP_VERSION = '__APP_VERSION__';
// 共有 API の場所（app/config.json の apiBase。空なら共有しない＝この端末だけで使う）
const API_BASE = '__API_BASE__'.startsWith('__') ? '' : '__API_BASE__';
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
    { id: 'S01', name: '見本 一郎', sample: true, unit: '本署', status: '在籍', quals: [{ id: 'sq1', kind: '資格', name: '潜水士免許', date: '2012-06-01', confirmedAt: '2026-04-01T00:00:00Z', confirmedBy: '見本 担当' }, { id: 'sq2', kind: '研修', name: '水難救助研修', date: '2016-10-01', no: '第15期', confirmedAt: '2026-04-01T00:00:00Z', confirmedBy: '見本 担当' }] },
    { id: 'S02', name: '見本 二郎', sample: true, unit: '本署', status: '在籍', quals: [{ id: 'sq3', kind: '資格', name: '潜水士免許', date: '2018-05-01', confirmedAt: '2026-04-01T00:00:00Z', confirmedBy: '見本 担当' }, { id: 'sq4', kind: '資格', name: '小型船舶1級', date: '2020-04-01', expires: '2025-03-31', confirmedAt: '2026-04-01T00:00:00Z', confirmedBy: '見本 担当' }] },
    { id: 'S03', name: '見本 三郎', sample: true, unit: '伊良部分署', status: '在籍', quals: [{ id: 'sq5', kind: '資格', name: '潜水士免許', date: '2021-07-01', confirmedAt: '2026-04-01T00:00:00Z', confirmedBy: '見本 担当' }] },
    { id: 'S04', name: '見本 四郎', sample: true, unit: '伊良部分署', status: '在籍', quals: [] }
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
/* 記録の保存先は IndexedDB（容量が大きい）。使えない環境では localStorage。
   v0.3.0 までの localStorage の記録は、初回起動時に IndexedDB へ移す */
const IDB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('diveops'); // 版を指定しない（別の接続が版を上げても開ける）
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => {
        const db = r.result;
        // iOS などで裏に回ると接続が切れることがある。切れたら次の保存で開き直す
        db.onclose = () => { if (this.db === db) this.db = null; };
        db.onversionchange = () => { db.close(); if (this.db === db) this.db = null; };
        res(db);
      };
      r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
    });
  },
  run(mode, fn) {
    return new Promise((res, rej) => {
      let t; try { t = this.db.transaction('kv', mode); } catch (e) { rej(e); return; }
      const out = fn(t.objectStore('kv')); t.oncomplete = () => res(out?.result); t.onerror = t.onabort = () => rej(t.error || new Error('abort'));
    });
  },
  async tx(mode, fn) {
    this.db ||= await this.open();
    try { return await this.run(mode, fn); }
    catch (e) { try { this.db?.close(); } catch (er) {} this.db = await this.open(); return this.run(mode, fn); }
  },
  get(k) { return this.tx('readonly', st => st.get(k)); },
  put(k, v) { return this.tx('readwrite', st => { st.put(v, k); }); }
};
const okState = s => s && s.v === 1 && Array.isArray(s.incidents) && Array.isArray(s.members);
let loadNote = '', useLS = false, migratedRaw = null;
const savedAtOf = raw => { try { return JSON.parse(raw).savedAt || ''; } catch (e) { return ''; } };
const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const IDB_FLAG = LS_KEY + '.idb'; // 一度でも IndexedDB に保存できた端末の印
let loadFail = null;
async function load() {
  let raw = null, ls = null, flag = null;
  try { ls = localStorage.getItem(LS_KEY); flag = localStorage.getItem(IDB_FLAG); } catch (e) {}
  if (typeof indexedDB === 'undefined') useLS = true;
  else {
    try { raw = await withTimeout(IDB.get('state'), 8000); }
    catch (e) {
      // 前に IndexedDB を使っていた端末で読めないときは、見本で始めず止める（見本で上書きしないため）
      if (flag || e.message === 'timeout') { loadFail = e.message === 'timeout' ? '時間がかかりすぎました' : '保存先を開けませんでした'; return null; }
      useLS = true;
    }
  }
  if (!useLS && ls) {
    if (raw == null) { raw = ls; migratedRaw = ls; }                     // v0.3.0 からの移行
    else if (!savedAtOf(ls)) loadNote = '古い版（v0.3.0 まで）の画面で保存された記録が端末に残っています。古い版の画面を閉じ、記録を確かめてください（どちらの記録も消していません）。';
    else if (savedAtOf(ls) > savedAtOf(raw)) {                          // IndexedDB が使えなかった回の記録の方が新しい
      try { await IDB.put('state.before-ls.' + Date.now(), raw); } catch (e) { loadFail = '保存先に書き込めませんでした'; return null; }
      raw = ls; migratedRaw = ls;
    }
  } else if (useLS) raw = ls;
  if (raw == null) return CLOUD ? { ...sampleState(), members: [], incidents: [] } : sampleState();
  try { const s = JSON.parse(raw); if (okState(s)) return s; } catch (e) {}
  // 壊れた記録は消さずに別の場所へ退避してから始める
  try { if (useLS) localStorage.setItem(LS_KEY + '.broken.' + Date.now(), raw); else await IDB.put('broken.' + Date.now(), raw); } catch (e) {}
  migratedRaw = null;
  loadNote = '前回の記録を読み込めませんでした。読めなかったデータは端末内に退避してあります。';
  return { ...sampleState(), members: [], incidents: [] };
}
let S = { ...sampleState(), members: [], incidents: [] }; // 読み込むまでの仮の中身
let ready = false, storageOK = true, saveChain = Promise.resolve();
// 保存は順番に行う（後の保存が先の保存を追い越さない）。失敗したらその場で知らせる
function save() {
  if (ready) { try { trackChanges(); } catch (e) {} }
  S.savedAt = new Date().toISOString();
  const json = JSON.stringify(S);
  saveChain = saveChain.then(async () => {
    if (useLS) localStorage.setItem(LS_KEY, json); else { await IDB.put('state', json); try { localStorage.setItem(IDB_FLAG, '1'); } catch (e) {} }
    if (migratedRaw) { try { localStorage.setItem(LS_KEY + '.before-idb', migratedRaw); localStorage.removeItem(LS_KEY); } catch (e) {} migratedRaw = null; }
    if (!storageOK) { storageOK = true; render(); }
  }).catch(() => {
    const was = storageOK; storageOK = false;
    if (was) { render(); toast('保存できませんでした。この記録は端末に残っていません'); }
  });
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

/* ---------- 隊員 ---------- */
const isActive = m => (m.status || '在籍') === '在籍';
const activeMembers = () => S.members.filter(isActive);
const QUAL_NAMES = { 資格: ['潜水士免許', '小型船舶1級', '小型船舶2級', '特殊小型船舶', '救急救命士'], 研修: ['水難救助研修', '潜水研修', 'BLS講習'] };
// 名称の揺れをそろえる（「潜水士」「潜水士免許証」→「潜水士免許」、全角英数→半角）
function normQualName(n) {
  n = String(n || '').normalize('NFKC').replace(/\s+/g, '').trim();
  if (/^潜水士(免許(証)?)?$/.test(n)) return '潜水士免許';
  const b = n.match(/^小型船舶(操縦士)?(免許)?([12一二])級/); if (b) return `小型船舶${{ 一: 1, 二: 2 }[b[3]] || b[3]}級`;
  if (/^特殊小型船舶/.test(n)) return '特殊小型船舶';
  if (/^水難救助(研修)?$/.test(n)) return '水難救助研修';
  return n;
}
const todayDash = () => ymd(nowISO()).replaceAll('/', '-');
// 資格の有効性：期限が過ぎていれば expired、90日以内なら soon
function qualState(q) {
  if (!q.expires) return 'ok';
  const t = todayDash();
  if (q.expires < t) return 'expired';
  return (new Date(q.expires) - new Date(t)) / 86400000 <= 90 ? 'soon' : 'ok';
}
const qualLabel = q => `${qualState(q) === 'expired' ? '× ' : ''}${q.name}${q.confirmedAt ? '' : '（未確認）'}`;
function hasQual(m, name) { return (m.quals || []).some(q => normQualName(q.name) === name && qualState(q) !== 'expired'); }
// 潜水士免許：'ok'（確認済み・有効）／'unconfirmed'（本人入力のみ）／'none'（なし・期限切れ）
function licenseOf(m) {
  const qs = (m.quals || []).filter(q => normQualName(q.name) === '潜水士免許' && qualState(q) !== 'expired');
  return qs.some(q => q.confirmedAt) ? 'ok' : qs.length ? 'unconfirmed' : 'none';
}
const LICENSE_TEXT = { ok: '有', unconfirmed: '有（未確認）', none: '× 無' };

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
    if (d.noTime) { const r = { no: i + 1, warnings: [], status: 'na', noTime: true, group: null, endAt: null, tableDepth: null }; out.push(r); prev = r; return; }
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
    <div class="bar-title">${title}${sub ? `<span class="bar-sub">${sub}</span>` : ''}</div>${CLOUD ? `<span data-sync-badge>${syncBadge()}</span>` : ''}${right}</div></header>${globalAlerts()}`;
}
let updateReady = false;
function globalAlerts() {
  const a = [];
  const upd = updateReady && view.name !== 'board' ? `<div class="alert soft row">${ic('rotate-ccw')}<span class="spacer">新しい版があります。記録中でなければ更新してください。</span><button class="btn" data-act="reload">更新する</button></div>` : '';
  if (ready && useLS) a.push('この端末では、記録を容量の小さい保存先（localStorage）に置いています。こまめに控えを作ってください。');
  if (!storageOK) a.push('この端末に記録を保存できていません。このまま閉じると記録が消えます。紙にも控え、設定の「控えを作る」を試してください。');
  if (loadNote) a.push(loadNote);
  return a.length || upd ? `<div class="wrap wrap-alert">${a.map(t => `<div class="alert" role="alert">${ic('triangle-alert')}<span>${esc(t)}</span></div>`).join('')}${upd}</div>` : '';
}
function render() {
  if (!ready) return;
  applyTheme();
  const app = $('#app');
  const v = CLOUD && !signedIn() ? viewLogin : ({
    home: viewHome, new: viewNew, board: viewBoard, summary: viewSummary,
    tables: viewTables, settings: viewSettings, calc: viewCalc, records: viewRecords
  }[view.name] || viewHome);
  app.innerHTML = v();
  renderSheet();
  tick();
  if (view.name === 'board') keepAwake(); else releaseAwake();
}
function renderSheet() {
  const box = $('#sheet');
  if (!sheet) { box.innerHTML = ''; box.hidden = true; document.body.style.overflow = ''; if (sheetOpener?.isConnected) sheetOpener.focus(); sheetOpener = null; return; }
  const fn = { member: sheetMember, down: sheetDown, up: sheetUp, diver: sheetDiver, edit: sheetEdit, addDiver: sheetAddDiver, editInc: sheetEditInc, clearSample: sheetClearSample }[sheet.name];
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
let homeAll = false;
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
      <button class="btn btn-block" data-act="go" data-to="records">${ic('users')}記録・経歴簿（Excel出力）</button>
      <div class="grid2">
        <button class="btn" data-act="go" data-to="calc">${ic('calculator')}空気の計算</button>
        <button class="btn" data-act="go" data-to="tables">${ic('table-2')}潜水表</button>
      </div>
    </section>
    <section class="stack"><h2>これまでの事案</h2>
      ${past.length ? `<div class="list">${(homeAll ? past : past.slice(0, 10)).map(incRow).join('')}</div>${past.length > 10 ? `<button class="btn btn-block" data-act="home-all">${homeAll ? '直近10件だけを表示' : `すべての事案を見る（${past.length}件）`}</button>` : ''}` : '<p class="small">まだありません。終了した事案がここに並びます。</p>'}
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
  const unsent = !CLOUD && !inc.sample && inc.status !== 'active' && n && (!inc.sentAt || inc.sentAt < (inc.updatedAt || ''));
  return `<button class="item" data-act="open-inc" data-id="${esc(inc.id)}">
    <div class="item-main">
      <div class="item-title">${esc(incTitle(inc))}${unsent ? ` <span class="state">${ic('send')}未送信</span>` : ''}${inc.imported ? ' <span class="state">取り込み</span>' : ''}</div>
      <div class="small">${md(inc.createdAt)} ${hm(inc.createdAt)}・${esc(inc.type)}・${esc(inc.site || '地点未入力')}・${inc.divers.length}人 ${n}本${down ? `・<b>潜水中 ${down}人</b>` : ''}</div>
    </div>${ic('chevron-right')}</button>`;
}
function backupHint() {
  if (CLOUD) return '';
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
      ${S.members.length ? `<div class="chips">${activeMembers().map(m => `<button class="chip" data-act="draft-diver" data-v="${esc(m.id)}" aria-pressed="${draft.divers.includes(m.id)}">${ic('check')}${esc(m.name)}${{ ok: '', unconfirmed: '<span class="small">（免許未確認）</span>', none: '<span class="small">（免許×）</span>' }[licenseOf(m)]}</button>`).join('')}</div>
        ${licenseAlert(draft.divers)}`
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

// 潜水士免許の登録がない（または期限切れ）隊員を知らせる。止めはしない
function licenseAlert(ids) {
  const ms = ids.map(id => S.members.find(m => m.id === id)).filter(Boolean);
  const no = ms.filter(m => licenseOf(m) === 'none'), un = ms.filter(m => licenseOf(m) === 'unconfirmed');
  return (no.length ? `<div class="alert">${ic('triangle-alert')}<span>× 潜水士免許の登録がありません：${no.map(m => esc(m.name)).join('、')}。潜水業務には免許が必要です（労働安全衛生法施行令 第20条）。</span></div>` : '')
    + (un.length ? `<div class="alert soft">${ic('info')}<span>潜水士免許が未確認（本人入力のみ）：${un.map(m => esc(m.name)).join('、')}。担当者が免許証で確かめてください。</span></div>` : '');
}
const memberSelect = (id, cur) => `<select class="input" id="${id}"><option value="">選ぶ</option>${S.members.filter(m => isActive(m) || m.id === cur).map(m => `<option value="${esc(m.id)}" ${cur === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`;

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
    startAt: c.startAt, endAt: upDefaults(inc, dv).endAt, treatAsFirst: dv.nextFirst, decoStopDone: dec === '' ? null : dec, pendingStop: dec === '' };
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
      <div class="item-title num">${alertish ? ic('triangle-alert') : ''}${d.importNo ?? k + 1}本目　${d.noTime ? ymd(d.startAt) : `${hm(d.startAt)}→${hm(d.endAt)}`}　${d.maxDepth ?? '—'}m　${d.adt ?? '—'}分</div>
      <div class="small">${d.imported ? `取り込み（判定は参考：グループ ${r.group ?? '—'}・${statusText(r)}）` : `グループ ${r.group ?? '—'}・${statusText(r)}`}${d.condition === '有' ? '・<b>体調異常 有</b>' : ''}${d.edits?.length ? `・修正${d.edits.length}回` : ''}${d.treatAsFirst ? '・1本目扱い' : ''}</div>
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
    <label class="field"><span>5mで止まった時間（分）</span><input class="input num" id="e-stop" inputmode="numeric" value="${esc(d.decoStopDone ?? d.stopMin ?? '')}"></label>
  </div>
  <p class="small">減圧停止が必要な判定になる修正では、5mで実際に止まった時間を入れてください。表の停止時間より短いと、次の潜水は計算しません。</p>
  <div class="field"><span>5mの安全停止</span><div class="chips">${['有', '無'].map(v => `<button class="chip" data-act="edit-safety" data-v="${v}" aria-pressed="${(sheet.safety ?? (d.safetyStop ? '有' : '無')) === v}">${ic('check')}${v}</button>`).join('')}</div></div>
  <div class="field"><span>体調異常</span><div class="chips">${['無', '有'].map(v => `<button class="chip" data-act="edit-cond" data-v="${v}" aria-pressed="${(sheet.cond ?? d.condition) === v}">${ic('check')}${v}</button>`).join('')}</div></div>
  <label class="field"><span>備考</span><input class="input" id="e-note" value="${esc(d.note ?? '')}"></label>
  <label class="field"><span>直す・削除する理由<b>必須</b></span><input class="input" id="e-why" placeholder="例：深度計の読み違い"></label>
  ${d.edits?.length ? `<details><summary class="small"><b>これまでの修正（${d.edits.length}回）</b></summary><ul class="small">${d.edits.map(x => `<li>${ymd(x.at)} ${hm(x.at)}　${esc(x.why || '')}（前：${esc(x.before)}）</li>`).join('')}</ul></details>` : ''}
  <button class="btn btn-primary btn-big btn-block" data-act="save-edit">${ic('check')}修正を保存</button>
  <hr class="rule">
  <button class="btn btn-quiet" data-act="delete-dive">${ic('trash-2')}この記録を削除（削除した記録も署へ送るCSVに残ります）</button>`;
}
const diveSummary = d => `${hm(d.startAt)}→${hm(d.endAt)} ${d.maxDepth ?? '—'}m ${d.adt ?? '—'}分 開始圧${d.startP ?? '—'} 終了圧${d.endP ?? '—'} 安全停止${d.safetyStop ? '有' : '無'} 5m停止${d.decoStopDone ?? d.stopMin ?? '—'}分 体調${d.condition || '—'}`;

/* ----- 隊員の詳細（所属・在籍・資格・研修） ----- */
function sheetMember() {
  const m = S.members.find(x => x.id === sheet.id);
  if (!m) return sheetHead('隊員');
  const used = S.incidents.some(i => i.commanderId === m.id || i.watchId === m.id || i.divers.some(d => d.memberId === m.id));
  sheet.kind ??= '資格';
  const qs = [...(m.quals || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const names = QUAL_NAMES[sheet.kind] || [];
  const lead = isLeader(), self = !CLOUD || me()?.id === m.id, canQual = lead || self;
  return `${sheetHead(esc(m.name))}
  <p class="num"><b>職員番号 ${esc(m.id)}${m.unit ? `・${esc(m.unit)}` : ''}</b>${m.statusAt ? `<span class="small">（${esc(m.status)} ${esc(m.statusAt)}〜）</span>` : ''}</p>
  ${lead ? `<div class="grid2">
    <label class="field"><span>氏名</span><input class="input" id="p-name" value="${esc(m.name)}"></label>
    <label class="field"><span>所属</span><input class="input" id="p-unit" value="${esc(m.unit || '')}" placeholder="例：伊良部分署"></label>
  </div>
  <div class="field"><span>在籍状態</span><div class="chips">${['在籍', '異動', '退職'].map(v => `<button class="chip" data-act="p-status" data-v="${v}" aria-pressed="${(sheet.status ?? m.status ?? '在籍') === v}">${ic('check')}${v}</button>`).join('')}</div>
    <p class="small">異動・退職にすると、潜水員の候補から外れ、ログインもできなくなります。過去の記録は残ります。</p></div>
  <button class="btn btn-block" data-act="save-member">${ic('check')}氏名・所属・在籍を保存</button>
  ${CLOUD ? `<p class="small">役割：<b>${m.role === 'leader' ? '隊長' : '隊員'}</b>${isAdmin() ? `　<button class="link" data-act="p-role">${m.role === 'leader' ? '隊長から外す' : '隊長にする'}</button>` : ''}</p>` : ''}`
    : `<p class="small">氏名・所属・在籍の変更は、隊長に頼んでください。</p>`}
  <section class="stack"><h2>資格・研修（${qs.length}件）</h2>
    ${qs.some(q => !q.confirmedAt) && lead && !CLOUD ? '<label class="field"><span>確かめる担当者の氏名（先に入れてから「確かめた」）</span><input class="input" id="q-who" autocomplete="off"></label>' : ''}
    ${qs.length ? `<div class="list">${qs.map(q => `<div class="row qual-row"><div class="item-main"><div class="item-title">${esc(qualLabel(q))}<span class="small">（${esc(q.kind)}）</span></div>
      <div class="small num">${esc((q.date || '日付なし').replaceAll('-', '/'))}${q.expires ? `・期限 ${esc(q.expires.replaceAll('-', '/'))}${qualState(q) === 'expired' ? '・<b>× 期限切れ</b>' : qualState(q) === 'soon' ? '・<b>期限まで90日以内</b>' : ''}` : ''}${q.no ? `・${esc(q.no)}` : ''}${q.note ? `・${esc(q.note)}` : ''}${q.confirmedAt ? `・確認 ${esc(q.confirmedBy || '')} ${ymd(q.confirmedAt)}` : ''}</div>
      ${q.confirmedAt || !lead ? '' : `<button class="btn btn-under" data-act="confirm-qual" data-id="${esc(q.id)}">${ic('check')}証の写しで確かめた</button>`}</div>
      ${lead || (self && !q.confirmedAt) ? `<button class="btn btn-icon" data-act="del-qual" data-id="${esc(q.id)}" aria-label="${esc(q.name)}を削除">${ic('trash-2')}</button>` : ''}</div>`).join('')}</div>` : '<p class="small">まだありません。</p>'}
    <p class="small">本人が入れた資格・研修は「未確認」です。${CLOUD ? '隊長が免許証・修了証の写しで確かめて「確かめた」を押すと、確認済みになります（確かめた隊長の名前が残ります）。' : '担当者が免許証・修了証の写しで確かめてから、氏名を入れて「確かめた」を押します。'}</p>

  </section>
  ${canQual ? '' : '<p class="small">ほかの隊員の資格・研修は、本人か隊長が入れます。</p>'}
  <section class="stack" ${canQual ? '' : 'hidden'}><h2>${esc(m.name)}さんの資格・研修を追加</h2>
    <div class="chips">${['資格', '研修'].map(v => `<button class="chip" data-act="q-kind" data-v="${v}" aria-pressed="${sheet.kind === v}">${ic('check')}${v}</button>`).join('')}</div>
    <div class="field"><span>名称<b>必須</b></span><div class="chips">${names.map(n => `<button class="chip" data-act="q-pick" data-v="${esc(n)}" aria-pressed="${sheet.qname === n}">${ic('check')}${esc(n)}</button>`).join('')}<button class="chip" data-act="q-pick" data-v="" aria-pressed="${sheet.qname === ''}">${ic('check')}その他</button></div>
      ${sheet.qname === '' ? '<input class="input" id="q-name" placeholder="名称を入れる">' : ''}</div>
    <div class="grid2">
      <label class="field"><span>取得・修了日<b>必須</b></span><input class="input num" id="q-date" type="date"></label>
      <label class="field"><span>有効期限（あれば）</span><input class="input num" id="q-exp" type="date"></label>
    </div>
    <label class="field"><span>期別・番号（任意）</span><input class="input" id="q-no" placeholder="例：第25期"></label>
    <label class="field"><span>備考（任意）</span><input class="input" id="q-note"></label>
    <button class="btn btn-primary btn-block" data-act="add-qual">${ic('plus')}${esc(m.name)}さんに追加</button>
  </section>
  ${used ? '<p class="small">記録に使われている隊員は削除できません。異動・退職にしてください。</p>' : `<button class="btn btn-quiet" data-act="del-member" data-id="${esc(m.id)}">${ic('trash-2')}この隊員を削除</button>`}`;
}

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
  const cand = activeMembers().filter(m => !inIds.includes(m.id));
  return `${sheetHead('潜水員を追加')}
  ${cand.length ? `<div class="list">${cand.map(m => `<button class="item" data-act="add-diver" data-v="${esc(m.id)}"><div class="item-main"><div class="item-title">${esc(m.name)}</div><div class="small num">職員番号 ${esc(m.id)}${{ ok: '', unconfirmed: '・潜水士免許 未確認', none: '・<b>× 潜水士免許の登録なし</b>' }[licenseOf(m)]}</div></div>${ic('plus')}</button>`).join('')}</div>`
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
  return `${bar(inc.imported ? '取り込んだ記録' : active ? '終了の手続き' : '記録と送信', esc(incTitle(inc)), true)}
  <main class="wrap">
    <section class="stack">
      <h1><span class="u">${esc(incTitle(inc))}</span></h1>
      <dl class="kv">
        <dt>日時</dt><dd>${ymd(inc.createdAt)}${inc.imported && inc.divers.every(d => d.dives.every(x => x.noTime)) ? '（時刻なし）' : ` ${hm(inc.createdAt)}〜${inc.closedAt ? hm(inc.closedAt) : ''}`}</dd>
        <dt>区分・地点</dt><dd>${esc(inc.type)}・${esc(inc.site || '未入力')}</dd>
        <dt>指揮者</dt><dd>${esc(inc.commanderId ? member(inc.commanderId).name : '未入力')}</dd>
        <dt>監視員</dt><dd>${esc(inc.watchId ? member(inc.watchId).name : '未入力')}</dd>
        <dt>呼吸ガス</dt><dd>${esc(inc.gas ?? '空気')}</dd>
        <dt>海況</dt><dd>水温 ${esc(inc.waterTemp || '—')}℃・透視度 ${esc(inc.visibility || '—')}m・${esc(inc.sea || '—')}</dd>
        <dt>潜水表</dt><dd>${esc(tableLabel(incidentTable(inc)))}</dd>
      </dl>
      ${inc.imported ? `<div class="alert soft">${ic('info')}<span>台帳から取り込んだ記録です（正本は台帳）。アプリでは直せません。直すときは台帳で直し、取り込み直してください。</span></div>`
        : `<button class="btn" data-act="sheet" data-sheet="editInc">${ic('pencil')}事案の情報を直す</button>`}
    </section>
    <section class="stack"><h2>潜水の記録（${live.length}本）</h2>
      ${rows.length ? `<div class="list">${rows.map(r => diveLine(r, r.res, r.no - 1, '').replace(/(<div class="item-title[^>]*>)/, `$1${esc(r.name)}　`)).join('')}</div>` : '<p class="small">記録がありません。</p>'}
    </section>
    ${active ? `<section class="stack"><h2>1. 終了</h2>
      ${downNow.length ? `<div class="alert">${ic('triangle-alert')}<span>まだ水中の人がいます：${esc(downNow.join('、'))}。浮上を記録してから終了してください。</span></div>` : ''}
      ${missing.length ? `<div class="alert soft">${ic('info')}<span>${missing.join('・')}が未入力です。「事案の情報を直す」から入れられます。</span></div>` : ''}
      <button class="btn btn-primary btn-big btn-block" data-act="close-inc" ${downNow.length ? 'disabled' : ''}>${ic('flag')}事案を終了する（${hm(nowISO())}）</button>
    </section>` : ''}
    ${inc.imported ? '' : CLOUD ? `<section class="stack"><h2 id="send-head">${active ? '2. 共有' : '共有'}</h2>
      <p class="small">記録は自動で隊の全員と共有されます（<span data-sync-badge>${syncBadge()}</span>）。メールで送る必要はありません。台帳へは、署のパソコンで「記録・経歴簿」→「台帳用CSV」を取り込みます。</p>
      <details><summary class="small"><b>予備：この事案のCSVを作る</b></summary><div class="grid2" style="margin-top:.5rem">
        <button class="btn" data-act="save-csv" ${rows.length ? '' : 'disabled'}>${ic('download')}保存</button>
        <button class="btn" data-act="copy-csv" ${rows.length ? '' : 'disabled'}>${ic('copy')}コピー</button></div>
        <textarea class="input small" id="csv-fallback" hidden readonly></textarea></details>
    </section>` : `<section class="stack"><h2 id="send-head">${active ? '2. 署へ送る' : '次：署へ送る'}</h2>
      ${active ? '<p class="small">事案を終了すると送れます（終了時刻もCSVに入ります）。</p>'
        : `<p class="small">CSVファイル（潜水管理台帳で取り込む形式）を作ります。「メールで送る」を押し、共有先でメールを選んでください。${inc.sentAt ? `<br><b>前回送った日時：${ymd(inc.sentAt)} ${hm(inc.sentAt)}</b>${inc.updatedAt > inc.sentAt ? '（そのあと記録を直しています。もう一度送ってください）' : ''}` : ''}</p>`}
      <button class="btn ${active ? '' : 'btn-primary'} btn-big btn-block" data-act="share-csv" ${rows.length && !active ? '' : 'disabled'}>${ic('mail')}メールで送る</button>
      <div class="grid2">
        <button class="btn" data-act="save-csv" ${rows.length && !active ? '' : 'disabled'}>${ic('download')}保存</button>
        <button class="btn" data-act="copy-csv" ${rows.length && !active ? '' : 'disabled'}>${ic('copy')}コピー</button>
      </div>
      <textarea class="input small" id="csv-fallback" hidden readonly></textarea>
    </section>`}
    ${!active && !inc.imported ? `<section class="stack"><button class="btn btn-block" data-act="reopen-inc">${ic('rotate-ccw')}記録を再開する</button></section>` : ''}
  </main>`;
}
function csvRows(inc) {
  const out = [];
  inc.divers.forEach(dv => {
    const res = diverResults(inc, dv);
    dv.dives.forEach((d, k) => {
      const r = res[k];
      out.push({ ...d, memberId: dv.memberId, name: member(dv.memberId).name, no: d.importNo ?? k + 1, tank: d.tank ?? dv.tank ?? S.settings.tank,
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
// 前の潜水や事案を直すと後の潜水の計算も変わるので、事案の更新日時と比べて新しい方を記録更新日時にする
const stamp = list => { const t = list.filter(Boolean).sort().pop(); return t ? `${ymd(t)} ${hms(t)}` : ''; };
function buildCSV(inc) {
  // カンマ・引用符・改行を囲む。= + - @ で始まる文字は、Excelで直接開いても数式にならないよう ' を付ける
  const q = v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [CSV_HEAD.map(q).join(',')];
  csvRows(inc).forEach(r => lines.push(csvValues(inc, r).map(q).join(',')));
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}
// 1本分の値（CSV と Excel の「潜水記録」シートで共通。並びは CSV_HEAD と同じ）
function csvValues(inc, r) {
  const t = incidentTable(inc);
  const num = v => { if (v == null || v === '') return ''; const n = Number(v); return isFinite(n) ? n : v; };
  const x = r.res;
  const edits = r.edits?.length ? `${r.edits.length}回・最終 ${ymd(r.edits[r.edits.length - 1].at)} ${hm(r.edits[r.edits.length - 1].at)}` : '';
  return [ymd(r.startAt), String(r.memberId), r.name, inc.type, inc.title, inc.site, num(r.maxDepth), num(r.adt), r.si, num(r.tank), num(r.startP), num(r.endP), num(inc.waterTemp), num(inc.visibility),
    r.imported && r.decoTable ? r.decoTable : (x.status === 'deco' ? '有' : '無'), r.condition || '', inc.commanderId ? member(inc.commanderId).name : '', r.note || '',
    inc.id, r.no, r.noTime ? '' : hm(r.startAt), r.noTime ? '' : hm(r.endAt), x.tableDepth ?? '', x.group ?? '', x.rnt ?? '', x.tnt ?? '', x.mdt ?? '', x.amdt ?? '', statusText(x), x.stop5 ?? '', tableLabel(t), inc.sea, inc.memo,
    `${ymd(inc.createdAt)} ${hm(inc.createdAt)}`, inc.closedAt ? `${ymd(inc.closedAt)} ${hm(inc.closedAt)}` : '',
    r.id, r.deleted ? '削除' : '記録', num(r.plannedDepth), r.ascentAt ? hm(r.ascentAt) : '', r.safetyStop == null ? '' : (r.safetyStop ? '有' : '無'), ...(r.stopMin || r.decoStopDone != null ? [5, num(r.stopMin)] : ['', '']), ascentRate(r),
    inc.gas ?? '空気', inc.watchId ? member(inc.watchId).name : '', r.treatAsFirst ? '指揮者判断' : '', edits,
    stamp([r.updatedAt || r.endAt, inc.updatedAt])];
}
const csvName = inc => `潜水記録_${ymdCompact(inc.createdAt)}_${incTitle(inc).replace(/[\\/:*?"<>|\s]/g, '')}.csv`;

/* ===== 記録・経歴簿 ===== */
// 年度（4月始まり）
const fiscalStart = iso => { const [y, m] = ymd(iso).split('/').map(Number); return `${m >= 4 ? y : y - 1}/04/01`; };
function periodRange(p) {
  const y = ymd(nowISO()).slice(0, 4);
  if (p.kind === 'fy') { const st = fiscalStart(nowISO()); return [st, `${Number(st.slice(0, 4)) + 1}/03/31`]; }
  if (p.kind === 'year') return [`${y}/01/01`, `${y}/12/31`];
  if (p.kind === 'custom') return [(p.from || '0000-01-01').replaceAll('-', '/'), (p.to || '9999-12-31').replaceAll('-', '/')];
  return ['0000/01/01', '9999/12/31'];
}
// 全事案から、ある隊員の潜水（削除したものを除く）を集める
function diveRowsFor(memberId) {
  const out = [];
  S.incidents.forEach(inc => inc.divers.forEach(dv => {
    if (dv.memberId !== memberId) return;
    const res = diverResults(inc, dv);
    dv.dives.forEach((d, k) => { if (!d.deleted) out.push({ inc, d, r: res[k], no: d.importNo ?? k + 1, date: ymd(d.startAt) }); });
  }));
  return out.sort((a, b) => String(a.d.startAt).localeCompare(String(b.d.startAt)));
}
function memberStats(m, range) {
  const all = diveRowsFor(m.id);
  const rows = all.filter(x => x.date >= range[0] && x.date <= range[1]);
  const fy = fiscalStart(nowISO());
  return {
    rows, count: rows.length, minutes: rows.reduce((a, x) => a + (Number(x.d.adt) || 0), 0),
    maxDepth: rows.reduce((a, x) => Math.max(a, Number(x.d.maxDepth) || 0), 0) || null,
    lastDate: all.length ? all[all.length - 1].date : null, fyCount: all.filter(x => x.date >= fy).length,
    license: licenseOf(m),
    training: (m.quals || []).filter(q => q.kind === '研修').map(q => q.name + (q.no ? `（${q.no}）` : '')),
    boat: (m.quals || []).filter(q => /小型船舶/.test(q.name)).map(q => q.name + (qualState(q) === 'expired' ? '（期限切れ）' : ''))
  };
}
let rec = { period: { kind: 'fy', from: '', to: '' }, ids: null, showAll: false, q: '', busy: false };
function viewRecords() {
  if (!rec.ids) rec.ids = activeMembers().map(m => m.id);
  const range = periodRange(rec.period);
  const badRange = rec.period.kind === 'custom' && rec.period.from && rec.period.to && rec.period.from > rec.period.to;
  const qq = toHalf(rec.q || '').toLowerCase();
  const list = S.members.filter(m => (rec.showAll || isActive(m) || rec.ids.includes(m.id)) && (!qq || m.name.toLowerCase().includes(qq) || m.id.toLowerCase().includes(qq)));
  const sel = S.members.filter(m => rec.ids.includes(m.id));
  const units = [...new Set(S.members.filter(m => rec.showAll || isActive(m)).map(m => m.unit).filter(Boolean))];
  return `${bar('記録・経歴簿', '', true)}
  <main class="wrap">
    <section class="stack"><h2>期間</h2>
      <div class="chips">${[['fy', '今年度'], ['year', '今年'], ['all', 'すべて'], ['custom', '期間を指定']].map(([v, l]) => `<button class="chip" data-act="rec-period" data-v="${v}" aria-pressed="${rec.period.kind === v}">${ic('check')}${l}</button>`).join('')}</div>
      ${rec.period.kind === 'custom' ? `<div class="grid2"><label class="field"><span>から</span><input class="input num" type="date" id="rec-from" value="${esc(rec.period.from)}"></label><label class="field"><span>まで</span><input class="input num" type="date" id="rec-to" value="${esc(rec.period.to)}"></label></div>` : ''}
      ${badRange ? `<div class="alert">${ic('triangle-alert')}<span>「まで」が「から」より前です。</span></div>` : `<p class="small num">${range[0] === '0000/01/01' ? 'すべての期間' : `${range[0]}〜${range[1]}`}</p>`}
    </section>
    <section class="stack"><h2>隊員（${sel.length}人を選択中）</h2>
      <div class="grid2"><button class="btn" data-act="rec-all">${ic('check')}全員を選ぶ</button><button class="btn" data-act="rec-none">選択を外す</button></div>
      ${units.length > 1 ? `<div class="chips">${units.map(u => `<button class="chip" data-act="rec-unit" data-v="${esc(u)}">${esc(u)}だけ（${S.members.filter(m => m.unit === u && (rec.showAll || isActive(m))).length}人）</button>`).join('')}</div>` : ''}
      ${S.members.length > 8 ? `<label class="field"><span>氏名・職員番号で絞り込み</span><input class="input" id="rec-q" value="${esc(rec.q)}" autocomplete="off"></label>` : ''}
      ${list.length ? `<div class="chips">${list.map(m => `<button class="chip" data-act="rec-member" data-v="${esc(m.id)}" aria-pressed="${rec.ids.includes(m.id)}">${ic('check')}${esc(m.name)} <span class="small num">${esc(m.id)}</span>${isActive(m) ? '' : `（${esc(m.status)}）`}</button>`).join('')}</div>` : `<p class="small">${S.members.length ? '当てはまる隊員がいません。' : '隊員が登録されていません。設定で登録してください。'}</p>`}
      <label class="check"><input type="checkbox" id="rec-showall" ${rec.showAll ? 'checked' : ''}><span>異動・退職の隊員も表示する</span></label>
    </section>
    <section class="stack"><h2>経歴簿</h2>
      ${sel.length > 5 ? (() => {
        const order = { none: 0, unconfirmed: 1, ok: 2 };
        const rows = sel.map(m => ({ m, st: memberStats(m, range) })).sort((a, b) => order[a.st.license] - order[b.st.license]);
        const nNone = rows.filter(x => x.st.license === 'none').length, nUn = rows.filter(x => x.st.license === 'unconfirmed').length;
        return `${nNone || nUn ? `<p class="small"><b>${nNone ? `× 潜水士免許なし ${nNone}人` : ''}${nNone && nUn ? '・' : ''}${nUn ? `免許未確認 ${nUn}人` : ''}</b></p>` : ''}
        <div class="list">${rows.map(({ m, st }) => `<div class="row" style="padding-block:.5rem;flex-wrap:nowrap"><div class="item-main"><div class="item-title">${esc(m.name)} <span class="small num">${esc(m.id)}</span></div>
          <div class="small num">最大 ${st.maxDepth ?? '—'}m・最終 ${st.lastDate ?? '—'}</div></div><div class="num" style="text-align:right"><b>${st.count}本</b><div class="small">${st.license === 'none' ? '<b>× 免許なし</b>' : st.license === 'unconfirmed' ? '免許未確認' : '免許 有'}</div></div></div>`).join('')}</div>`;
      })()
      : sel.length ? `<div class="list">${sel.map(m => { const st = memberStats(m, range); const warn = [st.license === 'none' && '× 潜水士免許の登録なし・期限切れ', st.license === 'unconfirmed' && '潜水士免許が未確認', ...(m.quals || []).filter(q => qualState(q) === 'expired').map(q => `× ${q.name} 期限切れ`), ...(m.quals || []).filter(q => qualState(q) === 'soon').map(q => `${q.name} 期限まで90日以内`)].filter(Boolean); return `<div class="stack" style="padding-block:1rem">
        <div class="item-title">${esc(m.name)} <span class="small num">職員番号 ${esc(m.id)}${m.unit ? `・${esc(m.unit)}` : ''}</span></div>
        ${warn.length ? `<p class="small"><b>${warn.map(esc).join('・')}</b></p>` : ''}
        <dl class="kv small num"><dt>本数</dt><dd>${st.count}本（${hmText(st.minutes)}）</dd><dt>最大水深</dt><dd>${st.maxDepth ?? '—'}m</dd>
          <dt>最終潜水日</dt><dd>${st.lastDate ?? '—'}</dd><dt>今年度</dt><dd>${st.fyCount}本</dd>
          <dt>潜水士免許</dt><dd>${st.license === 'none' ? '<b>× 無（期限切れを含む）</b>' : LICENSE_TEXT[st.license]}</dd><dt>研修</dt><dd>${esc(st.training.join('、') || '—')}</dd></dl>
        ${st.rows.length ? `<div class="small num">${st.rows.slice(-3).reverse().map(x => `<div>${x.date}　${x.d.maxDepth ?? '—'}m ${x.d.adt ?? '—'}分　${statusText(x.r)}<br>${esc(x.inc.type)}・${esc(incTitle(x.inc))}</div>`).join('')}</div>${st.rows.length > 3 ? `<p class="small">ほか ${st.rows.length - 3}本（Excelにはすべて出ます）</p>` : ''}` : '<p class="small">この期間の潜水はありません。</p>'}
      </div>`; }).join('')}</div>` : '<p class="small">隊員を選んでください。</p>'}
    </section>
    <section class="stack"><h2>出力</h2>
      <p class="small">このスマホの記録だけです。正本は署の台帳です。ファイルには氏名と健康に関わる記録が入ります。送る先に注意してください。</p>
      <p class="small">「台帳用CSV」は、台帳の［アプリのCSVを取り込む］で取り込む形です（体調異常などを含む全項目。取り込んだ過去の記録は含めません）。</p>
    </section>
  </main>
  <div class="dock"><div class="dock-in dock-col">
    ${sel.length ? `<label class="check small"><input type="checkbox" id="rec-private" ${rec.hidePrivate ? 'checked' : ''}><span>Excelに体調異常・備考・期別番号を出さない</span></label>` : '<p class="small"><b>隊員を1人以上選んでください。</b></p>'}
    <div class="grid2">
      <button class="btn" data-act="rec-csv" ${sel.length && !badRange && !rec.busy ? '' : 'disabled'}>${ic('download')}台帳用CSV</button>
      <button class="btn btn-primary" data-act="rec-xlsx" ${sel.length && !badRange && !rec.busy ? '' : 'disabled'}>${ic(rec.busy ? 'timer' : 'download')}${rec.busy ? '作成中…' : `Excel（${sel.length}人）`}</button>
    </div>
  </div></div>`;
}

/* ----- Excel 出力（ExcelJS をその場で読み込む。一度開いていれば電波がなくても動く） ----- */
let excelLib = null;
function loadExcel() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return excelLib ||= new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = 'exceljs.min.js';
    sc.onload = () => res(window.ExcelJS); sc.onerror = () => { excelLib = null; rej(new Error('load')); };
    document.head.appendChild(sc);
  });
}
const dateCell = s => { const m = String(s || '').match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : (s || null); };
async function buildWorkbook(ids, range) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = '潜水現場記録'; wb.created = new Date();
  const F = (o = {}) => ({ name: '游ゴシック', size: 10.5, color: { argb: 'FF000000' }, ...o });
  const thin = { style: 'thin', color: { argb: 'FF000000' } }, box = { top: thin, left: thin, bottom: thin, right: thin };
  const now = nowISO(), today = ymd(now), period = range[0] === '0000/01/01' ? 'すべての期間' : `${range[0]}〜${range[1]}`;
  const fy = fiscalStart(now), fyLabel = `${fy.slice(0, 4)}年度`;
  const hide = !!rec.hidePrivate;
  const members = S.members.filter(m => ids.includes(m.id));
  const used = new Set();
  // シート名：Excel で使えない文字と ' を除き、大文字小文字を区別せずに重複を避ける
  const sheetName = base => { base = base.replace(/[\\/?*[\]:']/g, '').slice(0, 28) || '隊員'; let n = base, k = 2; while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)}${k++}`; used.add(n.toLowerCase()); return n; };
  const foot = `&L潜水現場記録 v${APP_VERSION}&C&P / &N&R計算の目安。このスマホの記録のみ・正本は署の台帳`;
  const fit = (ws, landscape) => {
    ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, blackAndWhite: true, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.25, footer: 0.25 } };
    ws.headerFooter = { oddHeader: `&R出力 ${today} ${hm(now)}`, oddFooter: foot };
  };
  const put = (ws, r, c, v, o = {}) => { const cell = ws.getCell(r, c); cell.value = v; cell.font = F(o.font); if (o.border) cell.border = box; if (o.fmt) cell.numFmt = o.fmt; if (o.wrap) cell.alignment = { wrapText: true, vertical: 'middle' }; return cell; };
  const stats = {};
  members.forEach(m => { stats[m.id] = memberStats(m, range); const all = diveRowsFor(m.id); stats[m.id].allCount = all.length; stats[m.id].allMin = all.reduce((a, x) => a + (Number(x.d.adt) || 0), 0); });
  const rescueOf = m => (m.quals || []).filter(q => /水難救助/.test(q.name)).map(q => q.name + (q.no && !hide ? `（${q.no}）` : '')).join('、');

  // 隊員一覧
  const wl = wb.addWorksheet(sheetName('隊員一覧'));
  put(wl, 1, 1, '隊員一覧', { font: { size: 14, bold: true } });
  put(wl, 2, 1, `期間：${period}`); put(wl, 2, 10, '出力日'); put(wl, 2, 11, dateCell(today), { fmt: 'yyyy/mm/dd' });
  ['職員番号', '氏名', '所属', '在籍', '潜水士免許', '水難救助研修', '小型船舶', '本数（期間）', '潜水時間（期間）', '最大水深（期間）', '最終潜水日（全期間）', `今年度本数（${fyLabel}）`, '累計本数']
    .forEach((h, i) => put(wl, 4, i + 1, h, { font: { bold: true }, border: true, wrap: true }));
  members.forEach((m, k) => {
    const st = stats[m.id], r = 5 + k;
    [m.id, m.name, m.unit || '', m.status || '在籍', LICENSE_TEXT[st.license], rescueOf(m), st.boat.join('、'), st.count, st.minutes, st.maxDepth, dateCell(st.lastDate), st.fyCount, st.allCount]
      .forEach((v, i) => put(wl, r, i + 1, v ?? '', { border: true, font: { bold: i === 4 && st.license !== 'ok' }, fmt: i === 8 ? '0"分"' : i === 9 ? '0.0"m"' : i === 10 ? 'yyyy/mm/dd' : undefined }));
  });
  [10.01, 14, 12, 7.01, 10, 18, 16, 9.01, 11, 11, 13, 13, 9.01].forEach((w, i) => { wl.getColumn(i + 1).width = w; });
  wl.views = [{ state: 'frozen', ySplit: 4 }];
  fit(wl, true);

  // 経歴簿（1人1シート。台帳の「経歴簿」と同じ並び）
  members.forEach(m => {
    const st = stats[m.id];
    const ws = wb.addWorksheet(sheetName(`経歴簿_${m.name}`));
    put(ws, 1, 1, '潜水経歴簿', { font: { size: 14, bold: true } });
    put(ws, 2, 1, `期間：${period}`); put(ws, 2, 8, '出力日'); put(ws, 2, 9, dateCell(today), { fmt: 'yyyy/mm/dd' });
    const kv = (r, c, label, value, fmt) => { put(ws, r, c, label, { font: { size: 9.5 }, border: true }); put(ws, r, c + 1, value ?? '—', { font: { bold: true }, border: true, fmt }); };
    kv(4, 2, '職員番号', m.id); kv(4, 5, '氏名', m.name); kv(4, 8, '所属', m.unit || '');
    kv(5, 2, '潜水士免許', LICENSE_TEXT[st.license]); kv(5, 5, '水難救助研修', rescueOf(m) || '—'); kv(5, 8, '小型船舶', st.boat.join('、') || '—');
    kv(6, 2, '累計本数', st.allCount, '0"本"'); kv(6, 5, '累計潜水時間', st.allMin, '0"分"'); kv(6, 8, '最終潜水日', dateCell(st.lastDate), 'yyyy/mm/dd');
    kv(7, 2, '本数（期間）', st.count, '0"本"'); kv(7, 5, '潜水時間（期間）', st.minutes, '0"分"'); kv(7, 8, '最大水深（期間）', st.maxDepth, '0.0"m"');
    kv(8, 2, `今年度本数（${fyLabel}）`, st.fyCount, '0"本"');
    const H = ['No', '日付', '区分', '事案・訓練名', '地点', '最大水深(m)', '潜水時間(分)', '水面休息(分)', 'グループ', '減圧停止(表の判定)', '体調異常', '指揮者'];
    H.forEach((h, i) => put(ws, 10, i + 1, h, { font: { bold: true, size: 9.5 }, border: true, wrap: true }));
    st.rows.forEach((x, k) => {
      [k + 1, dateCell(x.date), x.inc.type, incTitle(x.inc), x.inc.site || '', x.d.maxDepth ?? '', x.d.adt ?? '', x.r.siMin != null ? Math.floor(x.r.siMin) : '', x.r.group ?? '', x.d.imported && x.d.decoTable ? x.d.decoTable : (x.r.status === 'deco' ? '有' : '無'), hide ? '' : (x.d.condition || ''), x.inc.commanderId ? member(x.inc.commanderId).name : '']
        .forEach((v, i) => put(ws, 11 + k, i + 1, v, { border: true, font: { bold: (i === 9 || i === 10) && v === '有' }, fmt: i === 1 ? 'yyyy/mm/dd' : undefined }));
    });
    if (!st.rows.length) put(ws, 11, 1, 'この期間の潜水はありません。');
    [5.01, 11, 7.01, 22, 14, 9.01, 9.01, 9.01, 8, 10, 8, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 10 }];
    fit(ws, true);
    ws.pageSetup.printTitlesRow = '10:10';
  });

  // 潜水記録（参照用。台帳へは「台帳用CSV」を取り込む）
  const wd = wb.addWorksheet(sheetName('潜水記録（参照用）'));
  put(wd, 1, 1, '参照用です。台帳へは、このシートを貼らずに、アプリの「台帳用CSV」を取り込んでください（列の並びが台帳と違います）。', { font: { bold: true } });
  const priv = new Set(['体調異常', '備考', '事案備考', '修正記録']);
  CSV_HEAD.forEach((h, i) => { const c = wd.getCell(2, i + 1); c.value = h; });
  wd.getRow(2).font = F({ bold: true, size: 9.5 });
  let rn = 3;
  members.forEach(m => stats[m.id].rows.forEach(x => {
    const r = { ...x.d, memberId: m.id, name: m.name, no: x.no, tank: x.d.tank ?? S.settings.tank, si: x.r.siMin != null ? Math.floor(x.r.siMin) : '', res: x.r };
    const vals = csvValues(x.inc, r).map((v, i) => (hide && priv.has(CSV_HEAD[i]) ? '' : v));
    vals[0] = dateCell(vals[0]);
    wd.getRow(rn++).values = vals.map(v => (v === '' ? null : v));
  }));
  // 書式は列ごとにまとめて持たせる（セルごとに持たせると、大量のときに重くなる）
  CSV_HEAD.forEach((h, i) => { const col = wd.getColumn(i + 1); col.width = Math.min(22, Math.max(8, h.length * 1.6)); col.font = F({ size: 9.5 }); });
  wd.getColumn(1).numFmt = 'yyyy/mm/dd';
  wd.getRow(2).font = F({ bold: true, size: 9.5 });
  wd.views = [{ state: 'frozen', ySplit: 2 }];
  wd.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(rn - 1, 2), column: CSV_HEAD.length } };
  fit(wd, true);
  wd.pageSetup.printArea = `A1:R${Math.max(rn - 1, 2)}`;
  const a1 = wd.getCell('A1'); a1.font = F({ bold: true }); a1.numFmt = '@';

  // 資格・研修
  const wq = wb.addWorksheet(sheetName('資格・研修'));
  ['職員番号', '氏名', '種別', '名称', '取得・修了日', '有効期限', '状態', '確認', '期別・番号', '備考'].forEach((h, i) => put(wq, 1, i + 1, h, { font: { bold: true }, border: true }));
  let qn = 2;
  members.forEach(m => (m.quals || []).forEach(q => {
    const stt = qualState(q);
    [m.id, m.name, q.kind, q.name, dateCell(q.date), dateCell(q.expires), stt === 'expired' ? '× 期限切れ' : stt === 'soon' ? '期限まで90日以内' : '', q.confirmedAt ? `${q.confirmedBy || ''} ${ymd(q.confirmedAt)}` : '未確認（本人入力）', hide ? '' : (q.no || ''), hide ? '' : (q.note || '')]
      .forEach((v, i) => put(wq, qn, i + 1, v ?? '', { border: true, font: { bold: i === 6 && stt === 'expired' }, fmt: i === 4 || i === 5 ? 'yyyy/mm/dd' : undefined }));
    qn++;
  }));
  [10.01, 14, 6, 18, 12, 12, 14, 18, 14, 20].forEach((w, i) => { wq.getColumn(i + 1).width = w; });
  fit(wq, true);
  return wb;
}
async function exportRecords() {
  const ids = rec.ids || [], range = periodRange(rec.period);
  if (!ids.length) { toast('隊員を選んでください'); return; }
  let wb, buf;
  try { await loadExcel(); } catch (e) { toast('Excelの部品を読み込めませんでした。一度、電波のある所でアプリを開いてください'); return; }
  try { wb = await buildWorkbook(ids, range); buf = await wb.xlsx.writeBuffer(); }
  catch (e) { toast(`Excelを作れませんでした（${String(e && e.message || e).slice(0, 60)}）。人数を減らして試してください`); return; }
  const one = ids.length === 1 ? `_${(S.members.find(m => m.id === ids[0])?.name || '').replace(/[\\/:*?"<>|\s]/g, '')}` : `_${ids.length}人`;
  const name = `潜水経歴簿${one}_${ymdCompact(nowISO())}.xlsx`, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const r = await shareText(name, buf, type);
  if (r === 'shared') toast('送る画面を開きました');
  else if (r === 'unsupported') toast(downloadText(name, buf, type) ? 'Excelファイルを保存しました' : 'この画面では保存できません');
}
// 台帳用CSV：選んだ隊員・期間の潜水を、アプリのCSVと同じ形で（削除した記録も「状態=削除」で入る）
async function exportRecordsCSV() {
  const ids = rec.ids || [], range = periodRange(rec.period);
  if (!ids.length) { toast('隊員を選んでください'); return; }
  const q = v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [CSV_HEAD.map(q).join(',')];
  S.incidents.forEach(inc => { if (inc.imported) return; csvRows(inc).forEach(r => { const d = ymd(r.startAt); if (!r.imported && ids.includes(r.memberId) && d >= range[0] && d <= range[1]) lines.push(csvValues(inc, r).map(q).join(',')); }); });
  if (lines.length < 2) { toast('この期間の記録はありません'); return; }
  const text = '﻿' + lines.join('\r\n') + '\r\n', name = `潜水記録_台帳用_${ymdCompact(nowISO())}.csv`;
  const r = await shareText(name, text, 'text/csv');
  if (r === 'shared') toast('送る画面を開きました');
  else if (r === 'unsupported') toast(downloadText(name, text, 'text/csv') ? 'CSVを保存しました' : 'この画面では保存できません');
}

/* ----- 過去の記録の取り込み（台帳の「CSV抽出」で保存したCSV、またはアプリのCSV） ----- */
function parseCSV(text) {
  const rows = []; let f = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { f.push(cur); cur = ''; }
    else if (ch === '\n') { f.push(cur); rows.push(f); f = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || f.length) { f.push(cur); rows.push(f); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}
// 「2025/5/14」「2025-05-14」と「9:20」を日本時間の ISO に
function isoFromYmdHm(day, hhmm) {
  const m = String(day || '').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/), t = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const p2 = v => String(v).padStart(2, '0');
  return new Date(`${m[1]}-${p2(m[2])}-${p2(m[3])}T${t ? p2(t[1]) : '00'}:${t ? t[2] : '00'}:00+09:00`).toISOString();
}
function importPastCSV(text) {
  if (text.includes('\ufffd')) return { error: 'CSVの文字を読めませんでした。Excelで開いて保存し直したCSVのようです。Excelの［名前を付けて保存］で「CSV UTF-8（コンマ区切り）」を選んで保存し直すか、元のファイルを使ってください。' };
  const rows = parseCSV(text);
  if (rows.length < 2) return { error: 'CSVの中身がありません。' };
  const h = rows[0].map(x => x.trim());
  const need = ['日付', '職員番号', '事案ID', '本数'];
  if (!need.every(n => h.includes(n))) return { error: '台帳の「CSV抽出」か、アプリのCSVではありません（日付・職員番号・事案ID・本数の列が必要です）。' };
  const unq = v => (/^'[=+\-@\t]/.test(v) ? v.slice(1) : v);
  const F = (r, n) => { const i = h.indexOf(n); return i < 0 ? '' : unq(String(r[i] ?? '').trim()); };
  const num = v => { const x = numOrBlank(v); return x === '' || Number.isNaN(x) ? null : x; };
  const nameOf = v => S.members.find(m => m.id === v);
  const known = new Set(); S.incidents.forEach(i => i.divers.forEach(d => d.dives.forEach(x => known.add(x.id))));
  let added = 0, skipped = 0, bad = 0, newMembers = 0, newInc = 0;
  const badRows = [], appRows = [];
  const okText = v => v.length <= 120 && !/[\u0000-\u001f<>"'`]/.test(v);
  rows.slice(1).forEach((r, k) => {
    const line = k + 2; // CSVの行番号（見出しが1行目）
    const iid = F(r, '事案ID'), mid = toHalf(F(r, '職員番号')), no = toHalf(F(r, '本数'));
    const startAt = isoFromYmdHm(F(r, '日付'), F(r, '潜降時刻'));
    if (!iid || !mid || !startAt || !/^[0-9A-Za-z_-]+$/.test(mid) || !okText(iid)) { bad++; badRows.push(line); return; }
    if (F(r, '状態') === '削除') { skipped++; return; }
    // 本数が空の行は、行番号で区別する（同じ事案の2本目が「取り込み済み」にされないように）
    const id = F(r, '記録ID') || `imp-${iid}-${mid}-${no || 'L' + line}`;
    if (!okText(id)) { bad++; badRows.push(line); return; }
    if (known.has(id)) { skipped++; return; }
    let inc = S.incidents.find(i => i.id === iid);
    if (inc && !inc.imported) { appRows.push(line); return; } // このスマホで記録した事案は、取り込みで変えない
    if (inc && no && inc.divers.some(d => d.memberId === mid && d.dives.some(x => String(x.importNo) === String(Number(no) || no)))) { skipped++; return; }
    if (!nameOf(mid)) { S.members.push({ id: mid, name: F(r, '氏名') || `職員番号 ${mid}`, status: '在籍', quals: [] }); newMembers++; }
    if (!inc) {
      const st = F(r, '事案開始'), en = F(r, '事案終了');
      const created = isoFromYmdHm(st || F(r, '日付'), st ? st.split(' ')[1] : F(r, '潜降時刻')) || startAt;
      const cmd = S.members.find(m => m.name === F(r, '指揮者')), watch = S.members.find(m => m.name === F(r, '監視員'));
      inc = { id: iid, imported: true, createdAt: created, updatedAt: nowISO(), sentAt: nowISO(), type: F(r, '区分') || 'その他', title: F(r, '事案・訓練名'), site: F(r, '地点'),
        commanderId: cmd?.id || '', watchId: watch?.id || '', gas: F(r, '呼吸ガス') || '空気', memo: F(r, '事案備考'), waterTemp: F(r, '水温(℃)'), visibility: F(r, '透視度(m)'), sea: F(r, '海況'),
        strict: false, status: 'closed', closedAt: en ? isoFromYmdHm(en, en.split(' ')[1]) : null, tableId: BUILTIN_ID, tableSnap: BUILTIN_TABLE, divers: [] };
      S.incidents.push(inc); newInc++;
    }
    let dv = inc.divers.find(d => d.memberId === mid);
    if (!dv) { dv = { memberId: mid, tank: num(F(r, 'タンク容量(L)')) ?? S.settings.tank, sac: S.settings.sac, current: null, nextFirst: false, dives: [] }; inc.divers.push(dv); }
    const noTime = !F(r, '潜降時刻');
    let endAt = (!noTime && isoFromYmdHm(F(r, '日付'), F(r, '浮上時刻'))) || startAt;
    if (endAt < startAt) endAt = new Date(new Date(endAt).getTime() + 86400000).toISOString();
    let ascentAt = F(r, '浮上開始時刻') ? isoFromYmdHm(F(r, '日付'), F(r, '浮上開始時刻')) : null;
    if (ascentAt && ascentAt < startAt) ascentAt = new Date(new Date(ascentAt).getTime() + 86400000).toISOString();
    const stop = num(F(r, '浮上停止の時間(分)'));
    // 空欄は空欄のまま（無いはずの値を作らない）
    const ss = F(r, '安全停止');
    dv.dives.push({ id, imported: true, importNo: no ? Number(no) || no : null, noTime, startAt, ascentAt, endAt, updatedAt: nowISO(), plannedDepth: num(F(r, '予定水深(m)')), tank: num(F(r, 'タンク容量(L)')), startP: num(F(r, '開始圧(気圧)')), endP: num(F(r, '終了圧(気圧)')),
      maxDepth: num(F(r, '最大水深(m)')), adt: num(F(r, '潜水時間(分)')), safetyStop: ss === '' ? null : ss === '有', stopMin: stop,
      decoTable: F(r, '減圧停止(表の判定)') || F(r, '減圧停止'), decoStopDone: (F(r, '減圧停止(表の判定)') || F(r, '減圧停止')) === '有' ? stop : null, condition: F(r, '体調異常'), note: F(r, '備考'), treatAsFirst: F(r, '1本目扱い') !== '' });
    dv.dives.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
    known.add(id); added++;
  });
  return { added, skipped, bad, badRows, appRows, newMembers, newInc };
}

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
      ${S.members.length ? `<div class="list">${S.members.map(m => `<button class="item" data-act="sheet" data-sheet="member" data-id="${esc(m.id)}"><div class="item-main"><div class="item-title">${esc(m.name)}${isActive(m) ? '' : ` <span class="state">${esc(m.status)}</span>`}</div><div class="small num">職員番号 ${esc(m.id)}${m.unit ? `・${esc(m.unit)}` : ''}・資格・研修 ${(m.quals || []).length}件・潜水士免許 ${licenseOf(m) === 'none' ? '<b>× 無</b>' : LICENSE_TEXT[licenseOf(m)]}</div></div>${ic('chevron-right')}</button>`).join('')}</div>` : '<p class="small">まだ登録がありません。</p>'}
      ${isLeader() ? `<div class="grid2">
        <label class="field"><span>職員番号</span><input class="input num" id="m-id" inputmode="numeric"></label>
        <label class="field"><span>氏名</span><input class="input" id="m-name"></label>
      </div>
      <button class="btn" data-act="add-member">${ic('user-plus')}隊員を追加</button>
      <details class="stack"><summary class="small"><b>まとめて登録する（Excelの隊員マスタから貼り付け）</b></summary>
        <p class="small">1行に「職員番号,氏名」。Excelの2列をコピーして貼り付けても読み取れます。</p>
        <textarea class="input" id="m-bulk" placeholder="1001,宮古 太郎&#10;1002,伊良部 次郎"></textarea>
        <button class="btn" data-act="bulk-member">${ic('upload')}まとめて登録</button>
      </details>` : `<p class="small">隊員の追加は隊長が行います。自分の名前を押すと、資格・研修を入れられます。</p>`}
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
    ${CLOUD ? `<section class="stack"><h2>ログイン</h2>
      <p class="small">${esc(me()?.name || '')}（職員番号 ${esc(me()?.id || '')}・${{ admin: '管理者', leader: '隊長', member: '隊員' }[me()?.role] || '隊員'}）　${syncBadge()}</p>
      <div class="grid2"><button class="btn" data-act="sync-now">${ic('refresh-cw')}今すぐ共有</button><button class="btn" data-act="logout">${ic('log-out')}ログアウト</button></div>
      ${logoutConfirm ? `<div class="alert">${ic('triangle-alert')}<span>まだ送れていない記録が ${pendingCount()}件あります。ログアウトすると消えます。電波のある所で「今すぐ共有」を押してからにしてください。それでもログアウトするなら、もう一度「ログアウト」を押してください。</span></div>` : ''}
      <p class="small">ログアウトすると、この端末の記録を消します（共有の記録は残ります）。現場用スマホを別の人が使うときに押してください。</p>
    </section>` : ''}
    <section class="stack" ${isLeader() ? '' : 'hidden'}><h2>過去の記録を取り込む</h2>
      <p class="small">アプリを使う前の潜水記録を、経歴簿に入れます。台帳の「CSV抽出」シートで［CSVで保存］したファイル、またはアプリのCSVを選んでください。同じ記録は二重に入りません。</p>
      <label class="btn btn-block">${ic('upload')}CSVを選んで取り込む<input type="file" id="past-file" accept=".csv,text/csv" hidden></label>
      ${st.lastImport ? `<div class="alert soft">${ic('info')}<span>前回の取り込み（${ymd(st.lastImport.at)} ${hm(st.lastImport.at)}）：${st.lastImport.error ? esc(st.lastImport.error)
        : `${st.lastImport.added}本・事案 ${st.lastImport.newInc}件・隊員 ${st.lastImport.newMembers}人を追加${st.lastImport.skipped ? `、取り込み済み ${st.lastImport.skipped}本` : ''}${st.lastImport.appRows?.length ? `、このスマホで記録した事案の行 ${st.lastImport.appRows.length}行は取り込まず` : ''}${st.lastImport.bad ? `、<b>読めなかった行 ${st.lastImport.bad}行（${(st.lastImport.badRows || []).slice(0, 20).join('・')}行目${(st.lastImport.badRows || []).length > 20 ? ' ほか' : ''}）</b>` : ''}`}</span></div>` : ''}
    </section>
    <section class="stack" ${CLOUD ? 'hidden' : ''}><h2>データの控え</h2>
      <p class="small">記録はこのスマホの中だけにあります。端末の故障や機種変更に備えて、月に1回はすべての記録をファイルに控え、署のパソコンなど端末の外に保管してください。<br>
      最後に控えを作った日：<b>${st.lastBackup ? `${ymd(st.lastBackup)} ${hm(st.lastBackup)}` : 'まだありません'}</b>${persisted === false ? '<br>この端末では、空き容量が少ないと記録が消される設定です。ホーム画面に追加して使ってください。' : ''}</p>
      <div class="grid2">
        <button class="btn" data-act="backup">${ic('download')}控えを作る</button>
        <label class="btn">${ic('upload')}控えから戻す<input type="file" id="restore-file" accept=".json,application/json" hidden></label>
      </div>
    </section>
    <section class="stack" ${CLOUD ? 'hidden' : ''}><h2>すべての記録を消す</h2>
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
    case 'login': await doLogin(); break;
    case 'logout': doLogout(); break;
    case 'sync-now': syncNote = ''; await syncNow(); break;
    case 'p-role': { const m = S.members.find(x => x.id === sheet.id); if (!m || !isAdmin()) break; snapshot(); m.role = m.role === 'leader' ? 'member' : 'leader'; saved(); renderSheet(); render(); toast(m.role === 'leader' ? `${m.name}を隊長にしました` : `${m.name}を隊長から外しました`, true); break; }
    case 'home-all': homeAll = !homeAll; render(); break;
    case 'rec-period': readRecDates(); rec.period.kind = el.dataset.v; render(); break;
    case 'rec-member': { const v = el.dataset.v; rec.ids = rec.ids.includes(v) ? rec.ids.filter(x => x !== v) : [...rec.ids, v]; render(); break; }
    case 'rec-all': rec.ids = S.members.filter(m => rec.showAll || isActive(m)).map(m => m.id); render(); break;
    case 'rec-unit': rec.ids = S.members.filter(m => m.unit === el.dataset.v && (rec.showAll || isActive(m))).map(m => m.id); render(); toast(`${el.dataset.v}の${rec.ids.length}人を選びました`); break;
    case 'rec-csv': readRecDates(); exportRecordsCSV(); break;
    case 'rec-none': rec.ids = []; render(); break;
    case 'rec-xlsx': readRecDates(); rec.busy = true; render(); try { await exportRecords(); } finally { rec.busy = false; render(); } break;
    case 'back': history.length > 1 ? history.back() : go('home'); break;
    case 'go': if (view.name === 'new') readDraft(); if (el.dataset.to === 'new') draft = null; if (el.dataset.to === 'records') { rec.ids = null; rec.q = ''; } go(el.dataset.to); break;
    case 'open-inc': { const x = S.incidents.find(i => i.id === el.dataset.id); go(x.status === 'active' && !x.imported ? 'board' : 'summary', { incidentId: x.id }); break; }
    case 'go-summary': go('summary', { incidentId: inc.id }); break;
    case 'undo': if (undoSnap) { S = JSON.parse(undoSnap); undoSnap = null; saved(); $('#toast').hidden = true; sheet = null; render(); toast('元に戻しました'); } break;
    case 'sheet-close': closeSheet(); break;
    case 'sheet-close-back': if (e.target === el) closeSheet(); break;
    case 'sheet': openSheet(el.dataset.sheet, { i: I, k: el.dataset.k != null ? Number(el.dataset.k) : null, id: el.dataset.id ?? null }); break;
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
    case 'next-first': { const dv = inc.divers[I]; snapshot(); dv.nextFirst = true; touch(inc); saved(); if (sheet) renderSheet(); render(); toast('次の潜水を1本目として扱います', true); break; }
    case 'next-first-off': { const dv = inc.divers[I]; dv.nextFirst = false; touch(inc); saved(); renderSheet(); render(); break; }

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
    case 'edit-safety': sheet.safety = el.dataset.v; readEditInputsToSheet(); renderSheet(); restoreEditInputs(); break;
    case 'save-edit': {
      const dv = inc.divers[sheet.i], d = dv.dives[sheet.k];
      const st = isoFromHM(d.startAt, $('#e-start').value), en = isoFromHM(d.startAt, $('#e-end').value);
      if (!st || !en) { toast('時刻を「時:分」で入れてください'); break; }
      const vals = ['#e-depth', '#e-adt', '#e-startp', '#e-endp', '#e-stop'].map(id => numOrBlank($(id).value));
      if (vals.some(Number.isNaN)) { toast('水深・時間・圧・停止時間は数字で入れてください'); break; }
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
      [d.maxDepth, d.adt, d.startP, d.endP] = vals.slice(0, 4).map(v => (v === '' ? null : v));
      d.safetyStop = (sheet.safety ?? (d.safetyStop ? '有' : '無')) === '有';
      // 5mの停止時間が空なら、安全停止をした場合はその分（3分）を入れる
      const stopDefault = d.safetyStop ? (incidentTable(inc).data.rules?.safetyStopMinutes ?? 3) : 0;
      d.stopMin = vals[4] === '' ? stopDefault : vals[4]; d.decoStopDone = vals[4] === '' ? null : vals[4];
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
    case 'add-diver': snapshot(); inc.divers.push({ memberId: el.dataset.v, tank: S.settings.tank, sac: S.settings.sac, current: null, nextFirst: false, dives: [] }); touch(inc); saved(); sheet = null; render(); toast(`${member(el.dataset.v).name}を追加しました`, true); break;
    case 'remove-diver': snapshot(); inc.divers.splice(I, 1); touch(inc); saved(); sheet = null; render(); toast('潜水員を外しました', true); break;

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
    case 'reopen-inc': if (inc.imported) break; inc.status = 'active'; touch(inc); saved(); go('board', { incidentId: inc.id }); break;

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
      if (!isLeader()) break;
      const id = toHalf($('#m-id').value), name = $('#m-name').value.trim();
      if (!id || !name) { toast('職員番号と氏名を入れてください'); break; }
      if (S.members.some(m => m.id === id)) { toast('同じ職員番号がすでにあります'); break; }
      S.members.push({ id, name, status: '在籍', quals: [] }); saved(); render(); toast(`${name}を登録しました`); break;
    }
    case 'bulk-member': {
      if (!isLeader()) break;
      const lines = $('#m-bulk').value.split(/\r?\n/).map(l => l.split(/[,\t]/).map(s => s.trim())).filter(p => p[0] && p[1]);
      let add = 0; const skip = [];
      lines.forEach(([id, name]) => { id = toHalf(id); if (!/^[0-9A-Za-z_-]+$/.test(id)) skip.push(`${id}（番号の形）`); else if (S.members.some(m => m.id === id)) skip.push(`${id}（登録済み）`); else { S.members.push({ id, name, status: '在籍', quals: [] }); add++; } });
      saved(); render(); toast(`${add}人を登録しました${skip.length ? `。登録しなかった行：${skip.slice(0, 5).join('、')}${skip.length > 5 ? ` ほか${skip.length - 5}行` : ''}` : ''}`); break;
    }
    case 'p-status': sheet.status = el.dataset.v; { const keep = [$('#p-name').value, $('#p-unit').value]; renderSheet(); $('#p-name').value = keep[0]; $('#p-unit').value = keep[1]; } break;
    case 'q-kind': case 'q-pick': {
      const ids = ['#q-name', '#q-date', '#q-exp', '#q-no', '#q-note'], keep = ids.map(id => $(id)?.value ?? '');
      if (act === 'q-kind') { sheet.kind = el.dataset.v; sheet.qname = null; } else sheet.qname = el.dataset.v;
      renderSheet(); ids.forEach((id, k) => { if ($(id)) $(id).value = keep[k]; }); break;
    }
    case 'confirm-qual': {
      const m = S.members.find(x => x.id === sheet.id), q = (m.quals || []).find(x => x.id === el.dataset.id);
      if (!isLeader()) break;
      const who = CLOUD ? (me()?.name || '') : ($('#q-who')?.value || '');
      if (!who.trim()) { toast('確かめた担当者の氏名を入れてください'); $('#q-who')?.focus(); break; }
      snapshot(); q.confirmedAt = nowISO(); q.confirmedBy = who.trim(); saved(); renderSheet(); render(); toast(`${q.name}を確認済みにしました`, true); break;
    }
    case 'save-member': {
      if (!isLeader()) break;
      const m = S.members.find(x => x.id === sheet.id), name = $('#p-name').value.trim();
      if (!name) { toast('氏名を入れてください'); break; }
      const ns = sheet.status ?? m.status ?? '在籍';
      snapshot(); if (ns !== (m.status || '在籍')) m.statusAt = todayDash().replaceAll('-', '/');
      m.name = name; m.unit = $('#p-unit').value.trim(); m.status = ns;
      saved(); renderSheet(); render(); toast('保存しました', true); break;
    }
    case 'add-qual': {
      const m = S.members.find(x => x.id === sheet.id);
      if (!isLeader() && me()?.id !== m.id) break;
      const q = { id: uid(), kind: sheet.kind || '資格', name: normQualName(sheet.qname || $('#q-name')?.value || ''), date: $('#q-date').value, expires: $('#q-exp').value, no: $('#q-no').value.trim(), note: $('#q-note').value.trim(), addedAt: nowISO() };
      if (!q.name || !q.date) { toast('名称と取得・修了日を入れてください'); break; }
      if (q.date > todayDash()) { toast('取得・修了日が未来の日付です'); break; }
      if (q.expires && q.expires < q.date) { toast('有効期限が取得日より前です'); break; }
      snapshot(); (m.quals ||= []).push(q); sheet.qname = null; saved(); renderSheet(); render(); toast(`${m.name}（${m.id}）に${q.name}を追加しました`, true); break;
    }
    case 'del-qual': { const m = S.members.find(x => x.id === sheet.id); snapshot(); m.quals = (m.quals || []).filter(q => q.id !== el.dataset.id); saved(); renderSheet(); render(); toast('削除しました', true); break; }
    case 'del-member': {
      const id = el.dataset.id;
      if (S.incidents.some(i => i.commanderId === id || i.watchId === id || i.divers.some(d => d.memberId === id))) { toast('記録に使われているため削除できません。異動・退職にしてください'); break; }
      snapshot(); S.members = S.members.filter(m => m.id !== id); saved(); sheet = null; render(); toast('隊員を削除しました', true); break;
    }
    case 'theme': S.settings.theme = el.dataset.v; saved(); render(); break;
    case 'backup': {
      const name = `潜水現場記録_控え_${ymdCompact(nowISO())}.json`, text = JSON.stringify(strip(S, 'sync'));
      const r = await shareText(name, text, 'application/json');
      if (r === 'shared' || (r === 'unsupported' && downloadText(name, text, 'application/json'))) { S.settings.lastBackup = nowISO(); saved(); render(); toast('控えを作りました。署のパソコンなど、この端末の外に保管してください'); }
      else if (r !== 'cancel') toast('この環境では保存できません');
      break;
    }
    case 'wipe': if (confirmWipe === '削除') {
      // 退避した古い記録・壊れた記録も含めて、この端末の記録を消す
      try { Object.keys(localStorage).filter(k => k.startsWith(LS_KEY)).forEach(k => localStorage.removeItem(k)); } catch (er) {}
      try { if (typeof indexedDB !== 'undefined') await IDB.tx('readwrite', st => { st.clear(); }); }
      catch (er) { if (!useLS) { toast('記録を消せませんでした。アプリを開き直してから、もう一度押してください'); break; } toast('この端末の別の保存先（IndexedDB）は消せませんでした'); }
      S = { ...sampleState(), members: [], incidents: [] }; confirmWipe = ''; saved(); go('home'); toast('すべての記録を消しました'); } break;
  }
});

function readRecDates() { if ($('#rec-from')) { rec.period.from = $('#rec-from').value; rec.period.to = $('#rec-to').value; } }
function touch(inc) { if (inc) inc.updatedAt = nowISO(); }
function markSent(inc) { inc.sentAt = nowISO(); saved(); render(); }
// 保存して、失敗したらその場で知らせる
function saved() { save(); syncSoon(); return storageOK; }

/* 入力値をシートの状態へ */
function readDownInputs() { if (!sheet) return; sheet.startP = $('#d-startp')?.value.trim() ?? sheet.startP; sheet.tank = $('#d-tank')?.value.trim() ?? sheet.tank; }
function readUpInputs() {
  if (!sheet) return;
  sheet.maxDepth = $('#u-depth')?.value.trim() ?? sheet.maxDepth; sheet.adt = $('#u-adt')?.value.trim() ?? sheet.adt;
  sheet.endP = $('#u-endp')?.value.trim() ?? sheet.endP; sheet.note = $('#u-note')?.value.trim() ?? sheet.note;
  sheet.decoStop = $('#u-deco')?.value.trim() ?? sheet.decoStop;
}
let editBuf = null, incBuf = null;
function readEditInputsToSheet() { editBuf = ['#e-start', '#e-end', '#e-depth', '#e-adt', '#e-startp', '#e-endp', '#e-stop', '#e-note', '#e-why'].map(id => [id, $(id)?.value]); editBuf.push(['#e-first', $('#e-first')?.checked]); }
function restoreEditInputs() { (editBuf || []).forEach(([id, v]) => { const el = $(id); if (!el) return; if (id === '#e-first') el.checked = v; else el.value = v; }); }
function readIncInputsToSheet() { incBuf = ['#i-title', '#i-site', '#i-cmd', '#i-watch', '#i-gas', '#i-temp', '#i-vis', '#i-sea', '#i-memo'].map(id => [id, $(id)?.value]); }
function restoreIncInputs() { (incBuf || []).forEach(([id, v]) => { const el = $(id); if (el) el.value = v; }); }

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'rec-q') { if (e.isComposing) return; rec.q = t.value; const pos = t.selectionStart; render(); const n = $('#rec-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) {} } return; }
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
  if (t.id === 'rec-showall') { rec.showAll = t.checked; render(); }
  if (t.id === 'rec-private') { rec.hidePrivate = t.checked; }
  if (t.id === 'rec-from' || t.id === 'rec-to') { readRecDates(); render(); }
  if (t.id === 'table-file') readFile(t, text => {
    try {
      const data = JSON.parse(text.replace(/^\ufeff/, ''));
      const check = Engine.validate(data);
      pending = { data, check, changes: check.errors.length ? [] : Engine.diff(activeTable().data, data) };
    } catch (er) { pending = { error: 'ファイルの中身を読み取れませんでした。Excelから書き出した潜水表ファイル（.json）を選んでください。' }; }
    render();
  });
  if (t.id === 'past-file' && isLeader()) readFile(t, text => {
    snapshot();
    const r = importPastCSV(text);
    if (r.error) { S.settings.lastImport = { at: nowISO(), error: r.error }; saved(); render(); toast('取り込めませんでした'); return; }
    S.settings.lastImport = { at: nowISO(), ...r };
    saved(); render();
    toast(!r.added && (r.skipped || r.appRows.length) && !r.bad ? `すべて取り込み済みです（${r.skipped + r.appRows.length}本）` : `${r.added}本を取り込みました（事案 ${r.newInc}件・隊員 ${r.newMembers}人を追加${r.skipped ? `・取り込み済み ${r.skipped}本` : ''}${r.bad ? `・読めない行 ${r.bad}行` : ''}）`, true);
  });
  if (t.id === 'restore-file') readFile(t, text => {
    try { const s = JSON.parse(text.replace(/^\ufeff/, '')); if (!validBackup(s)) throw 0; snapshot(); S = s; S.settings = { lastBackup: null, ...S.settings }; saved(); go('home'); toast('控えから戻しました', true); }
    catch (er) { toast('控えのファイルではありません'); }
  });
});
// 控えのファイルの形を確かめる（壊れた・細工したファイルで画面が崩れないように）
function validBackup(s) {
  const str = v => typeof v === 'string', okId = v => str(v) && v.length > 0 && v.length <= 120 && !/[\u0000-\u001f<>"'`]/.test(v);
  const okQual = q => q && str(q.name) && ['資格', '研修'].includes(q.kind) && ['date', 'expires', 'no', 'note'].every(k => q[k] == null || str(q[k]));
  return !!s && s.v === 1 && s.settings && typeof s.settings === 'object' && s.tables && Array.isArray(s.tables.list)
    && Array.isArray(s.members) && s.members.every(m => m && okId(m.id) && str(m.name) && (m.quals == null || (Array.isArray(m.quals) && m.quals.every(okQual))))
    && Array.isArray(s.incidents) && s.incidents.every(i => i && okId(i.id) && Array.isArray(i.divers) && i.divers.every(d => d && Array.isArray(d.dives)))
    && s.tables.list.every(t => t && okId(t.id) && Engine.validate(t.data).errors.length === 0);
}
document.addEventListener('compositionend', e => { if (e.target.id === 'rec-q') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) closeSheet(); });

/* ===== 共有（Cloudflare）=====
   記録は端末に保存したまま、変わったところを「文書」に分けて送り、ほかの端末の変更を受け取る。
   同じ文書は、変更した日時（updatedAt）の新しい方を正とする。電波がない間は端末に貯め、つながったら送る。
   文書：member（隊員）・qual（資格・研修）・incident（事案）・diver（事案の潜水員）・dive（潜水1本） */
const CLOUD = !!API_BASE;
const KIND_ORDER = { member: 0, qual: 1, incident: 2, diver: 3, dive: 4 };
const keyOf = (kind, id) => `${kind}:${id}`;
const sy = () => (S.sync ||= { token: null, me: null, since: 0, known: {}, outbox: {}, lastAt: null, needFull: false });
const signedIn = () => CLOUD && !!S.sync?.token;
const me = () => S.sync?.me || null;
// 隊長・管理者だけができること（共有しない使い方では、誰でもできる）
const isLeader = () => !CLOUD || ['leader', 'admin'].includes(me()?.role);
const isAdmin = () => !CLOUD || me()?.role === 'admin';
const strip = (o, ...ks) => { const c = { ...o }; ks.forEach(k => delete c[k]); return c; };

// いまの記録を文書の一覧にする（見本と、受け取り途中の仮の入れ物は送らない）
function docsOf() {
  const out = new Map();
  S.members.forEach(m => {
    if (m.sample) return;
    if (!m._stub) out.set(keyOf('member', m.id), { kind: 'member', id: m.id, data: strip(m, 'id', 'quals', 'sample', '_stub') });
    (m.quals || []).forEach(q => out.set(keyOf('qual', q.id), { kind: 'qual', id: q.id, data: { ...strip(q, 'id'), memberId: m.id } }));
  });
  S.incidents.forEach(inc => {
    if (inc.sample) return;
    if (!inc._stub) out.set(keyOf('incident', inc.id), { kind: 'incident', id: inc.id, data: strip(inc, 'id', 'divers', '_stub') });
    inc.divers.forEach(dv => {
      if (!dv._stub) out.set(keyOf('diver', `${inc.id}~${dv.memberId}`), { kind: 'diver', id: `${inc.id}~${dv.memberId}`, data: { ...strip(dv, 'dives', '_stub'), incidentId: inc.id } });
      dv.dives.forEach(d => out.set(keyOf('dive', d.id), { kind: 'dive', id: d.id, data: { ...strip(d, 'id'), incidentId: inc.id, memberId: dv.memberId } }));
    });
  });
  return out;
}
// 前回から変わった文書を、送る箱（outbox）に入れる
function trackChanges() {
  if (!signedIn()) return;
  const s = sy(), now = new Date().toISOString(), cur = docsOf();
  for (const [k, d] of cur) {
    const h = JSON.stringify(d.data);
    if (s.known[k] !== h) { s.outbox[k] = { ...d, deleted: false, updatedAt: now }; s.known[k] = h; }
  }
  for (const k of Object.keys(s.known)) if (!cur.has(k)) {
    const [kind, ...rest] = k.split(':');
    s.outbox[k] = { kind, id: rest.join(':'), data: {}, deleted: true, updatedAt: now };
    delete s.known[k];
  }
}
const pendingCount = () => Object.keys(S.sync?.outbox || {}).length;

// 受け取った文書を、いまの記録に入れる
function incStub(id) {
  let inc = S.incidents.find(i => i.id === id);
  if (!inc) { inc = { id, _stub: true, createdAt: new Date().toISOString(), type: 'その他', title: '', status: 'closed', divers: [], tableId: BUILTIN_ID }; S.incidents.push(inc); }
  return inc;
}
function diverStub(inc, memberId) {
  let dv = inc.divers.find(d => d.memberId === memberId);
  if (!dv) { dv = { memberId, _stub: true, tank: S.settings.tank, sac: S.settings.sac, current: null, nextFirst: false, dives: [] }; inc.divers.push(dv); }
  return dv;
}
function memberStub(id) {
  let m = S.members.find(x => x.id === id);
  if (!m) { m = { id, _stub: true, name: `職員番号 ${id}`, status: '在籍', quals: [] }; S.members.push(m); }
  return m;
}
function removeFromAll(kind, id) {
  if (kind === 'member') S.members = S.members.filter(m => m.id !== id);
  if (kind === 'qual') S.members.forEach(m => { m.quals = (m.quals || []).filter(q => q.id !== id); });
  if (kind === 'incident') S.incidents = S.incidents.filter(i => i.id !== id);
  if (kind === 'diver') { const [iid, mid] = id.split('~'); const inc = S.incidents.find(i => i.id === iid); if (inc) inc.divers = inc.divers.filter(d => d.memberId !== mid); }
  if (kind === 'dive') S.incidents.forEach(i => i.divers.forEach(dv => { dv.dives = dv.dives.filter(d => d.id !== id); }));
}
function applyDoc(doc) {
  const { kind, id, data } = doc;
  if (doc.deleted) { removeFromAll(kind, id); return; }
  if (kind === 'member') { const m = memberStub(id); const quals = m.quals || []; Object.keys(m).forEach(k => { if (!['id', 'quals'].includes(k)) delete m[k]; }); Object.assign(m, data, { id, quals }); }
  if (kind === 'qual') { removeFromAll('qual', id); const m = memberStub(data.memberId); m.quals.push({ ...strip(data, 'memberId'), id }); }
  if (kind === 'incident') { const inc = incStub(id); const divers = inc.divers; Object.keys(inc).forEach(k => { if (!['id', 'divers'].includes(k)) delete inc[k]; }); Object.assign(inc, data, { id, divers }); }
  if (kind === 'diver') { const inc = incStub(data.incidentId); const dv = diverStub(inc, data.memberId); const dives = dv.dives; Object.keys(dv).forEach(k => { if (k !== 'dives') delete dv[k]; }); Object.assign(dv, strip(data, 'incidentId'), { dives }); }
  if (kind === 'dive') {
    removeFromAll('dive', id);
    const inc = incStub(data.incidentId), dv = diverStub(inc, data.memberId);
    dv.dives.push({ ...strip(data, 'incidentId', 'memberId'), id });
    dv.dives.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
  }
}
// 送ったり受け取ったりする。電波がない・ログインしていないときは何もしない
let syncing = null, syncTimer = null, syncNote = '';
function syncSoon(ms = 1500) { if (!signedIn()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), ms); }
async function syncNow() {
  if (!signedIn() || syncing) return syncing;
  if (navigator.onLine === false) { syncNote = 'offline'; renderSyncBadge(); return; }
  syncing = (async () => {
    const s = sy();
    trackChanges();
    let rounds = 0, changedLocal = false, rejectedMsg = '';
    let since = s.needFull ? 0 : s.since, refetch = false, refetched = s.needFull;
    const rejectedKeys = new Set(), seen = new Set();
    try {
      while (rounds++ < 30) {
        const sent = Object.values(s.outbox).slice(0, 400);
        const res = await fetch(API_BASE + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token }, body: JSON.stringify({ since, changes: sent }) });
        if (res.status === 401) { s.token = null; syncNote = 'login'; save(); render(); toast('ログインし直してください'); return; }
        if (!res.ok) throw new Error('http ' + res.status);
        const body = await res.json();
        if (body.me) s.me = body.me;
        // 送れた変更を箱から出す（送ったあとに直したものは残す）
        for (const d of sent) { const k = keyOf(d.kind, d.id); if (s.outbox[k] && s.outbox[k].updatedAt === d.updatedAt) delete s.outbox[k]; }
        // 受け付けられなかった変更（サーバーの方が新しい・権限がない）は、サーバーの内容に合わせ直す
        for (const r of body.rejected || []) { rejectedKeys.add(keyOf(r.kind, r.id)); refetch = true; if (r.reason !== 'stale' && !rejectedMsg) rejectedMsg = r.reason; }
        const incoming = (body.changes || []).slice().sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (a.seq - b.seq));
        for (const d of incoming) {
          const k = keyOf(d.kind, d.id), mine = s.outbox[k];
          seen.add(k);
          if (mine && mine.updatedAt > d.updatedAt) continue; // 端末の方が新しい（次に送る）
          applyDoc(d); delete s.outbox[k]; changedLocal = true;
        }
        since = body.seq;
        if (body.more || Object.keys(s.outbox).length) continue;
        if (refetch && !refetched) { refetched = true; refetch = false; since = 0; seen.clear(); continue; }
        break;
      }
      // サーバーに無いのに受け付けられなかったもの（権限のない追加など）は、端末からも消す
      if (refetched) for (const k of rejectedKeys) if (!seen.has(k)) { const [kind, ...rest] = k.split(':'); removeFromAll(kind, rest.join(':')); changedLocal = true; }
      s.since = since; s.needFull = false;
      // 受け取った内容を「知っている状態」にする（受け取ったものを送り返さない）
      const cur = docsOf(); s.known = {};
      for (const [k, d] of cur) if (!s.outbox[k]) s.known[k] = JSON.stringify(d.data); else s.known[k] = JSON.stringify(s.outbox[k].data);
      s.lastAt = new Date().toISOString(); syncNote = '';
      save();
      if (changedLocal && !sheet) render(); else renderSyncBadge();
      if (rejectedMsg) toast(`受け付けられなかった変更があります：${rejectedMsg}`);
    } catch (e) {
      syncNote = 'error'; renderSyncBadge();
    } finally { syncing = null; }
  })();
  return syncing;
}
function syncBadge() {
  if (!CLOUD) return '';
  if (!signedIn()) return `<span class="sync-badge">${ic('circle-alert')}未ログイン</span>`;
  const n = pendingCount();
  if (syncNote === 'offline' || navigator.onLine === false) return `<span class="sync-badge">${ic('cloud-off')}電波なし${n ? `・未送信 ${n}件` : ''}</span>`;
  if (syncNote === 'error') return `<span class="sync-badge">${ic('circle-alert')}未送信 ${n}件・あとで送ります</span>`;
  if (n) return `<span class="sync-badge">${ic('cloud')}送信中 ${n}件</span>`;
  return `<span class="sync-badge">${ic('check')}共有済み${S.sync.lastAt ? ` ${hm(S.sync.lastAt)}` : ''}</span>`;
}
function renderSyncBadge() { document.querySelectorAll('[data-sync-badge]').forEach(el => { el.innerHTML = syncBadge(); }); }
window.addEventListener('online', () => { syncNote = ''; syncNow(); });
window.addEventListener('offline', () => { syncNote = 'offline'; renderSyncBadge(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 30000);

/* ----- ログイン ----- */
let loginMsg = '';
function viewLogin() {
  return `${bar('潜水現場記録', '宮古島市消防本部 潜水隊', false)}
  <main class="wrap">
    <section class="stack">
      <h1><span class="u">ログイン</span></h1>
      <p class="small">記録は隊の全員で共有します。自分の職員番号と、隊のパスコードを入れてください。</p>
      <label class="field"><span>職員番号</span><input class="input num" id="li-id" inputmode="numeric" autocomplete="username"></label>
      <label class="field"><span>隊のパスコード</span><input class="input" id="li-pass" type="password" autocomplete="current-password"></label>
      ${loginMsg ? `<div class="alert" role="alert">${ic('triangle-alert')}<span>${esc(loginMsg)}</span></div>` : ''}
      <button class="btn btn-primary btn-big btn-block" data-act="login">${ic('key-round')}ログイン</button>
      <p class="small">パスコードは隊長に聞いてください。ほかの人に教えないでください。</p>
    </section>
  </main>`;
}
async function doLogin() {
  const id = toHalf($('#li-id')?.value || ''), pass = $('#li-pass')?.value || '';
  if (!id || !pass) { loginMsg = '職員番号とパスコードを入れてください。'; render(); return; }
  if (navigator.onLine === false) { loginMsg = '電波のある所でログインしてください。'; render(); return; }
  let res, body;
  try { res = await fetch(API_BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: id, passcode: pass }) }); body = await res.json(); }
  catch (e) { loginMsg = 'つながりませんでした。電波を確かめて、もう一度押してください。'; render(); return; }
  if (!res.ok) { loginMsg = body?.error || 'ログインできませんでした。'; render(); return; }
  // 見本は送らずに消す。この端末にあった記録（v0.4 までの記録）は、ログインした人の変更として送る
  S.members = S.members.filter(m => !m.sample);
  S.incidents = S.incidents.filter(i => !i.sample);
  S.sync = { token: body.token, me: body.member, since: 0, known: {}, outbox: {}, lastAt: null, needFull: false };
  loginMsg = '';
  saved(); go('home'); toast(`${body.member.name}でログインしました`);
  syncNow();
}
function doLogout() {
  const n = pendingCount();
  if (n && !logoutConfirm) { logoutConfirm = true; render(); return; }
  logoutConfirm = false;
  // この端末の記録を消して、ログイン画面に戻る（共有の記録はサーバーに残る）
  const keep = { theme: S.settings.theme };
  S = { ...sampleState(), members: [], incidents: [], settings: { ...sampleState().settings, ...keep, lastBackup: null } };
  S.sync = { token: null, me: null, since: 0, known: {}, outbox: {}, lastAt: null, needFull: false };
  saved(); go('login'); toast('ログアウトしました');
}
let logoutConfirm = false;

/* ---------- 起動 ---------- */
(async () => {
  const loaded = await load();
  if (!loaded) {
    // 読み込めなかったときは何も保存しない（記録を上書きしないため）
    $('#app').innerHTML = `${bar('潜水現場記録', '', false)}<main class="wrap"><div class="alert">${ic('triangle-alert')}<span>記録を読み込めませんでした（${esc(loadFail)}）。記録は消えていません。アプリを閉じて開き直してください。直らないときは、端末を再起動してください。</span></div>
      <button class="btn btn-primary btn-big btn-block" data-act="reload">${ic('rotate-ccw')}開き直す</button></main>`;
    return;
  }
  S = loaded;
  S.settings = { lastBackup: null, ...S.settings };
  S.members.forEach(m => { m.quals ||= []; });
  ready = true;
  save(); render();
  if (signedIn()) syncNow();
})();
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
