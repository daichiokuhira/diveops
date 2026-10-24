"""スマホ幅での画面テスト（Playwright）。一連の操作をして、画面とCSVの中身を確かめる。
撮った画面は tests/shots/ に保存する（コミットしない）。"""
import asyncio, http.server, threading, functools, os, sys, csv, io
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.path.join(ROOT, 'docs')))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/index.html'
SH = os.path.join(ROOT, 'tests', 'shots') + '/'
os.makedirs(SH, exist_ok=True)
ok = ng = 0
def ex(label, got, want):
    global ok, ng
    p = got == want
    ok += p; ng += (not p)
    print('OK ' if p else 'NG ', label, '' if p else f'got={got!r} want={want!r}')

# 保存データの時刻をずらす（潜水中・休息中の表示を確かめるため）
SHIFT = """([path, mins]) => { const s = JSON.parse(localStorage.getItem('diveops.v1')); const inc = s.incidents.find(i => i.status === 'active');
  const set = (o, k) => { o[k] = new Date(new Date(o[k]).getTime() - mins * 60000).toISOString(); };
  const dv = inc.divers[0]; if (path === 'current') { set(dv.current, 'startAt'); } else { const d = dv.dives[0]; set(d, 'startAt'); set(d, 'endAt'); if (d.ascentAt) set(d, 'ascentAt'); }
  localStorage.setItem('diveops.v1', JSON.stringify(s)); }"""

async def overflow(pg):
    return await pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ja-JP', timezone_id='Asia/Tokyo', accept_downloads=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.screenshot(path=SH + '01_home.png')
        ex('ホームに見本の事案', await pg.locator('.item').count() >= 1, True)

        # 新しい事案
        await pg.click('text=新しい事案を始める')
        await pg.fill('#n-site', '平良港 第3岸壁')
        await pg.fill('#n-title', '=水中捜索訓練')  # 数式に見える事案名（CSVで ' が付くこと）
        await pg.select_option('#n-cmd', 'S01')
        await pg.select_option('#n-watch', 'S04')
        await pg.click('[data-act="draft-diver"][data-v="S02"]')
        await pg.click('[data-act="draft-diver"][data-v="S03"]')
        await pg.screenshot(path=SH + '02_new.png')
        ex('新しい事案 はみ出しなし', await overflow(pg), False)
        await pg.click('text=記録を始める')

        # 潜降：水深を選ぶまで記録できない
        await pg.click('[data-act="sheet"][data-sheet="down"][data-i="0"]')
        ex('水深未選択では潜降を記録できない', await pg.locator('[data-act="do-down"]').count(), 0)
        await pg.click('[data-act="down-depth"][data-v="18"]')
        await pg.screenshot(path=SH + '03_down_sheet.png')
        ex('18m 1本目 潜水表 50分', '50分' in await pg.locator('.sheet .kv').inner_text(), True)
        await pg.click('[data-act="do-down"]')
        ex('お知らせが下に出る', await pg.evaluate("document.querySelector('#toast').getBoundingClientRect().top > innerHeight / 2"), True)

        # 上限を超えた表示（55分前に潜った扱い）
        await pg.evaluate(SHIFT, ['current', 55])
        await pg.reload(); await pg.click('.item >> nth=0'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=SH + '04_board_over.png')
        ex('上限超過を反転表示', await pg.locator('.remain.over').count(), 1)

        # 浮上開始の押し間違いは取り消せる
        await pg.click('[data-act="ascent"][data-i="0"]')
        await pg.click('[data-act="ascent-undo"][data-i="0"]')
        ex('浮上開始を取り消すと潜水中に戻る', await pg.locator('.remain.over').count(), 1)
        # 浮上開始 → 水面に着いた
        await pg.click('[data-act="ascent"][data-i="0"]')
        ex('浮上中の表示', await pg.locator('text=浮上中').count() >= 1, True)
        await pg.click('[data-act="sheet"][data-sheet="up"][data-i="0"]')
        ex('最大水深は空欄で始まる', await pg.input_value('#u-depth'), '')
        ex('潜水時間は浮上開始まで（55分、切り上げ）', await pg.input_value('#u-adt') in ('55', '56'), True)
        await pg.click('[data-act="do-up"]')
        ex('水深なしでは記録できない', 'S02' in await pg.evaluate("localStorage.getItem('diveops.v1')") and await pg.locator('#u-depth').count() == 1, True)
        await pg.click('[data-act="up-depth"][data-v="17"]')
        await pg.fill('#u-endp', '７０')  # 全角
        await pg.screenshot(path=SH + '05_up_sheet.png')
        await pg.fill('#u-adt', '52'); await pg.dispatch_event('#u-adt', 'input')
        ex('17m 52分は減圧（実停止時間の欄が出る）', await pg.locator('#u-deco').count(), 1)
        await pg.fill('#u-adt', '44'); await pg.dispatch_event('#u-adt', 'input')
        ex('44分なら減圧の欄は消える', await pg.locator('#u-deco').count(), 0)
        await pg.click('[data-act="do-up"]')
        ex('安全停止・体調異常を選ぶまで記録できない', await pg.locator('#u-depth').count(), 1)
        await pg.click('[data-act="up-cond"][data-v="無"]')
        await pg.click('[data-act="do-up"]')
        ex('安全停止を選ぶまで記録できない', await pg.locator('#u-depth').count(), 1)
        await pg.click('[data-act="up-safety"][data-v="有"]')
        await pg.click('[data-act="do-up"]')
        ex('浮上を記録した', await pg.locator('#u-depth').count(), 0)

        # 休息65分後
        await pg.evaluate(SHIFT, ['dive', 65])
        await pg.reload(); await pg.click('.item >> nth=0'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=SH + '06_board_rest.png')
        ex('休息中は次の上限を大きく出す', await pg.locator('.diver-info .next').count(), 1)
        ex('ボード はみ出しなし', await overflow(pg), False)

        # 修正（理由が必須）→ 2本目を記録 → 1本目を削除
        await pg.click('[data-act="sheet"][data-sheet="diver"][data-i="0"]')
        await pg.screenshot(path=SH + '07_diver_detail.png')
        await pg.click('[data-sheet="edit"][data-k="0"]')
        await pg.fill('#e-depth', '18')
        await pg.click('[data-act="save-edit"]')
        ex('理由なしでは直せない', await pg.locator('#e-why').count(), 1)
        await pg.fill('#e-why', '深度計の読み違い')
        await pg.click('[data-act="save-edit"]')
        ex('修正1回が残る', await pg.locator('text=修正1回').count(), 1)
        # 潜降を浮上より後にする修正は通さない
        await pg.click('[data-sheet="edit"][data-k="0"]')
        before = await pg.evaluate("JSON.parse(localStorage.getItem('diveops.v1')).incidents.find(i=>i.status==='active').divers[0].dives[0].startAt")
        end_hm = await pg.input_value('#e-end')
        h, m = map(int, end_hm.split(':')); m += 20; h = (h + m // 60) % 24; m %= 60
        await pg.fill('#e-start', f'{h:02d}:{m:02d}')
        await pg.fill('#e-why', '試験')
        await pg.click('[data-act="save-edit"]')
        after = await pg.evaluate("JSON.parse(localStorage.getItem('diveops.v1')).incidents.find(i=>i.status==='active').divers[0].dives[0].startAt")
        ex('潜降を浮上の後にする修正は保存しない', after, before)
        await pg.click('[data-act="sheet-close"]')
        await pg.click('[data-act="sheet"][data-sheet="diver"][data-i="0"]')
        await pg.click('[data-sheet="edit"][data-k="0"]')
        await pg.click('[data-act="delete-dive"]')
        ex('理由なしでは削除できない', await pg.locator('.dive-line.is-deleted').count(), 0)
        await pg.fill('#e-why', '別の隊員の記録を誤って入力')
        await pg.click('[data-act="delete-dive"]')
        ex('削除した記録は線で残る', await pg.locator('.dive-line.is-deleted').count(), 1)
        await pg.click('[data-act="sheet-close"]')
        ex('削除した潜水は計算に入っていないと知らせる', await pg.locator('text=削除した潜水は計算に入っていません').count(), 1)

        # 2人目（見本 三郎）も1本潜る
        await pg.click('[data-act="sheet"][data-sheet="down"][data-i="1"]')
        await pg.click('[data-act="down-depth"][data-v="12"]')
        await pg.click('[data-act="do-down"]')
        await pg.click('[data-act="sheet"][data-sheet="up"][data-i="1"]')  # 浮上開始を押し忘れて「もう水面にいる」
        ex('浮上開始なしでも浮上画面を開ける', await pg.locator('#u-asc').input_value(), '')
        await pg.fill('#u-depth', '11.5'); await pg.dispatch_event('#u-depth', 'input')
        await pg.click('[data-act="up-safety"][data-v="無"]')
        await pg.click('[data-act="up-cond"][data-v="有"]')
        await pg.fill('#u-note', '右耳の違和感, 浮上後に回復')
        await pg.click('[data-act="do-up"]')
        # あとで減圧が必要な潜水に直し、5mの停止が足りなければ止める（確かめたら元に戻す）
        await pg.click('[data-act="sheet"][data-sheet="diver"][data-i="1"]')
        await pg.click('[data-sheet="edit"][data-k="0"]')
        sh, sm = map(int, (await pg.input_value('#e-start')).split(':')); sm += 30; sh = (sh + sm // 60) % 24; sm %= 60
        await pg.fill('#e-end', f'{sh:02d}:{sm:02d}')
        await pg.fill('#e-depth', '30'); await pg.fill('#e-adt', '23'); await pg.fill('#e-stop', '3'); await pg.fill('#e-why', '試験')
        await pg.click('[data-act="save-edit"]')
        await pg.click('[data-act="sheet-close"]')
        ex('直して減圧になり停止不足 → 止める', await pg.locator('text=減圧停止が足りません').count() >= 1, True)
        await pg.click('[data-act="undo"]')
        ex('元に戻す', await pg.locator('text=減圧停止が足りません').count(), 0)

        # 終了の手続き：終了するまで送れない
        await pg.click('[data-act="go-summary"]')
        await pg.screenshot(path=SH + '08_summary.png', full_page=True)
        ex('終了前は送れない', await pg.locator('[data-act="share-csv"]').is_disabled(), True)
        ex('まとめ はみ出しなし', await overflow(pg), False)
        await pg.click('[data-act="close-inc"]')
        ex('終了後は送れる', await pg.locator('[data-act="save-csv"]').is_disabled(), False)
        async with pg.expect_download() as dl:
            await pg.click('[data-act="save-csv"]')
        path = await (await dl.value).path()
        raw = open(path, encoding='utf-8').read()
        open(SH + 'app.csv', 'w', encoding='utf-8', newline='').write(raw)
        ex('CSVはBOM付き', raw.startswith('﻿'), True)
        rows = list(csv.reader(io.StringIO(raw.lstrip('﻿'))))
        h = rows[0]
        ex('CSVは48列', len(h), 48)
        ex('15列目は「減圧停止(表の判定)」', h[14], '減圧停止(表の判定)')
        body = [dict(zip(h, r)) for r in rows[1:]]
        ex('削除した記録も状態=削除で出る', sorted(r['状態'] for r in body), ['削除', '記録'])
        r0 = next(r for r in body if r['職員番号'] == 'S02')
        r1 = next(r for r in body if r['職員番号'] == 'S03')
        ex('カンマを含む備考', r1['備考'], '右耳の違和感, 浮上後に回復')
        ex('体調異常 有', r1['体調異常'], '有')
        ex('11.5m は 12m の表で計算', r1['表の水深(m)'], '12')
        ex('職員番号は文字のまま', r0['職員番号'], 'S02')
        ex('数式に見える事案名に \' が付く', r0['事案・訓練名'], "'=水中捜索訓練")
        ex('全角の終了圧を半角で', r0['終了圧(気圧)'], '70')
        ex('監視員', r0['監視員'], '見本 四郎')
        ex('呼吸ガス', r0['呼吸ガス'], '空気')
        ex('浮上開始時刻あり', len(r0['浮上開始時刻']) == 5, True)
        ex('浮上開始なしは空', r1['浮上開始時刻'], '')
        ex('安全停止 無', [r1['安全停止'], r1['浮上停止の時間(分)']], ['無', ''])
        ex('浮上停止 5m・3分', [r0['浮上停止の水深(m)'], r0['浮上停止の時間(分)']], ['5', '3'])
        ex('修正記録', r0['修正記録'].startswith('2回'), True)
        ex('記録IDあり', len(r0['記録ID']) > 8, True)
        ex('記録更新日時は秒まで', len(r0['記録更新日時']), 19)
        ex('事案終了あり', r0['事案終了'] != '', True)

        await pg.goto(URL); await pg.wait_for_timeout(500)
        ex('送ったので未送信の印は出ない', await pg.locator('text=未送信').count(), 0)
        await pg.click('[data-act="go"][data-to="tables"]')
        await pg.screenshot(path=SH + '09_tables.png', full_page=True)
        await pg.click('[data-act="back"]')
        await pg.click('[data-act="go"][data-to="calc"]')
        await pg.screenshot(path=SH + '10_calc.png', full_page=True)
        ex('計算 はみ出しなし', await overflow(pg), False)
        await pg.click('[data-act="back"]')

        # 見本を消す：見本の隊員が入った事案も消える
        await pg.click('[data-act="sheet"][data-sheet="clearSample"]')
        await pg.screenshot(path=SH + '11_clear_sample.png')
        ex('見本の隊員が入った事案を警告', await pg.locator('.sheet .alert').count(), 1)
        await pg.click('[data-act="clear-sample"]')
        n = await pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('diveops.v1')); return [s.members.length, s.incidents.length]; })()")
        ex('見本を消すと隊員も事案も0', n, [0, 0])

        # 保存データが壊れていても消さない
        await pg.evaluate("localStorage.setItem('diveops.v1', '{壊れた')")
        await pg.reload(); await pg.wait_for_timeout(300)
        kept = await pg.evaluate("Object.keys(localStorage).some(k => k.startsWith('diveops.v1.broken.'))")
        ex('壊れた記録は退避する', kept, True)
        ex('読み込めなかったことを知らせる', await pg.locator('.wrap-alert .alert').count() >= 1, True)
        await ctx.close()

        # 暗い表示
        ctx2 = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark', locale='ja-JP', timezone_id='Asia/Tokyo')
        pg2 = await ctx2.new_page()
        pg2.on('pageerror', lambda e: errs.append(str(e)))
        await pg2.goto(URL)
        await pg2.screenshot(path=SH + '12_home_dark.png')
        ex('暗い表示 はみ出しなし', await overflow(pg2), False)
        await b.close()
        ex('画面のエラーなし', errs, [])
    print(f'{ok}件 OK / {ng}件 NG')
    return ng

ng_count = asyncio.run(main())
srv.shutdown()
sys.exit(1 if ng_count else 0)
