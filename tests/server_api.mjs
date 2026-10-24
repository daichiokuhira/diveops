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
  r = await post('/api/sync', { since: 0, changes: [doc('incident', 'I1', { title: '訓練', status: 'active' }, t(60)), doc('dive', 'D1', { incidentId: 'I1', memberId: '1002', maxDepth: 18 }, t(60))] }, M);
  ex('隊員は事案と潜水を記録できる', r.body.rejected, []);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'D1', { incidentId: 'I1', memberId: '1002', maxDepth: 12 }, t(120))] }, L);
  ex('古い変更は受け取らない', r.body.rejected.map(x => x.reason), ['stale']);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'D1', { incidentId: 'I1', memberId: '1002', maxDepth: 19 }, t(10))] }, L);
  ex('新しい変更で上書き', [r.body.rejected, r.body.changes.find(c => c.id === 'D1').data.maxDepth], [[], 19]);
  const top = r.body.seq;
  r = await post('/api/sync', { since: top, changes: [] }, M);
  ex('差分の取得（変わっていなければ0件）', [r.body.changes.length, r.body.seq], [0, top]);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'D1', { incidentId: 'I1', memberId: '1002', maxDepth: 19 }, t(5), true)] }, M);
  ex('削除も「削除」として伝わる', r.body.changes.find(c => c.id === 'D1').deleted, true);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', 'D2', {}, new Date(Date.now() + 3600e3).toISOString())] }, M);
  ex('時計が進んだ端末の変更は受け取らない', r.body.rejected.map(x => x.reason), ['端末の時計が進んでいます。日時を合わせてください']);
  r = await post('/api/sync', { since: 0, changes: [doc('dive', '<img>', {})] }, M);
  ex('おかしな id は受け取らない', r.body.rejected.map(x => x.reason), ['形が正しくありません']);
  r = await post('/api/sync', { since: 999999, changes: [] }, M);
  ex('サーバーより先の番号なら最初から', r.body.changes.length > 0, true);

  // 退職にすると、その人の証明は使えなくなる
  await post('/api/sync', { since: 0, changes: [doc('member', '1002', { name: '見本 二郎', status: '退職' })] }, L);
  ex('退職した隊員の証明は使えない', (await post('/api/sync', { since: 0, changes: [] }, M)).status, 401);

  // 総当たりを防ぐ
  let last;
  for (let i = 0; i < 12; i++) last = await post('/api/login', { memberId: '1001', passcode: 'wrong' + i });
  ex('失敗が続くと止める', last.status, 429);
} catch (e) {
  ng++; console.log('NG 例外', e);
} finally {
  dev.kill('SIGTERM');
  rmSync(persist, { recursive: true, force: true });
}
console.log(`${ok}件 OK / ${ng}件 NG`);
process.exit(ng ? 1 : 0);
