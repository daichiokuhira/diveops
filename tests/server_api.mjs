// 共有 API の試験：手元で wrangler dev（D1 は手元の一時フォルダ）を起動し、ログイン・同期・権限を確かめる
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = path.join(ROOT, 'server');
const PORT = Number(process.env.API_PORT || 8788);
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = 'test-pass-' + Math.random().toString(36).slice(2);
const persist = mkdtempSync(path.join(tmpdir(), 'diveops-d1-'));
const wrangler = path.join(ROOT, 'node_modules', '.bin', 'wrangler');
const vars = ['--var', `TEAM_PASSCODE:${PASS}`, '--var', 'SECRET_KEY:' + 'k'.repeat(64), '--var', 'ADMIN_IDS:9001', '--var', 'ALLOWED_ORIGINS:http://127.0.0.1:8765'];

let ok = 0, ng = 0;
const ex = (label, got, want) => { const p = JSON.stringify(got) === JSON.stringify(want); p ? ok++ : ng++; console.log(p ? 'OK ' : 'NG ', label, p ? '' : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); };

execFileSync(wrangler, ['d1', 'execute', 'diveops', '--local', '--persist-to', persist, '--file', 'schema.sql'], { cwd: SERVER, stdio: 'ignore' });
const dev = spawn(wrangler, ['dev', '--local', '--port', String(PORT), '--persist-to', persist, ...vars], { cwd: SERVER, stdio: ['ignore', 'pipe', 'pipe'] });
const up = async () => { for (let i = 0; i < 120; i++) { try { await fetch(BASE + '/api/me'); return; } catch (e) { await new Promise(r => setTimeout(r, 500)); } } throw new Error('wrangler dev が起動しない'); };

const post = async (p, body, token, origin) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};
const t = (m) => new Date(Date.now() - m * 1000).toISOString();
const doc = (kind, id, data, updatedAt = t(0), deleted = false) => ({ kind, id, data, updatedAt, deleted });

try {
  await up();
  // ログイン
  ex('パスコード違いは拒否', (await post('/api/login', { memberId: '9001', passcode: 'x' })).status, 401);
  ex('名簿にない隊員は拒否', (await post('/api/login', { memberId: '1001', passcode: PASS })).status, 401);
  const a = await post('/api/login', { memberId: '9001', passcode: PASS }, null, 'http://127.0.0.1:8765');
  ex('管理者はログインできる', [a.status, a.body.member.role], [200, 'admin']);
  ex('許した場所からは CORS の許可が付く', a.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8765');
  const bad = await post('/api/login', { memberId: '9001', passcode: PASS }, null, 'https://evil.example');
  ex('許していない場所には付かない', bad.headers.get('access-control-allow-origin'), null);
  const A = a.body.token;
  ex('証明なしの同期は拒否', (await post('/api/sync', { since: 0, changes: [] })).status, 401);
  ex('改ざんした証明は拒否', (await post('/api/sync', { since: 0, changes: [] }, A.slice(0, -2) + 'xx')).status, 401);

  // 管理者が隊員を登録（隊長1人・隊員1人）
  let r = await post('/api/sync', { since: 0, changes: [doc('member', '1001', { name: '見本 一郎', status: '在籍', role: 'leader' }), doc('member', '1002', { name: '見本 二郎', status: '在籍' })] }, A);
  ex('管理者は隊員と隊長を登録できる', [r.status, r.body.rejected.length, r.body.changes.length], [200, 0, 2]);
  const L = (await post('/api/login', { memberId: '1001', passcode: PASS })).body.token;
  const M0 = await post('/api/login', { memberId: '1002', passcode: PASS });
  ex('隊員の役割', M0.body.member.role, 'member');
  const M = M0.body.token;

  // 権限
  r = await post('/api/sync', { since: 0, changes: [doc('member', '1003', { name: '勝手 三郎' })] }, M);
  ex('隊員は隊員を追加できない', r.body.rejected.map(x => x.reason), ['隊員の追加・変更は隊長だけができます']);
  r = await post('/api/sync', { since: 0, changes: [doc('member', '1002', { name: '見本 二郎', status: '在籍', role: 'leader' })] }, L);
  ex('隊長は隊長を指名できない', r.body.rejected.map(x => x.reason), ['隊長の指名は管理者だけができます']);
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'q1', { memberId: '1002', kind: '資格', name: '潜水士免許', date: '2020-01-01' })] }, M);
  ex('隊員は自分の資格を入れられる', r.body.rejected, []);
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'qc', { memberId: '1002', kind: '資格', name: 'Cカード', org: 'PADI', level: 'アドバンスド', date: '2010-08-01' })] }, M);
  { const c = r.body.changes.find(x => x.id === 'qc'); ex('Cカードの指導団体・ランクも共有される', [c?.data.org, c?.data.level], ['PADI', 'アドバンスド']); }
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'q2', { memberId: '1001', kind: '資格', name: '潜水士免許', date: '2020-01-01' })] }, M);
  ex('他人の資格は入れられない', r.body.rejected.map(x => x.reason), ['自分以外の資格・研修は入力できません']);
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'q1', { memberId: '1002', kind: '資格', name: '潜水士免許', date: '2020-01-01', confirmedAt: t(0) })] }, M);
  ex('隊員は自分で確認済みにできない', r.body.rejected.map(x => x.reason), ['資格の確認は隊長だけができます']);
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'q1', { memberId: '1002', kind: '資格', name: '潜水士免許', date: '2020-01-01', confirmedAt: t(0), confirmedBy: '偽名' })] }, L);
  const q1 = r.body.changes.find(c => c.id === 'q1');
  ex('隊長は確認でき、確認者はサーバーが入れる', [r.body.rejected, q1.data.confirmedBy, q1.data.confirmedById, q1.updatedBy], [[], '見本 一郎', '1001', '1001']);
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'q1', { memberId: '1002', kind: '資格', name: '潜水士', date: '2019-01-01' })] }, M);
  ex('確認済みは隊員が直せない', r.body.rejected.map(x => x.reason), ['確認済みの資格・研修は隊長だけが直せます']);

  // 事案・潜水は誰でも。新しい方が勝つ
  r = await post('/api/sync', { since: 0, changes: [doc('incident', 'I1', { createdAt: t(600), title: '訓練', status: 'active' }, t(60)), doc('dive', 'D1', { incidentId: 'I1', memberId: '1002', startAt: t(600), maxDepth: 18 }, t(60))] }, M);
  ex('隊員は事案と潜水を記録できる', r.body.rejected, []);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'D1', { incidentId: 'I1', memberId: '1002', startAt: t(600), maxDepth: 12 }, t(120))] }, L);
  ex('古い変更は受け取らない', r.body.rejected.map(x => x.reason), ['stale']);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'D1', { incidentId: 'I1', memberId: '1002', startAt: t(600), maxDepth: 19 }, t(10))] }, L);
  ex('新しい変更で上書き', [r.body.rejected, r.body.changes.find(c => c.id === 'D1').data.maxDepth], [[], 19]);
  const top = r.body.seq;
  r = await post('/api/sync', { since: top, changes: [] }, M);
  ex('差分の取得（変わっていなければ0件）', [r.body.changes.length, r.body.seq], [0, top]);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'D1', { incidentId: 'I1', memberId: '1002', startAt: t(600), maxDepth: 19 }, t(5), true)] }, M);
  ex('潜水の文書ごとの削除は受け付けない（「削除済み」にする）', r.body.rejected.map(x => x.reason), ['潜水の記録は消せません（「削除済み」にしてください）']);
  await post('/api/sync', { since: 0, changes: [doc('incident', 'E1', { createdAt: t(600) }, t(600))] }, M);
  r = await post('/api/sync', { since: 0, changes: [doc('incident', 'E1', {}, t(5), true)] }, M);
  ex('記録の無い事案の削除は「削除」として伝わる', r.body.changes.find(c => c.id === 'E1').deleted, true);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'D2', { incidentId: 'I1', memberId: '1002', startAt: t(60) }, new Date(Date.now() + 3600e3).toISOString())] }, M);
  ex('時計が進んだ端末の変更は受け取らない', r.body.rejected.map(x => x.reason), ['端末の時計が進んでいます。日時を合わせてください']);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', '<img>', {})] }, M);
  ex('おかしな id は受け取らない', r.body.rejected.map(x => x.reason), ['形が正しくありません']);
  r = await post('/api/sync', { since: 999999, changes: [] }, M);
  ex('サーバーより先の番号なら最初から', r.body.changes.length > 0, true);

  // 決めた形だけを残す（数字の欄に文字、決めていない欄、壊れた必須の欄）
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'X1', { incidentId: 'I1', memberId: '1002', startAt: t(30), maxDepth: '<img src=x onerror=alert(1)>', adt: 20, evil: '<script>' })] }, M);
  const x1 = r.body.changes.find(c => c.id === 'X1');
  ex('数字の欄の文字と、決めていない欄は捨てる', [r.body.rejected, x1 && x1.data.maxDepth, x1 && x1.data.evil, x1 && x1.data.adt], [[], undefined, undefined, 20]);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'X2', { incidentId: 'I1', memberId: '1002', startAt: 'きのう' })] }, M);
  ex('必須の欄が壊れていれば受け付けない', r.body.rejected.map(x => x.reason), ['形が正しくありません']);
  r = await post('/api/sync', { since: 0, changes: [doc('incident', 'I2', { createdAt: t(0), title: 'a'.repeat(500), memo: '1行目\n2行目' })] }, M);
  const i2 = r.body.changes.find(c => c.id === 'I2');
  ex('長すぎる文字は切る・備考の改行は残す', [i2.data.title.length, i2.data.memo], [120, '1行目\n2行目']);
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'q3', { memberId: '1002', kind: '研修', name: '水難救助研修', date: '2022-01-01' })] }, M);
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'q3', {}, t(0), true)] }, M);
  ex('自分の未確認の資格は消せる', r.body.rejected, []);

  // 2台が同時に送っても、新しい方が残る（40回）
  let lost = 0;
  for (let i = 0; i < 40; i++) {
    const older = t(20), newer = t(10);
    await Promise.all([post('/api/sync', { since: 0, changes: [doc('incident', 'R' + i, { createdAt: t(100), title: '新' }, newer)] }, M), post('/api/sync', { since: 0, changes: [doc('incident', 'R' + i, { createdAt: t(100), title: '旧' }, older)] }, L)]);
    const all = await post('/api/sync', { since: 0, changes: [] }, M);
    if (all.body.changes.find(c => c.id === 'R' + i)?.data.title !== '新') lost++;
  }
  ex('同時に送っても新しい方が残る', lost, 0);
  // 潜水中・潜水のある潜水員は外せない／電波のない間の潜降は「外す」より優先
  await post('/api/sync', { since: 0, changes: [doc('incident', 'J1', { createdAt: t(300), status: 'active' }, t(300)), doc('diver', 'J1~1002', { incidentId: 'J1', memberId: '1002', current: { startAt: t(200) } }, t(200))] }, M);
  r = await post('/api/sync', { since: 0, changes: [doc('diver', 'J1~1002', {}, t(100), true)] }, L);
  ex('潜水中の潜水員は外せない', r.body.rejected.map(x => x.reason), ['潜水中の潜水員は外せません']);
  await post('/api/sync', { since: 0, changes: [doc('diver', 'J1~1003', { incidentId: 'J1', memberId: '1003' }, t(250))] }, M);
  await post('/api/sync', { since: 0, changes: [doc('diver', 'J1~1003', {}, t(90), true)] }, L);
  r = await post('/api/sync', { since: 0, changes: [doc('diver', 'J1~1003', { incidentId: 'J1', memberId: '1003', current: { startAt: t(120) } }, t(120))] }, M);
  ex('電波のない間の潜降は、先に届いた「外す」より優先', [r.body.rejected, r.body.changes.find(c => c.id === 'J1~1003')?.deleted], [[], false]);
  r = await post('/api/sync', { since: 0, changes: [doc('incident', 'J1', {}, t(5), true)] }, L);
  ex('潜水のある事案は消せない', r.body.rejected.map(x => x.reason), ['潜水の記録がある事案は消せません']);
  await post('/api/sync', { since: 0, changes: [doc('incident', 'J2', { createdAt: t(300) }, t(300))] }, M);
  await post('/api/sync', { since: 0, changes: [doc('incident', 'J2', {}, t(50), true)] }, L);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'JD', { incidentId: 'J2', memberId: '1002', startAt: t(200) }, t(40))] }, M);
  ex('消された事案に潜水が届いたら、事案を戻す', r.body.changes.find(c => c.id === 'J2')?.deleted, false);
  r = await post('/api/sync', { since: 999999, changes: [] }, M);
  ex('サーバーを作り直したときは知らせる', r.body.reset, true);

  // 守りの強化（2周目のレビュー）
  r = await post('/api/sync', { since: 0, changes: [doc('qual', 'q9', { memberId: '1002', kind: '資格', name: '潜水士免許', date: '2026-02-31', confirmedBy: '偽の隊長', confirmedById: '1001' })] }, M);
  const q9 = r.body.changes.find(c => c.id === 'q9');
  ex('確認者の欄は本人が入れても残らない・実在しない日付は空に', [q9.data.confirmedBy, q9.data.confirmedById, q9.data.date], [undefined, undefined, undefined]);
  r = await post('/api/sync', { since: 0, changes: [{ ...doc('incident', 'Z1', { createdAt: t(9) }), deleted: 'false' }] }, M);
  ex('削除の印が真偽値でなければ受け付けない', r.body.rejected.map(x => x.reason), ['形が正しくありません']);
  await post('/api/sync', { since: 0, changes: [doc('member', '1005', { name: '別 隊長', status: '在籍', role: 'leader' })] }, A);
  r = await post('/api/sync', { since: 0, changes: [doc('member', '1005', { name: '別 隊長', status: '退職', role: 'leader' })] }, L);
  ex('隊長は別の隊長を退職にできない', r.body.rejected.map(x => x.reason), ['隊長の名簿の変更は管理者だけができます']);
  await post('/api/sync', { since: 0, changes: [doc('incident', 'K1', { createdAt: t(4000) }, t(4000)), doc('diver', 'K1~1002', { incidentId: 'K1', memberId: '1002', current: { id: 'cur-1', startAt: t(3600) } }, t(3500))] }, M);
  r = await post('/api/sync', { since: 0, changes: [doc('diver', 'K1~1002', { incidentId: 'K1', memberId: '1002', current: null }, t(10))] }, M);
  ex('浮上の記録がないまま、潜水中の印は外せない（15分を過ぎたら）', r.body.rejected.map(x => x.reason), ['浮上の記録がないまま、潜水中の印は外せません']);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'cur-1', { incidentId: 'K1', memberId: '1002', startAt: t(3600), maxDepth: 10, adt: 30 }, t(8)), doc('diver', 'K1~1002', { incidentId: 'K1', memberId: '1002', current: null }, t(8))] }, M);
  ex('浮上の記録と一緒なら外せる', r.body.rejected, []);
  r = await post('/api/sync', { since: 0, changes: Array.from({ length: 6 }, (_, i) => doc('incident', 'N' + i, { createdAt: t(1) })) }, M);
  ex('1回に送れる件数を超えたら断り、上限を知らせる', [r.status, r.body.limit], [413, 5]);

  // 事案の情報は欄ごとに新しい方を取る（2台が別の欄を直しても、両方残る）
  await post('/api/sync', { since: 0, changes: [doc('incident', 'F1', { createdAt: t(500), site: 'A港', memo: '' }, t(500))] }, M);
  await post('/api/sync', { since: 0, changes: [{ ...doc('incident', 'F1', { createdAt: t(500), site: 'B港', memo: '' }, t(50)), fields: ['site'] }] }, L);
  r = await post('/api/sync', { since: 0, changes: [{ ...doc('incident', 'F1', { createdAt: t(500), site: 'A港', memo: '視界不良' }, t(100)), fields: ['memo'] }] }, M);
  const f1 = r.body.changes.find(c => c.id === 'F1');
  ex('別の欄の修正は両方残る（電波のない間の古い修正でも）', [r.body.rejected, f1.data.site, f1.data.memo], [[], 'B港', '視界不良']);
  r = await post('/api/sync', { since: 0, changes: [{ ...doc('incident', 'F1', { createdAt: t(500), site: 'C港' }, t(80)), fields: ['site'] }] }, M);
  ex('同じ欄は新しい方が勝ち、断るときはサーバーの中身を返す', [r.body.rejected.map(x => x.reason), r.body.rejected[0]?.doc?.data.site], [['stale'], 'B港']);
  // 消された事案は、中身ごと戻る
  await post('/api/sync', { since: 0, changes: [doc('incident', 'G1', { createdAt: t(500), title: '戻る事案', site: '佐良浜' }, t(500))] }, M);
  await post('/api/sync', { since: 0, changes: [doc('incident', 'G1', {}, t(40), true)] }, L);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'GD', { incidentId: 'G1', memberId: '1002', startAt: t(300) }, t(30))] }, M);
  const g1 = r.body.changes.find(c => c.id === 'G1');
  ex('消された事案は中身ごと戻る', [g1.deleted, g1.data.title, g1.data.site], [false, '戻る事案', '佐良浜']);

  // 3周目：潜水員の id と中身、持ち主の固定、外された潜水員に潜水が届いたら戻す
  r = await post('/api/sync', { since: 0, changes: [doc('diver', 'K1~9999', { incidentId: 'K1', memberId: '1002' }, t(5))] }, M);
  ex('潜水員の id と中身が合わなければ受け付けない', r.body.rejected.map(x => x.reason), ['形が正しくありません']);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'cur-1', { incidentId: 'K1', memberId: '1001', startAt: t(3600) }, t(4))] }, M);
  ex('潜水の持ち主は替えられない', r.body.rejected.map(x => x.reason), ['記録の持ち主は替えられません']);
  await post('/api/sync', { since: 0, changes: [doc('incident', 'H1', { createdAt: t(900) }, t(900)), doc('diver', 'H1~1002', { incidentId: 'H1', memberId: '1002' }, t(900))] }, M);
  await post('/api/sync', { since: 0, changes: [doc('diver', 'H1~1002', {}, t(60), true)] }, L);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'HD', { incidentId: 'H1', memberId: '1002', startAt: t(800), maxDepth: 9, adt: 20 }, t(70))] }, M);
  ex('外された潜水員に潜水が届いたら、潜水員も戻る', r.body.changes.find(c => c.id === 'H1~1002')?.deleted, false);

  // 退職にすると、その人の証明は使えなくなる
  await post('/api/sync', { since: 0, changes: [doc('member', '1002', { name: '見本 二郎', status: '退職' })] }, L);
  ex('退職した隊員の証明は使えない', (await post('/api/sync', { since: 0, changes: [] }, M)).status, 401);

  // 総当たりを防ぐ
  let last;
  for (let i = 0; i < 12; i++) last = await post('/api/login', { memberId: '1001', passcode: 'wrong' + i });
  ex('同じ職員番号で失敗が続くと止める', last.status, 429);
  ex('ほかの職員番号は止めない（署で一斉にログインしても）', (await post('/api/login', { memberId: '9001', passcode: PASS })).status, 200);
  const other = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }, body: JSON.stringify({ memberId: '1001', passcode: PASS }) });
  ex('ほかの場所からの本人は締め出されない', other.status, 200);

  // 大きすぎる送信は途中で読むのをやめて断る。そのあとの接続が乱れることがあるので、いちばん最後に試す
  const big = JSON.stringify({ since: 0, changes: [doc('incident', 'BIG', { createdAt: t(1), memo: 'x'.repeat(3 * 1024 * 1024) })] });
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const Z = (await post('/api/login', { memberId: '9001', passcode: PASS })).body.token;
  const rb = await fetch(BASE + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Z }, body: stream, duplex: 'half' });
  ex('大きさを書かずに送っても2MBを超えれば断る', rb.status, 413);
} catch (e) {
  ng++; console.log('NG 例外', e);
} finally {
  dev.kill('SIGTERM');
  rmSync(persist, { recursive: true, force: true });
}
console.log(`${ok}件 OK / ${ng}件 NG`);
process.exit(ng ? 1 : 0);
