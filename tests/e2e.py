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
# 記録は IndexedDB（diveops / kv / state）にある。テストから読み書きする小道具
IDB = """const idb = (mode, fn) => new Promise((res, rej) => { const o = indexedDB.open('diveops'); o.onsuccess = () => { const db = o.result; const t = db.transaction('kv', mode); const out = fn(t.objectStore('kv')); t.oncomplete = () => { db.close(); res(out && out.result); }; t.onerror = () => rej(t.error); }; o.onerror = () => rej(o.error); });
const getS = async () => JSON.parse(await idb('readonly', st => st.get('state')));
const putRaw = v => idb('readwrite', st => { st.put(v, 'state'); });
const keys = () => idb('readonly', st => st.getAllKeys());"""
def js(body): return "(async (arg) => { " + IDB + "\n" + body + " })"
SHIFT = js("""const [path, mins] = arg; const s = await getS(); const inc = s.incidents.find(i => i.status === 'active');
  const set = (o, k) => { o[k] = new Date(new Date(o[k]).getTime() - mins * 60000).toISOString(); };
  const dv = inc.divers[0]; if (path === 'current') { set(dv.current, 'startAt'); } else { const d = dv.dives[0]; set(d, 'startAt'); set(d, 'endAt'); if (d.ascentAt) set(d, 'ascentAt'); }
  await putRaw(JSON.stringify(s));""")

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
        ex('免許の登録がない隊員は選べても知らせない', await pg.locator('text=潜水士免許の登録がありません').count(), 0)
        await pg.click('[data-act="draft-diver"][data-v="S04"]')
        ex('免許の登録がない隊員を選ぶと知らせる', await pg.locator('text=× 潜水士免許の登録がありません：見本 四郎').count(), 1)
        await pg.click('[data-act="draft-diver"][data-v="S04"]')
        await pg.screenshot(path=SH + '02_new.png')
        ex('新しい事案 はみ出しなし', await overflow(pg), False)
        await pg.click('text=記録を始める')

        # 潜降：水深を選ぶまで記録できない
        await pg.click('[data-act="sheet"][data-sheet="down"][data-i="S02"]')
        ex('水深未選択では潜降を記録できない', await pg.locator('[data-act="do-down"]').count(), 0)
        await pg.click('[data-act="down-depth"][data-v="18"]')
        await pg.screenshot(path=SH + '03_down_sheet.png')
        ex('18m 1本目 潜水表 50分', '50分' in await pg.locator('.sheet .kv').inner_text(), True)
        await pg.click('[data-act="do-down"]')
        ex('お知らせが下に出る', await pg.evaluate("document.querySelector('#toast').getBoundingClientRect().top > innerHeight / 2"), True)

        # 上限を超えた表示（55分前に潜った扱い）
        await pg.wait_for_timeout(300); await pg.evaluate(SHIFT, ['current', 55]); await pg.wait_for_timeout(100)
        await pg.reload(); await pg.click('.item >> nth=0'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=SH + '04_board_over.png')
        ex('上限超過を反転表示', await pg.locator('.remain.over').count(), 1)

        # 浮上開始の押し間違いは取り消せる
        await pg.click('[data-act="ascent"][data-i="S02"]')
        await pg.click('[data-act="ascent-undo"][data-i="S02"]')
        ex('浮上開始を取り消すと潜水中に戻る', await pg.locator('.remain.over').count(), 1)
        # 浮上開始 → 水面に着いた
        await pg.click('[data-act="ascent"][data-i="S02"]')
        ex('浮上中の表示', await pg.locator('text=浮上中').count() >= 1, True)
        await pg.click('[data-act="sheet"][data-sheet="up"][data-i="S02"]')
        ex('最大水深は空欄で始まる', await pg.input_value('#u-depth'), '')
        ex('潜水時間は浮上開始まで（55分、切り上げ）', await pg.input_value('#u-adt') in ('55', '56'), True)
        await pg.click('[data-act="do-up"]')
        ex('水深なしでは記録できない', 'S02' in await pg.evaluate(js("return JSON.stringify(await getS());"), None) and await pg.locator('#u-depth').count() == 1, True)
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
        await pg.wait_for_timeout(300); await pg.evaluate(SHIFT, ['dive', 65]); await pg.wait_for_timeout(100)
        await pg.reload(); await pg.click('.item >> nth=0'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=SH + '06_board_rest.png')
        ex('休息中は次の上限を大きく出す', await pg.locator('.diver-info .next').count(), 1)
        ex('ボード はみ出しなし', await overflow(pg), False)

        # 修正（理由が必須）→ 2本目を記録 → 1本目を削除
        await pg.click('[data-act="sheet"][data-sheet="diver"][data-i="S02"]')
        await pg.screenshot(path=SH + '07_diver_detail.png')
        await pg.click('[data-sheet="edit"] >> nth=0')
        await pg.fill('#e-depth', '18')
        await pg.click('[data-act="save-edit"]')
        ex('理由なしでは直せない', await pg.locator('#e-why').count(), 1)
        await pg.fill('#e-why', '深度計の読み違い')
        await pg.click('[data-act="save-edit"]')
        ex('修正1回が残る', await pg.locator('text=修正1回').count(), 1)
        # 潜降を浮上より後にする修正は通さない
        await pg.click('[data-sheet="edit"] >> nth=0')
        await pg.wait_for_timeout(200)
        before = await pg.evaluate(js("return (await getS()).incidents.find(i=>i.status==='active').divers[0].dives[0].startAt;"), None)
        end_hm = await pg.input_value('#e-end')
        h, m = map(int, end_hm.split(':')); m += 20; h = (h + m // 60) % 24; m %= 60
        await pg.fill('#e-start', f'{h:02d}:{m:02d}')
        await pg.fill('#e-why', '試験')
        await pg.click('[data-act="save-edit"]')
        await pg.wait_for_timeout(200)
        after = await pg.evaluate(js("return (await getS()).incidents.find(i=>i.status==='active').divers[0].dives[0].startAt;"), None)
        ex('潜降を浮上の後にする修正は保存しない', after, before)
        await pg.click('[data-act="sheet-close"]')
        await pg.click('[data-act="sheet"][data-sheet="diver"][data-i="S02"]')
        await pg.click('[data-sheet="edit"] >> nth=0')
        await pg.click('[data-act="delete-dive"]')
        ex('理由なしでは削除できない', await pg.locator('.dive-line.is-deleted').count(), 0)
        await pg.fill('#e-why', '別の隊員の記録を誤って入力')
        await pg.click('[data-act="delete-dive"]')
        ex('削除した記録は線で残る', await pg.locator('.dive-line.is-deleted').count(), 1)
        await pg.click('[data-act="sheet-close"]')
        ex('削除した潜水は計算に入っていないと知らせる', await pg.locator('text=削除した潜水は計算に入っていません').count(), 1)

        # 2人目（見本 三郎）も1本潜る
        await pg.click('[data-act="sheet"][data-sheet="down"][data-i="S03"]')
        await pg.click('[data-act="down-depth"][data-v="12"]')
        await pg.click('[data-act="do-down"]')
        await pg.click('[data-act="sheet"][data-sheet="up"][data-i="S03"]')  # 浮上開始を押し忘れて「もう水面にいる」
        ex('浮上開始なしでも浮上画面を開ける', await pg.locator('#u-asc').input_value(), '')
        await pg.fill('#u-depth', '11.5'); await pg.dispatch_event('#u-depth', 'input')
        await pg.click('[data-act="up-safety"][data-v="無"]')
        await pg.click('[data-act="up-cond"][data-v="有"]')
        await pg.fill('#u-note', '右耳の違和感, 浮上後に回復')
        await pg.click('[data-act="do-up"]')
        # あとで減圧が必要な潜水に直し、5mの停止が足りなければ止める（確かめたら元に戻す）
        await pg.click('[data-act="sheet"][data-sheet="diver"][data-i="S03"]')
        await pg.click('[data-sheet="edit"] >> nth=0')
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

        await pg.wait_for_timeout(300); await pg.goto(URL); await pg.wait_for_timeout(500)
        ex('送ったので未送信の印は出ない', await pg.locator('text=未送信').count(), 0)
        await pg.click('[data-act="go"][data-to="tables"]')
        await pg.screenshot(path=SH + '09_tables.png', full_page=True)
        await pg.click('[data-act="back"]')
        await pg.click('[data-act="go"][data-to="calc"]')
        await pg.screenshot(path=SH + '10_calc.png', full_page=True)
        ex('計算 はみ出しなし', await overflow(pg), False)
        await pg.click('[data-act="back"]')

        # ===== v0.4.0：資格・研修、記録・経歴簿、Excel出力、過去の記録の取り込み =====
        await pg.click('[data-act="go"][data-to="settings"]')
        await pg.click('[data-sheet="member"][data-id="S03"]')
        ex('隊員シートに職員番号', await pg.locator('.sheet >> text=職員番号 S03').count(), 1)
        await pg.click('[data-act="q-kind"][data-v="研修"]')
        await pg.click('[data-act="q-pick"][data-v="水難救助研修"]')
        await pg.fill('#q-date', '2024-10-01'); await pg.fill('#q-no', '第25期')
        await pg.click('[data-act="add-qual"]')
        ex('研修を追加できる（未確認）', await pg.locator('.sheet >> text=水難救助研修（未確認）').count(), 1)
        await pg.click('[data-act="q-kind"][data-v="資格"]')
        await pg.click('[data-act="q-pick"][data-v="小型船舶2級"]')
        await pg.fill('#q-date', '2026-01-10'); await pg.fill('#q-exp', '2025-01-01')
        await pg.click('[data-act="add-qual"]')
        ex('期限が取得日より前なら追加しない', await pg.locator('.sheet .qual-row >> text=小型船舶2級').count(), 0)
        await pg.fill('#q-exp', ''); await pg.fill('#q-date', '2099-01-01')
        await pg.click('[data-act="add-qual"]')
        ex('未来の取得日は追加しない', await pg.locator('.sheet .qual-row >> text=小型船舶2級').count(), 0)
        await pg.click('[data-act="q-pick"][data-v=""]')
        await pg.fill('#q-name', '潜水士免許証'); await pg.fill('#q-date', '2025-04-01')
        await pg.click('[data-act="add-qual"]')
        ex('「潜水士免許証」は「潜水士免許」にそろえる', await pg.locator('.sheet .qual-row >> text=潜水士免許（未確認）').count() >= 1, True)
        await pg.fill('#q-who', '担当 一郎')
        await pg.click('[data-act="confirm-qual"] >> nth=0')
        ex('担当者が確かめると確認済み', await pg.locator('.sheet >> text=確認 担当 一郎').count(), 1)
        await pg.click('[data-act="sheet-close"]')
        # 過去の記録（台帳の「CSV抽出」の形。記録IDなしの旧形式も）
        past = ('\ufeff日付,職員番号,氏名,区分,事案・訓練名,地点,最大水深(m),潜水時間(分),事案ID,本数,潜降時刻,浮上時刻,減圧停止,体調異常,指揮者\r\n'
                '2025/05/14,0123,過去 太郎,訓練,定期潜水訓練,平良港,9,33,S-20250514,1,9:20,9:59,無,無,見本 一郎\r\n'
                '2025/05/14,S03,見本 三郎,訓練,定期潜水訓練,平良港,8,31,S-20250514,1,9:22,9:59,無,無,見本 一郎\r\n')
        await pg.set_input_files('#past-file', files=[{'name': 'past.csv', 'mimeType': 'text/csv', 'buffer': past.encode('utf-8')}])
        await pg.wait_for_timeout(300)
        ex('過去の記録を取り込む', await pg.locator('#toast >> text=2本を取り込みました').count(), 1)
        ex('職員番号0123の隊員ができる', await pg.locator('text=職員番号 0123').count() >= 1, True)
        await pg.set_input_files('#past-file', files=[{'name': 'past.csv', 'mimeType': 'text/csv', 'buffer': past.encode('utf-8')}])
        await pg.wait_for_timeout(300)
        ex('同じCSVは二重に入らない', await pg.locator('#toast >> text=すべて取り込み済みです（2本）').count(), 1)
        # このスマホで記録した事案と同じ事案IDの行は、取り込みで混ぜない（判定が変わらないように）
        app_iid = await pg.evaluate(js("return (await getS()).incidents.find(i => !i.sample && !i.imported).id;"), None)
        mix = ('\ufeff日付,職員番号,氏名,区分,事案・訓練名,地点,最大水深(m),潜水時間(分),事案ID,本数,潜降時刻,浮上時刻\r\n'
               f'2026/10/24,S02,見本 二郎,訓練,x,y,18,40,{app_iid},1,,\r\n')
        await pg.set_input_files('#past-file', files=[{'name': 'mix.csv', 'mimeType': 'text/csv', 'buffer': mix.encode('utf-8')}])
        await pg.wait_for_timeout(300)
        ex('アプリで記録した事案には取り込まない', await pg.locator('text=このスマホで記録した事案の行 1行は取り込まず').count(), 1)
        await pg.click('[data-act="back"]')
        # 記録・経歴簿
        await pg.click('[data-act="go"][data-to="records"]')
        await pg.click('[data-act="rec-period"][data-v="custom"]')
        await pg.fill('#rec-from', '2026-12-01'); await pg.fill('#rec-to', '2025-01-01'); await pg.dispatch_event('#rec-to', 'change')
        ex('期間が逆なら出力できない', await pg.locator('[data-act="rec-xlsx"]').is_disabled(), True)
        await pg.click('[data-act="rec-period"][data-v="all"]')
        await pg.click('[data-act="rec-none"]')
        await pg.click('[data-act="rec-member"][data-v="S03"]')
        await pg.click('[data-act="rec-member"][data-v="0123"]')
        await pg.screenshot(path=SH + '13_records.png', full_page=True)
        ex('記録・経歴簿 はみ出しなし', await overflow(pg), False)
        ex('三郎は過去・見本・今回の3本', await pg.locator('text=3本（').count() >= 1, True)
        async with pg.expect_download() as dl2:
            await pg.click('[data-act="rec-xlsx"]')
        xp = await (await dl2.value).path()
        import shutil; shutil.copy(xp, SH + 'records.xlsx')
        from openpyxl import load_workbook
        wbx = load_workbook(SH + 'records.xlsx')
        import datetime as dtm
        ex('Excelのシート', wbx.sheetnames, ['隊員一覧', '経歴簿_見本 三郎', '経歴簿_過去 太郎', '潜水記録（参照用）', '資格・研修'])
        k3 = wbx['経歴簿_見本 三郎']
        ex('経歴簿の見出しは台帳と同じ並び', [k3.cell(10, c).value for c in (1, 2, 4, 6, 7)], ['No', '日付', '事案・訓練名', '最大水深(m)', '潜水時間(分)'])
        ex('経歴簿に3本・古い順・日付は日付型', [k3.cell(11, 2).value, k3.cell(11, 6).value, k3.cell(12, 6).value, k3.cell(13, 6).value, k3.cell(14, 1).value], [dtm.datetime(2025, 5, 14), 8, 15, 11.5, None])
        ex('経歴簿の累計と期間の本数', [k3['B6'].value, k3['C6'].value, k3['B7'].value, k3['C7'].value], ['累計本数', 3, '本数（期間）', 3])
        ex('職員番号は文字のまま', wbx['経歴簿_過去 太郎']['C4'].value, '0123')
        wr = wbx['潜水記録（参照用）']
        ex('潜水記録は48列・見出しは2行目', [wr.max_column, wr.cell(2, 1).value], [48, '日付'])
        ex('潜水記録の数式に見える事案名は文字', [wr.cell(r, 5).data_type for r in range(3, wr.max_row + 1) if str(wr.cell(r, 5).value).startswith('=')], ['s'])
        ex('資格・研修', sorted(r[3] for r in wbx['資格・研修'].iter_rows(min_row=2, values_only=True)), ['水難救助研修', '潜水士免許', '潜水士免許'])
        ex('隊員一覧の免許', [wbx['隊員一覧'].cell(r, 5).value for r in (5, 6)], ['有', '× 無'])
        ex('印刷はA4横・1ページ幅', [wbx['経歴簿_見本 三郎'].page_setup.orientation, wbx['経歴簿_見本 三郎'].page_setup.paperSize], ['landscape', 9])
        # 台帳用CSV
        async with pg.expect_download() as dl3:
            await pg.click('[data-act="rec-csv"]')
        rows3 = list(csv.reader(io.StringIO(open(await (await dl3.value).path(), encoding='utf-8').read().lstrip('\ufeff'))))
        ex('台帳用CSVは48列・このスマホで記録した分だけ（取り込んだ過去の記録は含めない）', [len(rows3[0]), sorted({r[1] for r in rows3[1:]}), any(r[35].startswith('imp-') for r in rows3[1:])], [48, ['S03'], False])
        await pg.click('[data-act="back"]')

        # 保存先の接続が切れても、次の保存で開き直す（iOS で裏に回ったときなど）
        await pg.evaluate("new Promise(r => { const o = indexedDB.open('diveops', 99); o.onupgradeneeded = () => {}; o.onsuccess = () => { o.result.close(); r(); }; o.onblocked = () => r(); })")
        await pg.click('[data-act="go"][data-to="settings"]')
        await pg.click('[data-act="theme"][data-v="dark"]'); await pg.wait_for_timeout(300)
        ex('接続が切れた後も保存できる', [await pg.locator('text=保存できませんでした').count(), await pg.evaluate(js("return (await getS()).settings.theme;"), None)], [0, 'dark'])
        await pg.click('[data-act="theme"][data-v="auto"]'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="back"]')

        # 見本を消す：見本の隊員が入った事案も消える
        await pg.click('[data-act="sheet"][data-sheet="clearSample"]')
        await pg.screenshot(path=SH + '11_clear_sample.png')
        ex('見本の隊員が入った事案を警告', await pg.locator('.sheet .alert').count(), 1)
        await pg.click('[data-act="clear-sample"]')
        await pg.wait_for_timeout(200)
        n = await pg.evaluate(js("const s = await getS(); return [s.members.length, s.incidents.length];"), None)
        ex('見本を消すと見本の隊員と見本が入った事案が消える（取り込んだ実在の隊員は残る）', n, [1, 0])

        # 保存データが壊れていても消さない
        await pg.evaluate(js("await putRaw('{壊れた');"), None)
        await pg.reload(); await pg.wait_for_timeout(300)
        kept = await pg.evaluate(js("return (await keys()).some(k => String(k).startsWith('broken.'));"), None)
        ex('壊れた記録は退避する', kept, True)
        ex('読み込めなかったことを知らせる', await pg.locator('.wrap-alert .alert').count() >= 1, True)
        await ctx.close()

        # 暗い表示
        ctx2 = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark', locale='ja-JP', timezone_id='Asia/Tokyo')
        pg2 = await ctx2.new_page()
        pg2.on('pageerror', lambda e: errs.append(str(e)))
        # v0.3.0 までの記録（localStorage）は、IndexedDB へ引き継がれる
        await pg2.add_init_script("if (!localStorage.getItem('diveops.v1.seeded')) { localStorage.setItem('diveops.v1.seeded', '1'); localStorage.setItem('diveops.v1', JSON.stringify({ v: 1, members: [{ id: '2001', name: '旧版 花子' }], settings: { tank: 10, sac: 20, reserve: 50, startP: 200, theme: 'auto' }, tables: { activeId: 'x', list: [] }, incidents: [] })); }")
        await pg2.goto(URL)
        await pg2.wait_for_timeout(500)
        ex('旧版の記録を引き継ぐ', await pg2.locator('text=これまでの事案').count(), 1)
        mig = await pg2.evaluate(js("return [(await getS()).members.map(m => m.name), localStorage.getItem('diveops.v1') === null, !!localStorage.getItem('diveops.v1.before-idb')];"), None)
        ex('IndexedDB に移り、元は退避', mig, [['旧版 花子'], True, True])
        # 両方に記録があるときは新しい方（IndexedDB が使えなかった回に localStorage へ保存した、など）
        await pg2.evaluate("localStorage.setItem('diveops.v1', JSON.stringify({ v: 1, savedAt: '2999-01-01T00:00:00Z', members: [{ id: '2002', name: '新しい 次郎' }], settings: { tank: 10, sac: 20, reserve: 50, startP: 200, theme: 'auto' }, tables: { activeId: 'x', list: [] }, incidents: [] }))")
        await pg2.reload(); await pg2.wait_for_timeout(500)
        ex('新しい方の記録を読む', await pg2.evaluate(js("return (await getS()).members.map(m => m.name);"), None), ['新しい 次郎'])
        before_keys = await pg2.evaluate(js("return (await keys()).map(String).sort();"), None)
        ex('古い方は消さずに退避', any(k.startswith('state.before-ls.') for k in before_keys), True)
        # 保存先が応答しない起動：見本で始めず、何も保存しない
        pg3 = await ctx2.new_page()
        await pg3.add_init_script("indexedDB.open = () => ({})")
        await pg3.goto(URL); await pg3.wait_for_timeout(9000)
        ex('読み込めないときは止めて知らせる', await pg3.locator('text=記録を読み込めませんでした').count(), 1)
        await pg3.close()
        ex('そのとき記録は上書きされない', await pg2.evaluate(js("return (await getS()).members.map(m => m.name);"), None), ['新しい 次郎'])
        await pg2.screenshot(path=SH + '12_home_dark.png')
        ex('暗い表示 はみ出しなし', await overflow(pg2), False)
        await b.close()
        ex('画面のエラーなし', errs, [])
    print(f'{ok}件 OK / {ng}件 NG')
    return ng

ng_count = asyncio.run(main())
srv.shutdown()
sys.exit(1 if ng_count else 0)
