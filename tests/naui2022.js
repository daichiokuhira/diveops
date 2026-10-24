const E = require('../app/src/engine.js'); const t = require('../app/tables/naui-2022.json');
let ok = 0, ng = 0; const ex = (l, g, w) => { const p = JSON.stringify(g) === JSON.stringify(w); p ? ok++ : ng++; console.log(p ? 'OK ' : 'NG ', l, g, p ? '' : 'want ' + JSON.stringify(w)); };
const T0 = Date.UTC(2026, 0, 1); const iso = m => new Date(T0 + m * 60000).toISOString();
const first = (d, adt) => { const r = E.computeDive(t, null, { maxDepth: d, adt, startAt: iso(0), endAt: iso(adt + 3) }); r.endAt = iso(adt + 3); return r; };
// 解説記事の例：グループGで15mに45分潜るには、グループDまで戻る（休息2:38〜3:29）。Gのままなら15mは26分
const g = first(18, 39); ex('18m 39分 → G', g.group, 'G');
const at = m => E.allowance(t, g, iso(39 + 3 + m));
ex('G 休息2:37 → まだE・15mは40分', [at(157).incoming, at(157).rows.find(r => r.depth === 15).limit], ['E', 40]);
ex('G 休息2:38 → D・15mは46分', [at(158).incoming, at(158).rows.find(r => r.depth === 15).limit], ['D', 46]);
ex('G 休息0:30 → G・15mは26分', [at(30).incoming, at(30).rows.find(r => r.depth === 15).limit], ['G', 26]);
ex('6mの最大潜水時間 461分 → K', first(6, 461).group, 'K');
ex('5mは6mとして計算', first(5, 30).tableDepth, 6);
ex('27m 25分 → H（無減圧）', [first(27, 25).group, first(27, 25).status], ['H', 'ok']);
ex('27m 26分 → J・5m停止5分', [first(27, 26).group, first(27, 26).stop5], ['J', 5]);
ex('12m 131分 → N・6分停止', [first(12, 131).group, first(12, 131).stop5], ['N', 6]);
ex('12m 141分 → 範囲外', first(12, 141).status, 'out');
ex('24m 33分 → J・1分停止', [first(24, 33).group, first(24, 33).stop5], ['J', 1]);

// ===== 甘い判定を出さないための確認（v0.3.0 で追加） =====
const dive = (prev, d, adt, startMin, extra = {}) => { const r = E.computeDive(t, prev, { maxDepth: d, adt, startAt: iso(startMin), endAt: iso(startMin + (Number(adt) || 0) + 3), ...extra }, extra.opts || {}); r.endAt = iso(startMin + (Number(adt) || 0) + 3); return r; };
for (const bad of [NaN, '４５', '45分', 0, -10]) ex(`潜水時間 ${String(bad)} → 判定しない`, dive(null, 18, bad, 0).status, 'na');
ex('反復で潜水時間 -10 → 判定しない', dive(g, 18, -10, 39 + 3 + 60).status, 'na');
for (const bad of [0, -5]) ex(`水深 ${bad} → 判定しない`, dive(null, bad, 20, 0).status, 'na');
ex('水深 40.1 → 範囲外', dive(null, 40.1, 5, 0).status, 'out');
ex('休息マイナス → 止める', dive(g, 18, 10, 30).status, 'out');
ex('休息5分 → 続きとして深い方・残り11分', (r => [r.continued, r.tableDepth, r.amdt])(dive(g, 18, 5, 39 + 3 + 5)), [true, 18, 11]);
ex('続きの上限はマイナスにしない', dive(g, 12, 5, 39 + 3 + 5).amdt >= 0, true);
ex('前より深い反復 → 注意', dive(first(12, 30), 18, 10, 33 + 60).warnings.some(w => /より深い反復/.test(w.text)), true);
ex('休息1440分 → 反復（A）', E.allowance(t, g, iso(39 + 3 + 1440)).incoming, 'A');
ex('休息1441分 → 1本目扱い', E.allowance(t, g, iso(39 + 3 + 1441)).first, true);
ex('G 休息52分 → G', E.allowance(t, g, iso(39 + 3 + 52)).incoming, 'G');
ex('G 休息53分 → F', E.allowance(t, g, iso(39 + 3 + 53)).incoming, 'F');
ex('前の浮上時刻なし → 計算しない', E.allowance(t, { ...g, endAt: null }, iso(100)).ok, false);
ex('グループHの後 27m は潜れない', E.allowance(t, first(18, 45), iso(45 + 3 + 15)).rows.find(r => r.depth === 27).limit, 0);
// 1段階厳しく：潜る前の上限が、浮上後に減圧にならない時間になっている
const sa = E.allowance(t, null, iso(0), { strict: true });
ex('厳しく・18m の1本目の上限 45分', sa.rows.find(r => r.depth === 18).limit, 45);
for (const r of sa.rows) {
  const a = dive(null, r.depth, r.limit, 0, { opts: { strict: true } });
  ex(`厳しく・${r.depth}m ${r.limit}分 → 減圧にならない`, a.status === 'ok', true);
}
ex('厳しく・27m 25分 → J・減圧5分', (r => [r.group, r.stop5])(dive(null, 27, 25, 0, { opts: { strict: true } })), ['J', 5]);
const sr = E.allowance(t, g, iso(39 + 3 + 60), { strict: true }), nr = E.allowance(t, g, iso(39 + 3 + 60));
for (const r of sr.rows) if (r.limit) {
  const a = dive(g, r.depth, r.limit, 39 + 3 + 60, { opts: { strict: true } });
  ex(`厳しく・反復 ${r.depth}m ${r.limit}分 → 減圧にならない・通常以下`, [a.status, r.limit <= nr.rows.find(x => x.depth === r.depth).limit], ['ok', true]);
}
const bad = (k, v) => E.validate({ ...t, rules: { ...t.rules, [k]: v } }).errors.length > 0;
ex('rules 改ざん（24時間→60分）は使えない', bad('clearAfterMinutes', 60), true);
ex('rules 改ざん（休息10分→5分）は使えない', bad('minSurfaceInterval', 5), true);
ex('rules なしは使えない', E.validate({ ...t, rules: undefined }).errors.length > 0, true);
ex('水深が文字の表は使えない', E.validate({ ...t, depths: ['6<img src=x onerror=alert(1)>', ...t.depths.slice(1)] }).errors.length > 0, true);
ex('rules の違いを差分に出す', E.diff(t, { ...t, rules: { ...t.rules, clearAfterMinutes: 2000 } }).some(c => /clearAfterMinutes/.test(c.label)), true);
// 減圧停止が足りないとき
const om = dive(null, 27, 26, 0, { decoStopDone: 0 });
ex('減圧停止を省いた → グループを出さない', [om.status, om.group, om.omitted], ['deco', null, true]);
ex('減圧停止を省いた後の潜水は計算しない', dive(om, 12, 10, 26 + 3 + 60).status, 'out');
ex('減圧停止を省いて24時間後は1本目', E.allowance(t, om, iso(26 + 3 + 1441)).first, true);
ex('減圧停止を満たした → グループJ', dive(null, 27, 26, 0, { decoStopDone: 5 }).group, 'J');
ex('減圧潜水の後の反復に注意', dive(dive(null, 27, 26, 0, { decoStopDone: 5 }), 12, 10, 26 + 3 + 120).warnings.some(w => /減圧停止が必要だった/.test(w.text)), true);
const v = E.validate(t); ex('点検 エラー0・注意0', [v.errors.length, v.warnings.length], [0, 0]);
console.log(`${ok}件 OK / ${ng}件 NG`);
if (ng) process.exit(1);
