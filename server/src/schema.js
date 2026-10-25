/* 共有する文書の形（サーバーとアプリで同じものを使う。アプリには build.py が export を外して入れる）
 * 決めた欄だけを、決めた型・長さ・範囲で残し、それ以外は捨てる。必須の欄が無い・壊れているときは null（受け付けない）。
 * 他の端末から届いた値を画面に出す前の守り（細工した文字列や、数字に見せかけた文字を通さない）。 */
export const DocSchema = (() => {
  // 制御文字・向きを変える文字・幅の無い文字は取り除く
  const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
  const str = (max, { req = false, oneLine = true } = {}) => v => {
    if (v == null || v === '') return req ? undefined : (v === '' ? '' : null);
    if (typeof v !== 'string' && typeof v !== 'number') return undefined;
    let s = String(v).replace(CTRL, '');
    if (oneLine) s = s.replace(/[\r\n\t]+/g, ' ');
    if (s.length > max) s = s.slice(0, max);
    return req && !s.trim() ? undefined : s;
  };
  const id = ({ req = false, empty = false } = {}) => v => {
    if (v == null || v === '') return req ? undefined : (empty ? '' : null);
    return typeof v === 'string' && v.length <= 120 && !/[\u0000-\u001f<>"'`&]/.test(v) ? v : undefined;
  };
  const num = (lo, hi) => v => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
  };
  const okYear = y => y >= 1950 && y <= 2100;
  const iso = ({ req = false } = {}) => v => {
    if (v == null || v === '') return req ? undefined : null;
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return undefined;
    const t = Date.parse(v);
    return !isNaN(t) && okYear(new Date(t).getUTCFullYear()) ? v : undefined;
  };
  // 日付は、実在する日（2026-02-31 などは不可）で、1950〜2100年
  const day = v => {
    if (v == null || v === '') return '';
    const m = typeof v === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m || !okYear(+m[1])) return undefined;
    const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
    return d.getUTCMonth() === m[2] - 1 && d.getUTCDate() === +m[3] ? v : undefined;
  };
  const daySlash = v => (v == null || v === '' ? '' : typeof v === 'string' && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v) ? v : undefined);
  const oneOf = (list, { def } = {}) => v => (v == null || v === '' ? (def ?? (list.includes('') ? '' : null)) : list.includes(v) ? v : undefined);
  const bool = v => (v == null ? null : typeof v === 'boolean' ? v : undefined);
  const nullableBool = v => (v == null ? null : typeof v === 'boolean' ? v : undefined);
  const obj = (fields) => v => (v == null ? null : typeof v === 'object' && !Array.isArray(v) ? clean(fields, v) ?? undefined : undefined);
  const list = (item, max) => v => (v == null ? [] : Array.isArray(v) ? v.slice(0, max).map(x => item(x)).filter(x => x != null && x !== undefined) : undefined);
  const any = (maxLen) => v => (v == null ? null : JSON.stringify(v).length <= maxLen ? v : undefined); // 潜水表の写し（アプリが点検してから使う）

  const CURRENT = { id: id(), startAt: iso({ req: true }), ascentAt: iso(), plannedDepth: num(0, 200), startP: num(0, 400), tank: num(0, 50) };
  const EDIT = { at: iso({ req: true }), why: str(200), before: str(400) };
  const F = {
    member: { name: str(60, { req: true }), unit: str(60), status: oneOf(['在籍', '異動', '退職'], { def: '在籍' }), statusAt: daySlash, role: oneOf(['member', 'leader'], { def: 'member' }) },
    qual: { memberId: id({ req: true }), kind: oneOf(['資格', '研修'], { def: '資格' }), name: str(60, { req: true }), org: str(30), level: str(30), date: day, expires: day, no: str(60), note: str(200), addedAt: iso(), confirmedAt: iso(), confirmedBy: str(60), confirmedById: id() },
    incident: { createdAt: iso({ req: true }), updatedAt: iso(), type: oneOf(['災害', '訓練', '研修', 'その他'], { def: 'その他' }), title: str(120), site: str(120), commanderId: id({ empty: true }), watchId: id({ empty: true }), gas: str(40), memo: str(1000, { oneLine: false }), waterTemp: str(10), visibility: str(10), sea: str(60), strict: bool, status: oneOf(['active', 'closed'], { def: 'closed' }), closedAt: iso(), tableId: str(120), tableSnap: any(60000), sentAt: iso(), imported: bool, removed: bool, removedAt: iso(), removedBy: str(60) },
    diver: { incidentId: id({ req: true }), memberId: id({ req: true }), tank: num(0, 50), sac: num(0, 100), current: obj(CURRENT), nextFirst: bool },
    dive: { incidentId: id({ req: true }), memberId: id({ req: true }), startAt: iso({ req: true }), ascentAt: iso(), endAt: iso(), updatedAt: iso(), plannedDepth: num(0, 200), tank: num(0, 50), startP: num(0, 400), endP: num(0, 400), maxDepth: num(0, 200), adt: num(0, 2000), safetyStop: nullableBool, stopMin: num(0, 600), decoStopDone: num(0, 600), condition: oneOf(['有', '無', '']), note: str(1000), treatAsFirst: bool, deleted: bool, edits: list(obj(EDIT), 50), imported: bool, importNo: num(0, 99999), noTime: bool, decoTable: oneOf(['有', '無', '']) }
  };
  function clean(fields, data) {
    const out = {};
    for (const [k, fn] of Object.entries(fields)) {
      const v = fn(data[k]);
      if (v === undefined) {
        // 必須の欄が壊れている → 文書ごと受け付けない。任意の欄が壊れている → その欄を空に
        const req = fn(null) === undefined;
        if (req) return null;
        continue;
      }
      if (v !== null) out[k] = v;
    }
    return out;
  }
  return {
    kinds: Object.keys(F),
    fields(kind) { return F[kind] || {}; },
    // 文書の中身を形に合わせる。受け付けられないときは null
    clean(kind, data) { return F[kind] && data && typeof data === 'object' && !Array.isArray(data) ? clean(F[kind], data) : null; }
  };
})();
