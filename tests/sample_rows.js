// 台帳の見本データを作る。キーと並びはアプリのCSV（48列）の見出しと同じ（app.js の CSV_HEAD）
const E = require('../app/src/engine.js'); const t = require('../app/tables/naui-2022.json');
const label = `${t.name}・${t.version}`;
const pad = n => String(n).padStart(2, '0');
const at = (d, h, m) => `${d}T${pad(h)}:${pad(m)}:00+09:00`;
const hm = iso => { const x = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`; };
const plus = (iso, min) => new Date(new Date(iso).getTime() + min * 60000).toISOString();
const st = r => ({ ok: '無減圧', deco: `減圧 ${r.stop5}分`, out: '範囲外', na: '—' })[r.status];
const incs = [
  { id: 'S-20250514', d: '2025-05-14', type: '訓練', title: '定期潜水訓練', site: '平良港', cmd: '見本 一郎', watch: '見本 八郎', temp: 24, vis: 8, sea: '凪', memo: '', start: [9, 0], end: [11, 30],
    dives: { 1001: [[9, 20, 9, 33]], 1002: [[9, 20, 9, 35], [10, 50, 6, 30]], 1003: [[9, 22, 8, 31]], 1005: [[9, 22, 9, 37]] } },
  { id: 'S-20250821', d: '2025-08-21', type: '災害', title: '水難事故 水中検索', site: '渡口の浜', cmd: '見本 二郎', watch: '見本 六郎', temp: 29, vis: 15, sea: 'やや波あり', memo: '要救助者を発見し引き上げ', start: [14, 5], end: [16, 10],
    dives: { 1001: [[14, 30, 6, 38]], 1002: [[14, 30, 6, 40]], 1004: [[14, 32, 7, 36], [15, 40, 6, 20]] } },
  { id: 'S-20260624', d: '2026-06-24', type: '災害', title: '車両転落 水中検索', site: '平良港', cmd: '見本 二郎', watch: '見本 五郎', temp: 27, vis: 6, sea: '凪', memo: '', start: [10, 0], end: [12, 40],
    dives: { 1001: [[10, 20, 12, 28], [12, 0, 9, 20]], 1003: [[10, 20, 11, 26]], 1004: [[10, 22, 12, 30]] } },
  { id: 'S-20260916', d: '2026-09-16', type: '訓練', title: '定期潜水訓練', site: '佐良浜漁港', cmd: '見本 一郎', watch: '見本 三郎', temp: 28, vis: 20, sea: '凪', memo: '', start: [9, 0], end: [11, 50],
    dives: { 1002: [[9, 15, 18, 20], [10, 45, 15, 25]], 1004: [[9, 15, 17, 22]], 1005: [[9, 17, 18, 21]], 1006: [[9, 17, 16, 24], [10, 50, 12, 30]] } }
];
const names = { 1001: '見本 一郎', 1002: '見本 二郎', 1003: '見本 三郎', 1004: '見本 四郎', 1005: '見本 五郎', 1006: '見本 六郎' };
const ymd = d => d.replaceAll('-', '/');
const rows = [];
for (const inc of incs) {
  for (const [id, ds] of Object.entries(inc.dives)) {
    let prev = null;
    ds.forEach(([h, m, depth, adt], k) => {
      const s = at(inc.d, h, m), ascent = plus(s, adt);
      // 浮上開始 → 5mで止まる → 水面。止まる時間は安全停止3分（減圧なら表の停止時間）、移動は3分
      let stop = 3, e = plus(ascent, stop + 3);
      let r = E.computeDive(t, prev, { maxDepth: depth, adt, startAt: s, endAt: e });
      if (r.status === 'deco' && r.stop5 > stop) { stop = r.stop5; e = plus(ascent, stop + 3); r = E.computeDive(t, prev, { maxDepth: depth, adt, startAt: s, endAt: e }); }
      r.endAt = e;
      const odd = inc.id === 'S-20260916' && id === '1006' && k === 1;
      rows.push({
        '日付': ymd(inc.d), '職員番号': String(id), '氏名': names[id], '区分': inc.type, '事案・訓練名': inc.title, '地点': inc.site,
        '最大水深(m)': depth, '潜水時間(分)': adt, '前の潜水からの水面休息(分)': r.siMin != null ? Math.floor(r.siMin) : '', 'タンク容量(L)': 10,
        '開始圧(気圧)': 200, '終了圧(気圧)': 60 + (k * 20), '水温(℃)': inc.temp, '透視度(m)': inc.vis, '減圧停止(表の判定)': r.status === 'deco' ? '有' : '無',
        '体調異常': odd ? '有' : '無', '指揮者': inc.cmd, '備考': odd ? '右耳の違和感。浮上後に回復' : '',
        '事案ID': inc.id, '本数': k + 1, '潜降時刻': hm(s), '浮上時刻': hm(e), '表の水深(m)': r.tableDepth, 'グループ': r.group ?? '',
        '残留窒素時間(分)': r.rnt ?? '', '合計窒素時間(分)': r.tnt ?? '', '最大潜水時間(分)': r.mdt ?? '', '修正最大潜水時間(分)': r.amdt ?? '',
        '判定': st(r), '5m減圧停止(分)': r.stop5 ?? '', '潜水表': label, '海況': inc.sea, '事案備考': inc.memo,
        '事案開始': `${ymd(inc.d)} ${pad(inc.start[0])}:${pad(inc.start[1])}`, '事案終了': `${ymd(inc.d)} ${pad(inc.end[0])}:${pad(inc.end[1])}`,
        '記録ID': `smp-${inc.id.slice(2)}-${id}-${k + 1}`, '状態': '記録', '予定水深(m)': Math.ceil(depth / 3) * 3, '浮上開始時刻': hm(ascent),
        '安全停止': '有', '浮上停止の水深(m)': 5, '浮上停止の時間(分)': stop, '平均浮上速度(m/分)': Math.round(depth / 3 * 10) / 10,
        '呼吸ガス': '空気', '監視員': inc.watch, '1本目扱い': '', '修正記録': odd ? `1回・最終 ${ymd(inc.d)} 12:05` : '',
        '記録更新日時': odd ? `${ymd(inc.d)} 12:05:00` : `${ymd(inc.d)} ${hm(e)}:00`
      });
      prev = r;
    });
  }
}
console.log(JSON.stringify(rows));
