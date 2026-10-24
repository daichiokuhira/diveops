"""共有（Cloudflare）を使うときの画面テスト。
手元で wrangler dev（D1 は一時フォルダ）を起動し、共有する設定でアプリを作って、3台の端末で同時に使う。
管理者 9001 が隊員を登録 → 隊員 1002 が自分の資格を入れる → 隊長 1001 が確かめる、
1つの事案を2台で記録、電波のない間の記録をあとで送る、権限、ログアウト、を確かめる。"""
import asyncio, functools, http.server, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_PORT, WEB_PORT = 8789, 8766
API, WEB = f'http://127.0.0.1:{API_PORT}', f'http://127.0.0.1:{WEB_PORT}/index.html'
PASS = 'cloud-test-' + str(int(time.time()))
work = tempfile.mkdtemp(prefix='diveops-cloud-')
dist, persist = os.path.join(work, 'dist'), os.path.join(work, 'd1')
wrangler = os.path.join(ROOT, 'node_modules', '.bin', 'wrangler')

subprocess.run([sys.executable, 'app/build.py'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL, env={**os.environ, 'DIVEOPS_API_BASE': API, 'DIVEOPS_DIST': dist})
subprocess.run([wrangler, 'd1', 'execute', 'diveops', '--local', '--persist-to', persist, '--file', 'schema.sql'], cwd=os.path.join(ROOT, 'server'), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
dev = subprocess.Popen([wrangler, 'dev', '--local', '--port', str(API_PORT), '--persist-to', persist, '--var', f'TEAM_PASSCODE:{PASS}', '--var', 'SECRET_KEY:' + 's' * 64, '--var', 'ADMIN_IDS:9001', '--var', f'ALLOWED_ORIGINS:http://127.0.0.1:{WEB_PORT}'],
                       cwd=os.path.join(ROOT, 'server'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', WEB_PORT), functools.partial(http.server.SimpleHTTPRequestHandler, directory=dist))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
for _ in range(120):
    try: urllib.request.urlopen(API + '/api/me'); break
    except urllib.error.HTTPError: break
    except Exception: time.sleep(0.5)

ok = ng = 0
def ex(label, got, want):
    global ok, ng
    p = got == want
    ok += p; ng += (not p)
    print('OK ' if p else 'NG ', label, '' if p else f'got={got!r} want={want!r}')

async def device(b, name):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, locale='ja-JP', timezone_id='Asia/Tokyo', accept_downloads=True)
    pg = await ctx.new_page()
    pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(f'{name}: {e}'))
    await pg.goto(WEB)
    return ctx, pg

async def login(pg, mid):
    await pg.fill('#li-id', mid); await pg.fill('#li-pass', PASS)
    await pg.click('[data-act="login"]'); await pg.wait_for_timeout(1500)

async def refresh(pg):
    # 開き直すと、起動時に共有の記録を取りに行く
    await pg.reload(); await pg.wait_for_timeout(1800)

async def settled(pg):
    await pg.wait_for_timeout(2600)  # 変更の 1.5 秒後に送る

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ca, A = await device(b, 'A')
        ex('最初はログイン画面', await A.locator('#li-id').count(), 1)
        await A.fill('#li-id', '9001'); await A.fill('#li-pass', 'wrong'); await A.click('[data-act="login"]'); await A.wait_for_timeout(800)
        ex('パスコード違いは入れない', await A.locator('text=職員番号かパスコードが違います').count(), 1)
        await login(A, '9001')
        ex('管理者でログイン（見本は出ない）', [await A.locator('#li-id').count(), await A.locator('text=見本').count()], [0, 0])

        # 管理者が隊員を登録し、1001 を隊長にする
        await A.click('[data-act="go"][data-to="settings"]')
        await A.click('summary >> text=まとめて登録する'); await A.fill('#m-bulk', '1001,宮古 太郎\n1002,伊良部 次郎\n1003,池間 三郎')
        await A.click('[data-act="bulk-member"]')
        await A.click('[data-sheet="member"][data-id="1001"]'); await A.click('[data-act="p-role"]'); await A.click('[data-act="sheet-close"]')
        await settled(A)
        ex('管理者の端末で共有済み', await A.locator('[data-sync-badge] >> text=共有済').count() >= 1, True)

        # 隊員 1002 が別の端末で入り、自分の資格を入れる
        cb, B = await device(b, 'B')
        await login(B, '1002')
        await B.click('[data-act="go"][data-to="settings"]')
        ex('隊員の端末にも名簿が届く', await B.locator('text=宮古 太郎').count() >= 1, True)
        ex('隊員には隊員の追加がない', await B.locator('[data-act="add-member"]').count(), 0)
        await B.click('[data-sheet="member"][data-id="1001"]')
        ex('他人の資格は入れられない（欄が出ない）', await B.locator('.sheet [data-act="add-qual"]').is_visible(), False)
        await B.click('[data-act="sheet-close"]')
        await B.click('[data-sheet="member"][data-id="1002"]')
        await B.click('[data-act="q-pick"][data-v="潜水士免許"]'); await B.fill('#q-date', '2021-04-01')
        await B.click('[data-act="add-qual"]')
        ex('自分の資格は入れられる・確かめるボタンは出ない', [await B.locator('.sheet >> text=潜水士免許（未確認）').count(), await B.locator('[data-act="confirm-qual"]').count()], [1, 0])
        await B.click('[data-act="sheet-close"]'); await settled(B)

        # 隊長 1001 が確かめる
        cc, C = await device(b, 'C')
        await login(C, '1001')
        await C.click('[data-act="go"][data-to="settings"]')
        await C.click('[data-sheet="member"][data-id="1002"]')
        await C.click('[data-act="confirm-qual"]'); await C.click('[data-act="sheet-close"]'); await settled(C)
        await refresh(B); await B.click('[data-act="go"][data-to="settings"]')
        await B.click('[data-sheet="member"][data-id="1002"]')
        ex('隊長が確かめた結果が本人の端末に届く（確かめた人の名前つき）', await B.locator('.sheet >> text=確認 宮古 太郎').count(), 1)
        await B.click('[data-act="sheet-close"]'); await B.click('[data-act="back"]')

        # 1つの事案を2台で記録する：A が始めて 1002 を潜降、C が同じ事案で 1003 を潜降
        await A.click('[data-act="back"]')
        await A.click('text=新しい事案を始める')
        await A.fill('#n-site', '佐良浜漁港'); await A.fill('#n-title', '共有訓練')
        await A.select_option('#n-cmd', '1001')
        await A.click('[data-act="draft-diver"][data-v="1002"]'); await A.click('[data-act="draft-diver"][data-v="1003"]')
        await A.click('text=記録を始める')
        await A.click('[data-act="sheet"][data-sheet="down"][data-i="1002"]'); await A.click('[data-act="down-depth"][data-v="12"]'); await A.click('[data-act="do-down"]')
        await settled(A)
        await C.click('[data-act="back"]'); await refresh(C)
        ex('ほかの端末の進行中の事案が見える', await C.locator('text=共有訓練').count() >= 1, True)
        await C.click('text=共有訓練')
        ex('ほかの端末で潜降した人が「潜水中」', await C.locator('text=潜水中').count() >= 1, True)
        await C.click('[data-act="sheet"][data-sheet="down"][data-i="1003"]'); await C.click('[data-act="down-depth"][data-v="9"]'); await C.click('[data-act="do-down"]')
        await settled(C); await refresh(A); await A.click('text=共有訓練')
        ex('2台目で潜降した人も1台目に届く', await A.locator('.state >> text=潜水中').count(), 2)

        # 電波のない間の記録：A が電波なしで 1002 を浮上 → 電波が戻ったら送る
        await ca.set_offline(True)
        await A.click('[data-act="ascent"][data-i="1002"]')
        await A.click('[data-act="sheet"][data-sheet="up"][data-i="1002"]')
        await A.fill('#u-depth', '11'); await A.dispatch_event('#u-depth', 'input')
        await A.click('[data-act="up-safety"][data-v="有"]'); await A.click('[data-act="up-cond"][data-v="無"]')
        await A.click('[data-act="do-up"]'); await A.wait_for_timeout(2600)
        ex('電波なしは未送信として表示', await A.locator('[data-sync-badge] >> text=未送信').count() >= 1, True)
        await refresh(C); await C.click('text=共有訓練')
        ex('電波なしの間はほかの端末に届かない', await C.locator('.state >> text=水面休息').count(), 0)
        await ca.set_offline(False); await A.evaluate("window.dispatchEvent(new Event('online'))"); await A.wait_for_timeout(2500)
        await refresh(C); await C.click('text=共有訓練')
        ex('電波が戻ると届く', await C.locator('.state >> text=水面休息').count(), 1)

        # 記録・経歴簿：隊長の端末で、ほかの端末の記録も入る
        await C.click('[data-act="back"]'); await C.click('[data-act="go"][data-to="records"]')
        await C.click('[data-act="rec-period"][data-v="all"]')
        ex('ほかの端末で記録した潜水も経歴簿に入る', await C.locator('text=伊良部 次郎').count() >= 1 and await C.locator('text=1本（').count() >= 1, True)
        async with C.expect_download() as dl:
            await C.click('[data-act="rec-csv"]')
        text = open(await (await dl.value).path(), encoding='utf-8').read()
        ex('台帳用CSVにほかの端末の記録が入る', '1002' in text and '共有訓練' in text, True)

        # 退職にすると、その人は入れなくなる
        await C.click('[data-act="back"]'); await C.click('[data-act="go"][data-to="settings"]')
        await C.click('[data-sheet="member"][data-id="1003"]'); await C.click('[data-act="p-status"][data-v="退職"]'); await C.click('[data-act="save-member"]')
        await C.click('[data-act="sheet-close"]'); await settled(C)
        cd, D = await device(b, 'D')
        await login(D, '1003')
        ex('退職した隊員はログインできない', await D.locator('text=職員番号かパスコードが違います').count(), 1)

        # 潜水中に共有が止まっても（在籍の変更・期限切れなど）、画面は替わらず記録を続けられる
        await A.click('[data-act="back"]') if await A.locator('[data-act="back"]').count() else None
        await refresh(A); await A.click('text=共有訓練')
        await C.click('[data-sheet="member"][data-id="1003"]'); await C.click('[data-act="p-status"][data-v="在籍"]'); await C.click('[data-act="save-member"]'); await C.click('[data-act="sheet-close"]'); await settled(C)
        cg, G = await device(b, 'G')
        await login(G, '1003'); await G.click('text=共有訓練')
        await C.click('[data-sheet="member"][data-id="1003"]'); await C.click('[data-act="p-status"][data-v="異動"]'); await C.click('[data-act="save-member"]'); await C.click('[data-act="sheet-close"]'); await settled(C)
        await G.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await G.wait_for_timeout(2000)
        ex('共有が止まっても、ボードはそのまま・帯で知らせる', [await G.locator('.diver').count() >= 1, await G.locator('text=共有が止まっています').count()], [True, 1])

        # 使う人を替える：電波なしでは替えられない／替えても記録は残る
        await cb.set_offline(True)
        await B.click('[data-act="go"][data-to="settings"]')
        await B.click('[data-sheet="member"][data-id="1002"]')
        await B.click('[data-act="q-kind"][data-v="研修"]'); await B.click('[data-act="q-pick"][data-v="水難救助研修"]'); await B.fill('#q-date', '2022-10-01'); await B.click('[data-act="add-qual"]')
        await B.click('[data-act="sheet-close"]'); await B.wait_for_timeout(500)
        await B.click('[data-act="logout"]')
        ex('電波なしでは使う人を替えられない', [await B.locator('#li-id').count(), await B.locator('text=電波がないときは').count()], [0, 1])
        await cb.set_offline(False); await B.evaluate("window.dispatchEvent(new Event('online'))"); await B.wait_for_timeout(2500)
        await B.click('[data-act="logout"]'); await B.wait_for_timeout(500)
        ex('使う人を替えるとログイン画面（記録は端末に残る）', await B.locator('#li-id').count(), 1)
        await login(B, '1001')
        ex('次の人がログインすると、そのまま使える', await B.locator('text=共有訓練').count() >= 1, True)
        await refresh(C); await C.click('[data-act="go"][data-to="settings"]'); await C.click('[data-sheet="member"][data-id="1002"]')
        ex('電波が戻って送った研修は共有に残る', await C.locator('.sheet >> text=水難救助研修（未確認）').count(), 1)
        await C.click('[data-act="sheet-close"]')
        # 私物スマホ：進行中の事案がある間は消せない
        await B.click('[data-act="go"][data-to="settings"]'); await B.click('summary >> text=私物のスマホで使い終わったとき'); await B.click('[data-act="forget"]')
        ex('進行中の事案があれば端末から消せない', await B.locator('text=進行中の事案があります').count(), 1)

        # ===== 同期の難しい場面（レビューで見つかったもの） =====
        await C.click('[data-act="back"]') if await C.locator('[data-act="back"]').count() else None
        await C.click('[data-act="go"][data-to="settings"]')
        await C.fill('#m-id', '1004'); await C.fill('#m-name', '来間 四郎'); await C.click('[data-act="add-member"]'); await settled(C)
        await refresh(A)
        await A.click('text=新しい事案を始める'); await A.fill('#n-title', '同期試験'); await A.fill('#n-site', '長山港')
        await A.click('[data-act="draft-diver"][data-v="1002"]'); await A.click('[data-act="draft-diver"][data-v="1004"]'); await A.click('text=記録を始める'); await settled(A)
        # 元に戻すは、共有したあとでも効く
        await A.click('[data-act="sheet"][data-sheet="down"][data-i="1002"]'); await A.click('[data-act="down-depth"][data-v="12"]'); await A.click('[data-act="do-down"]')
        await A.wait_for_timeout(2300); await A.click('[data-act="undo"]'); await settled(A)
        await refresh(B); await B.click('text=同期試験')
        ex('共有したあとの「元に戻す」もほかの端末に届く', await B.locator('.state >> text=潜水中').count(), 0)
        # 2台で同じ人の浮上を記録しても1本
        await A.click('[data-act="sheet"][data-sheet="down"][data-i="1002"]'); await A.click('[data-act="down-depth"][data-v="12"]'); await A.click('[data-act="do-down"]'); await settled(A)
        await refresh(B); await B.click('text=同期試験')
        for P in (A, B):
            await P.click('[data-act="sheet"][data-sheet="up"][data-i="1002"]')
            await P.fill('#u-depth', '11'); await P.dispatch_event('#u-depth', 'input')
            await P.click('[data-act="up-safety"][data-v="有"]'); await P.click('[data-act="up-cond"][data-v="無"]'); await P.click('[data-act="do-up"]')
        await settled(A); await settled(B)
        await refresh(C); await C.click('text=同期試験')
        ex('2台で浮上を押しても潜水は1本', await C.locator('[data-sheet="diver"][data-i="1002"] >> text=1本').count(), 1)
        # 事案の情報を直したあと、ほかの端末が潜水を記録しても、直した内容は戻らない
        await A.click('[data-act="sheet"][data-sheet="editInc"]'); await A.fill('#i-site', '平良港 第1岸壁'); await A.click('[data-act="save-inc"]'); await settled(A)
        await B.click('[data-act="sheet"][data-sheet="down"][data-i="1004"]'); await B.click('[data-act="down-depth"][data-v="9"]'); await B.click('[data-act="do-down"]'); await settled(B)
        await refresh(C); await C.click('text=同期試験')
        ex('事案の修正が、ほかの端末の潜水の記録で戻らない', await C.locator('text=平良港 第1岸壁').count() >= 1, True)
        # 開いている画面の相手が、ほかの端末で外されたら閉じて知らせる（別の人を記録しない）
        await A.click('[data-act="sheet"][data-sheet="addDiver"]'); await A.click('[data-act="add-diver"][data-v="1001"]'); await settled(A)
        await A.click('[data-act="sheet"][data-sheet="down"][data-i="1001"]')
        await refresh(B); await B.click('text=同期試験'); await B.click('[data-act="sheet"][data-sheet="diver"][data-i="1001"]'); await B.click('[data-act="remove-diver"]'); await settled(B)
        await A.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await A.wait_for_timeout(2000)
        ex('開いていた潜降の画面は閉じて知らせる', [await A.locator('.sheet').count(), await A.locator('#toast >> text=ほかの端末で事案から外されました').count()], [0, 1])
        # 電波のない間の潜降は、ほかの端末の「外す」より優先（潜水中の人を消さない）
        await A.click('[data-act="sheet"][data-sheet="addDiver"]'); await A.click('[data-act="add-diver"][data-v="1001"]'); await settled(A)
        await refresh(B); await B.click('text=同期試験')
        await ca.set_offline(True)
        await A.click('[data-act="sheet"][data-sheet="down"][data-i="1001"]'); await A.click('[data-act="down-depth"][data-v="6"]'); await A.click('[data-act="do-down"]')
        await B.click('[data-act="sheet"][data-sheet="diver"][data-i="1001"]'); await B.click('[data-act="remove-diver"]'); await settled(B)
        await ca.set_offline(False); await A.evaluate("window.dispatchEvent(new Event('online'))"); await A.wait_for_timeout(3000)
        await refresh(C); await C.click('text=同期試験')
        ex('電波のない間に潜降した人は、外されずに潜水中のまま', await C.locator('.diver:has([data-i="1001"]) >> text=潜水中').count(), 1)

        errs = A.errs + B.errs + C.errs + D.errs + G.errs
        ex('画面のエラーなし', errs, [])
        await b.close()

try:
    asyncio.run(main())
finally:
    dev.terminate(); srv.shutdown(); shutil.rmtree(work, ignore_errors=True)
print(f'{ok}件 OK / {ng}件 NG')
sys.exit(1 if ng else 0)
