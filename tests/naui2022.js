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
const v = E.validate(t); ex('点検 エラー0・注意0', [v.errors.length, v.warnings.length], [0, 0]);
console.log(`${ok}件 OK / ${ng}件 NG`);
