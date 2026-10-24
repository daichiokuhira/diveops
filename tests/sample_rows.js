// 台帳の見本データ（アプリのCSVと同じ列）を作る
const E = require('../app/src/engine.js'); const t = require('../app/tables/naui-2022.json');
const label = `${t.name}・${t.version}`;
const pad = n => String(n).padStart(2, '0');
const at = (d, h, m) => `${d}T${pad(h)}:${pad(m)}:00+09:00`;
const hm = iso => { const x = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`; };
const st = r => ({ ok: '無減圧', deco: `減圧 ${r.stop5}分`, out: '範囲外', na: '—' })[r.status];
const incs = [
  { id: 'S-20250514', d: '2025-05-14', type: '訓練', title: '定期潜水訓練', site: '平良港', cmd: '見本 一郎', temp: 24, vis: 8, sea: '凪', memo: '', start: [9, 0], end: [11, 30],
    dives: { 1001: [[9, 20, 9, 33]], 1002: [[9, 20, 9, 35], [10, 50, 6, 30]], 1003: [[9, 22, 8, 31]], 1005: [[9, 22, 9, 37]] } },
  { id: 'S-20250821', d: '2025-08-21', type: '災害', title: '水難事故 水中検索', site: '渡口の浜', cmd: '見本 二郎', temp: 29, vis: 15, sea: 'やや波あり', memo: '要救助者を発見し引き上げ', start: [14, 5], end: [16, 10],
    dives: { 1001: [[14, 30, 6, 38]], 1002: [[14, 30, 6, 40]], 1004: [[14, 32, 7, 36], [15, 40, 6, 20]] } },
  { id: 'S-20260624', d: '2026-06-24', type: '災害', title: '車両転落 水中検索', site: '平良港', cmd: '見本 二郎', temp: 27, vis: 6, sea: '凪', memo: '', start: [10, 0], end: [12, 40],
    dives: { 1001: [[10, 20, 12, 28], [12, 0, 9, 20]], 1003: [[10, 20, 11, 26]], 1004: [[10, 22, 12, 30]] } },
  { id: 'S-20260916', d: '2026-09-16', type: '訓練', title: '定期潜水訓練', site: '佐良浜漁港', cmd: '見本 一郎', temp: 28, vis: 20, sea: '凪', memo: '', start: [9, 0], end: [11, 50],
    dives: { 1002: [[9, 15, 18, 20], [10, 45, 15, 25]], 1004: [[9, 15, 17, 22]], 1005: [[9, 17, 18, 21]], 1006: [[9, 17, 16, 24], [10, 50, 12, 30]] } }
];
const names = { 1001: '見本 一郎', 1002: '見本 二郎', 1003: '見本 三郎', 1004: '見本 四郎', 1005: '見本 五郎', 1006: '見本 六郎' };
const rows = [];
for (const inc of incs) {
  for (const [id, ds] of Object.entries(inc.dives)) {
    let prev = null;
    ds.forEach(([h, m, depth, adt], k) => {
      const s = at(inc.d, h, m), e = new Date(new Date(s).getTime() + (adt + 4) * 60000).toISOString();
      const r = E.computeDive(t, prev, { maxDepth: depth, adt, startAt: s, endAt: e }); r.endAt = e;
      rows.push({ 日付: inc.d.replaceAll('-', '/'), 職員番号: Number(id), 氏名: names[id], 区分: inc.type, 事案名: inc.title, 地点: inc.site, 最大水深: depth, 潜水時間: adt,
        水面休息: r.siMin != null ? Math.floor(r.siMin) : '', タンク: 10, 開始圧: 200, 終了圧: 60 + (k * 20), 水温: inc.temp, 透視度: inc.vis, 減圧停止: r.status === 'deco' ? '有' : '無',
        体調異常: (inc.id === 'S-20260916' && id === '1006' && k === 1) ? '有' : '無', 指揮者: inc.cmd, 備考: (inc.id === 'S-20260916' && id === '1006' && k === 1) ? '右耳の違和感。浮上後に回復' : '',
        事案ID: inc.id, 本数: k + 1, 潜降: hm(s), 浮上: hm(e), 表の水深: r.tableDepth, グループ: r.group ?? '', RNT: r.rnt ?? '', TNT: r.tnt ?? '', MDT: r.mdt ?? '', AMDT: r.amdt ?? '',
        判定: st(r), 停止: r.stop5 ?? '', 潜水表: label, 海況: inc.sea, 事案備考: inc.memo, 事案開始: `${inc.d.replaceAll('-', '/')} ${pad(inc.start[0])}:${pad(inc.start[1])}`, 事案終了: `${inc.d.replaceAll('-', '/')} ${pad(inc.end[0])}:${pad(inc.end[1])}` });
      prev = r;
    });
  }
}
console.log(JSON.stringify(rows));
