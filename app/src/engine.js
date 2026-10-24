/* ===== 計算エンジン（潜水表の数値には依存しない。表はデータとして受け取る） ===== */
const Engine = (() => {
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  // 実際の水深 → 表の水深（次に深い段へ切り上げ）
  function tableDepthFor(table, depth) {
    if (depth == null || depth === '' || isNaN(depth)) return null;
    depth = Number(depth);
    for (const d of table.depths) if (depth <= d) return d;
    return null;
  }

  // 合計窒素時間 → グループ
  function groupFor(table, depth, tnt) {
    const cuts = table.groups[String(depth)];
    if (!cuts || tnt == null || tnt <= 0) return null;
    const t = Math.ceil(tnt);
    for (const [mx, g] of cuts) if (t <= mx) return g;
    return null;
  }

  // 1段階厳しく（低水温・重作業）
  function stricterGroup(table, depth, g) {
    const cuts = table.groups[String(depth)];
    if (!cuts || !g) return g;
    const i = cuts.findIndex(c => c[1] === g);
    return i >= 0 && cuts[i + 1] ? cuts[i + 1][1] : null;
  }

  // 水面休息後のグループ
  function siGroup(table, group, minutes) {
    const rows = table.surfaceInterval[group];
    if (!rows) return { status: 'nogroup' };
    const m = Math.floor(minutes);
    if (m < (table.rules?.minSurfaceInterval ?? 10)) return { status: 'short' };
    for (const [lo, hi, g] of rows) if (m >= lo && m <= hi) return { status: 'ok', group: g };
    const maxHi = Math.max(...rows.map(r => r[1]));
    return m > maxHi ? { status: 'over', maxHi } : { status: 'gap' };
  }

  function val(obj, g, d) {
    const row = obj[g];
    if (!row) return null;
    const v = row[String(d)];
    return v == null ? null : v;
  }

  // 空気の量から潜れる時間（分）
  function airMinutes(tank, startP, reserveP, depth, sac) {
    const t = Number(tank), s = Number(startP), r = Number(reserveP), d = Number(depth), c = Number(sac);
    if (![t, s, r, d, c].every(isFinite) || t <= 0 || c <= 0 || s <= r || d < 0) return null;
    return t * (s - r) / (1 + d / 10) / c;
  }

  /*
   * 1本の潜水を計算する
   * dive: { maxDepth, adt, startAt, endAt, treatAsFirst }
   * prev: 直前の潜水の計算結果（なければ null）
   */
  function computeDive(table, prev, dive, opts = {}) {
    const r = { warnings: [], status: 'ok', stop5: null, incoming: null, siMin: null, continued: false };
    const adt = dive.adt === '' || dive.adt == null ? null : Number(dive.adt);
    let td = tableDepthFor(table, dive.maxDepth);
    let first = !prev || dive.treatAsFirst;
    let noAmdt = false;

    if (dive.maxDepth != null && dive.maxDepth !== '' && td == null) {
      r.status = 'out';
      r.warnings.push({ level: 'stop', text: `最大水深 ${dive.maxDepth}m は表の範囲（${table.depths[table.depths.length - 1]}mまで）を超えています。` });
    }
    if (adt == null || td == null) {
      if (r.status === 'ok') r.status = 'na';
      r.tableDepth = td;
      return r;
    }

    let rnt = 0, amdt = null;
    if (first) {
      rnt = 0;
    } else {
      r.siMin = prev.endAt && dive.startAt ? (new Date(dive.startAt) - new Date(prev.endAt)) / 60000 : null;
      let si = r.siMin == null ? { status: 'unknown' } : (prev.group ? siGroup(table, prev.group, r.siMin) : { status: 'noprev' });
      const clear = table.rules?.clearAfterMinutes;
      if (clear && r.siMin != null && r.siMin > clear) {
        first = true; si = { status: 'cleared' };
        r.warnings.push({ level: 'info', text: `水面休息が${Math.round(clear / 60)}時間を超えたため、1本目として計算しました。` });
      }
      if (si.status === 'cleared') {
        rnt = 0;
      } else if (si.status === 'short') {
        // 水面休息が最短未満 → 前の潜水の続きとして扱う
        r.continued = true;
        td = Math.max(td, prev.tableDepth);
        rnt = prev.tnt;
        r.warnings.push({ level: 'warn', text: `水面休息が${table.rules?.minSurfaceInterval ?? 10}分未満のため、前の潜水の続きとして計算しました（水深は深い方の ${td}m）。` });
      } else if (si.status === 'ok') {
        r.incoming = si.group;
        rnt = val(table.rnt, si.group, td);
        amdt = val(table.amdt, si.group, td);
        if (rnt != null && amdt == null) { amdt = 0; noAmdt = true; }
        if (rnt == null) {
          r.status = 'out';
          r.warnings.push({ level: 'stop', text: `グループ${si.group}・水深${td}mの残留窒素時間が表にありません。この水深には潜れません。` });
        }
      } else {
        r.status = 'out';
        const msg = {
          nogroup: `前の潜水のグループ${prev.group}は水面休息表にありません（減圧が必要だった潜水の後）。自動計算できません。`,
          over: `水面休息が表の範囲（${si.maxHi}分まで）を超えました。1本目として扱うかは指揮者が判断してください。`,
          gap: '水面休息表に該当する時間帯がありません。表を確認してください。',
          noprev: '前の潜水のグループが出ていないため、自動計算できません。',
          unknown: '前の潜水の時刻が分からないため、水面休息を計算できません。'
        }[si.status];
        r.warnings.push({ level: 'stop', text: msg, canReset: si.status === 'over' });
      }
    }
    r.first = first;
    r.tableDepth = td;
    r.mdt = table.mdt[String(td)] ?? null;
    const avoid = table.rules?.avoidRepetitiveDeeperThan;
    if (!first && avoid && td > avoid) r.warnings.push({ level: 'warn', text: `${avoid}mより深い反復潜水は避けるよう、潜水表に記載があります。` });
    r.amdt = first ? r.mdt : (r.continued ? (r.mdt != null ? r.mdt - rnt : null) : amdt);
    if (r.status === 'out') { r.rnt = rnt; return r; }

    r.rnt = rnt;
    r.tnt = adt + rnt;
    let g = groupFor(table, td, r.tnt);
    if (opts.strict && g) {
      const s = stricterGroup(table, td, g);
      if (s !== g) r.warnings.push({ level: 'info', text: `低水温・重作業のため、グループを1段階厳しく（${g}→${s ?? '範囲外'}）しました。` });
      g = s;
    }
    r.group = g;

    const deco = g ? table.deco[`${td}-${g}`] : null;
    if (deco) {
      r.status = 'deco';
      r.stop5 = deco.stop5;
      r.warnings.push({ level: 'stop', text: `減圧停止が必要です。水深5mで${deco.stop5}分止まってください（合計窒素時間 ${r.tnt}分・グループ${g}）。` });
      if (r.tnt > deco.limit) {
        r.status = 'out';
        r.warnings.push({ level: 'stop', text: `合計窒素時間 ${r.tnt}分 は減圧停止表の上限 ${deco.limit}分 を超えています。表では判断できません。` });
      }
    } else if (r.mdt != null && r.tnt > r.mdt) {
      r.status = 'out';
      r.warnings.push({ level: 'stop', text: `合計窒素時間 ${r.tnt}分 が最大潜水時間 ${r.mdt}分 を超え、減圧停止表にも該当しません。表では判断できません。` });
    } else if (!g) {
      r.warnings.push({ level: 'warn', text: '最大潜水時間内ですが、グループ表の範囲外です。次の潜水は自動計算できません。' });
    }
    if (noAmdt && r.status === 'ok') {
      r.warnings.push({ level: 'stop', text: `グループ${r.incoming}で水深${td}mの修正最大潜水時間は表に記載がありません（潜らない扱い）。` });
    } else if (!first && r.amdt != null && adt > r.amdt && r.status === 'ok') {
      r.warnings.push({ level: 'warn', text: `潜水時間 ${adt}分 が修正最大潜水時間 ${r.amdt}分 を超えています。` });
    }
    return r;
  }

  // ある時刻に潜り始めた場合、水深ごとに何分潜れるか
  function allowance(table, prev, atTime, opts = {}) {
    let incoming = null, first = !prev, note = null, siMin = null;
    if (prev && !opts.forceFirst) {
      siMin = (new Date(atTime) - new Date(prev.endAt)) / 60000;
      const clear = table.rules?.clearAfterMinutes;
      if (clear && siMin > clear) { first = true; note = `水面休息が${Math.round(clear / 60)}時間を超えたため、1本目として計算しています。`; }
      else {
        if (!prev.group) return { ok: false, siMin, note: '前の潜水のグループが出ていないため計算できません。' };
        const si = siGroup(table, prev.group, siMin);
        if (si.status === 'ok') incoming = si.group;
        else if (si.status === 'short') return { ok: false, siMin, note: `水面休息${table.rules?.minSurfaceInterval ?? 10}分未満。今潜ると前の潜水の続きになります。` };
        else if (si.status === 'over') return { ok: false, siMin, over: true, note: '水面休息が表の範囲を超えました。1本目として扱うかは指揮者の判断です。' };
        else return { ok: false, siMin, note: 'この休息時間では表から計算できません。' };
      }
    } else if (prev && opts.forceFirst) { first = true; }
    const avoid = table.rules?.avoidRepetitiveDeeperThan;
    const rows = table.depths.map(d => {
      if (first) return { depth: d, limit: table.mdt[String(d)] ?? null, rnt: 0 };
      const rnt = val(table.rnt, incoming, d), am = val(table.amdt, incoming, d);
      const avoidHere = !!(avoid && d > avoid);
      return { depth: d, limit: rnt == null ? 0 : (am ?? 0), rnt, noData: rnt == null || am == null, avoid: avoidHere };
    });
    return { ok: true, first, incoming, siMin, rows, note };
  }

  /* ===== 潜水表の点検 ===== */
  function validate(t) {
    const errors = [], warnings = [];
    const isNum = v => typeof v === 'number' && isFinite(v);
    if (!t || typeof t !== 'object') return { errors: ['ファイルの中身が潜水表の形式ではありません。'], warnings };
    if (t.format !== 'dive-table/1') errors.push('形式の印（format: dive-table/1）がありません。');
    if (!t.name || !t.version) errors.push('表の名前（name）と版（version）が必要です。');
    if (!Array.isArray(t.depths) || !t.depths.length) { errors.push('水深の一覧（depths）がありません。'); return { errors, warnings }; }
    for (let i = 1; i < t.depths.length; i++) if (!(t.depths[i] > t.depths[i - 1])) errors.push(`水深の並びが浅い順になっていません（${t.depths[i - 1]}m → ${t.depths[i]}m）。`);
    for (const k of ['mdt', 'groups', 'rnt', 'amdt', 'surfaceInterval', 'deco']) if (!t[k] || typeof t[k] !== 'object') errors.push(`「${k}」の表がありません。`);
    if (errors.length) return { errors, warnings };

    for (const d of t.depths) {
      if (!isNum(t.mdt[String(d)])) errors.push(`${d}m の最大潜水時間がありません。`);
      const cuts = t.groups[String(d)];
      if (!Array.isArray(cuts) || !cuts.length) { errors.push(`${d}m のグループ表がありません。`); continue; }
      for (let i = 0; i < cuts.length; i++) {
        const [mx, g] = cuts[i] || [];
        if (!isNum(mx) || !LETTERS.includes(g)) errors.push(`${d}m のグループ表 ${i + 1}番目の値が正しくありません。`);
        if (i && !(mx > cuts[i - 1][0])) errors.push(`${d}m のグループ表で時間が増えていません（${cuts[i - 1][0]} → ${mx}）。`);
        if (i && LETTERS.indexOf(g) <= LETTERS.indexOf(cuts[i - 1][1])) errors.push(`${d}m のグループ表で記号の順が逆です（${cuts[i - 1][1]} → ${g}）。`);
      }
    }
    for (const tbl of ['rnt', 'amdt']) {
      for (const [g, row] of Object.entries(t[tbl])) {
        if (!LETTERS.includes(g)) errors.push(`${tbl.toUpperCase()} 表に不明な記号「${g}」があります。`);
        for (const [d, v] of Object.entries(row)) {
          if (!t.depths.includes(Number(d))) errors.push(`${tbl.toUpperCase()} 表の ${g}・${d}m は水深の一覧にありません。`);
          if (!isNum(v) || v < 0) errors.push(`${tbl.toUpperCase()} 表の ${g}・${d}m が数値ではありません。`);
        }
      }
    }
    for (const [g, rows] of Object.entries(t.surfaceInterval)) {
      if (!Array.isArray(rows)) { errors.push(`水面休息表 ${g} の形式が正しくありません。`); continue; }
      rows.forEach((r, i) => {
        if (!Array.isArray(r) || !isNum(r[0]) || !isNum(r[1]) || !LETTERS.includes(r[2]) || r[0] > r[1]) errors.push(`水面休息表 ${g} の ${i + 1}行目が正しくありません。`);
        if (i && rows[i - 1] && r[0] <= rows[i - 1][1]) errors.push(`水面休息表 ${g} の時間帯が重なっています（${i}行目と${i + 1}行目）。`);
        if (i && rows[i - 1] && r[0] > rows[i - 1][1] + 1) warnings.push({ cell: `休息 ${g}`, text: `水面休息表 ${g} の ${rows[i - 1][1]}分と${r[0]}分の間に空きがあります。` });
      });
    }
    for (const [k, v] of Object.entries(t.deco)) {
      const [d, g] = k.split('-');
      if (!t.depths.includes(Number(d)) || !LETTERS.includes(g) || !v || !isNum(v.limit) || !isNum(v.stop5)) errors.push(`減圧停止表「${k}」が正しくありません。`);
    }
    if (errors.length) return { errors, warnings };

    // 整合の点検（止めずに知らせる）
    const groupsUsed = Object.keys(t.rnt).sort((a, b) => LETTERS.indexOf(a) - LETTERS.indexOf(b));
    for (const g of groupsUsed) for (const d of t.depths) {
      const r = val(t.rnt, g, d), a = val(t.amdt, g, d), m = t.mdt[String(d)];
      if (r != null && a != null && r + a !== m) warnings.push({ cell: `${g}・${d}m`, text: `${g}・${d}m：RNT ${r} ＋ AMDT ${a} ＝ ${r + a}（最大潜水時間は ${m}）` });
    }
    for (const d of t.depths) {
      let prevV = null, prevG = null;
      for (const g of groupsUsed) {
        const v = val(t.rnt, g, d);
        if (v == null) continue;
        if (prevV != null && v <= prevV) warnings.push({ cell: `${g}・${d}m`, text: `${d}m：RNT がグループ${prevG}（${prevV}）よりグループ${g}（${v}）の方が小さい` });
        prevV = v; prevG = g;
      }
    }
    for (const g of groupsUsed) {
      let prevV = null, prevD = null;
      for (const d of t.depths) {
        const v = val(t.rnt, g, d);
        if (v == null) continue;
        if (prevV != null && v > prevV) warnings.push({ cell: `${g}・${d}m`, text: `グループ${g}：RNT が ${prevD}m（${prevV}）より ${d}m（${v}）の方が大きい` });
        prevV = v; prevD = d;
      }
    }
    return { errors, warnings };
  }

  // 2つの表の違い
  function diff(a, b) {
    const out = [];
    const cmp = (label, x, y) => { if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ label, from: x ?? '—', to: y ?? '—' }); };
    if (!a) return out;
    const depths = [...new Set([...(a.depths || []), ...(b.depths || [])])].sort((x, y) => x - y);
    for (const d of depths) cmp(`最大潜水時間 ${d}m`, a.mdt?.[d], b.mdt?.[d]);
    for (const d of depths) cmp(`グループ表 ${d}m`, (a.groups?.[d] || []).map(c => c.join('')).join(' '), (b.groups?.[d] || []).map(c => c.join('')).join(' '));
    for (const tbl of ['rnt', 'amdt']) {
      const gs = [...new Set([...Object.keys(a[tbl] || {}), ...Object.keys(b[tbl] || {})])].sort();
      for (const g of gs) for (const d of depths) cmp(`${tbl.toUpperCase()} ${g}・${d}m`, a[tbl]?.[g]?.[d], b[tbl]?.[g]?.[d]);
    }
    const sg = [...new Set([...Object.keys(a.surfaceInterval || {}), ...Object.keys(b.surfaceInterval || {})])].sort();
    for (const g of sg) cmp(`水面休息 ${g}`, (a.surfaceInterval?.[g] || []).map(r => `${r[0]}-${r[1]}:${r[2]}`).join(' '), (b.surfaceInterval?.[g] || []).map(r => `${r[0]}-${r[1]}:${r[2]}`).join(' '));
    const dk = [...new Set([...Object.keys(a.deco || {}), ...Object.keys(b.deco || {})])].sort();
    for (const k of dk) cmp(`減圧停止 ${k}`, a.deco?.[k] ? `上限${a.deco[k].limit}・停止${a.deco[k].stop5}` : null, b.deco?.[k] ? `上限${b.deco[k].limit}・停止${b.deco[k].stop5}` : null);
    return out;
  }

  return { tableDepthFor, groupFor, siGroup, airMinutes, computeDive, allowance, validate, diff };
})();
if (typeof module !== 'undefined') module.exports = Engine;
