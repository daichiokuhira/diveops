import json, datetime, pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parents[1]
import os
src = ROOT/'app'/'src'; tables = ROOT/'app'/'tables'; dist = pathlib.Path(os.environ.get('DIVEOPS_DIST') or ROOT/'docs')  # 試験用に出力先を変えられる
dist.mkdir(exist_ok=True)
VERSION = json.loads((ROOT/'package.json').read_text())['version']
css = (src/'app.css').read_text()
# 共有 API の場所（app/config.json。無ければ共有しない）。環境変数 DIVEOPS_API_BASE で上書きできる（試験用）
import os
cfg = ROOT/'app'/'config.json'
API_BASE = os.environ.get('DIVEOPS_API_BASE', json.loads(cfg.read_text()).get('apiBase', '') if cfg.exists() else '')
import re as _re
schema = _re.sub(r'(?m)^export ', '', (ROOT/'server'/'src'/'schema.js').read_text())  # サーバーと同じ文書の形
js = (src/'icons.js').read_text() + '\n' + schema + '\n' + (src/'engine.js').read_text() + '\n' + (src/'app.js').read_text().replace('__APP_VERSION__', VERSION).replace("'__API_BASE__'.startsWith('__') ? '' : '__API_BASE__'", json.dumps(API_BASE))
table = json.dumps(json.loads((tables/'naui-2022.json').read_text()), ensure_ascii=False)
build = VERSION
body = f'''<div id="app"></div>
<div id="sheet" hidden></div>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<noscript>このアプリを使うにはJavaScriptを有効にしてください。</noscript>
<script id="builtin-table" type="application/json">{table}</script>
<script>
{js}
</script>'''
head_common = '''<title>潜水現場記録</title>
<meta name="claude:viewport-fit-sides" content="cover">'''
full = f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head_common}
<meta name="theme-color" content="#1a2b4c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="潜水記録">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>
:root {{ padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }}
{css}
</style>
</head>
<body>
{body}
</body>
</html>
'''
preview = f'''{head_common}
<style>
{css}
</style>
{body}
'''
(dist/'index.html').write_text(full)
shutil.copy(src/'manifest.webmanifest', dist/'manifest.webmanifest')
(dist/'sw.js').write_text((src/'sw.js').read_text().replace('__BUILD__', build))
(dist/'潜水表_NAUI2022.json').write_text(json.dumps(json.loads((tables/'naui-2022.json').read_text()), ensure_ascii=False, indent=1))
(ROOT/'app'/'preview').mkdir(exist_ok=True)
(ROOT/'app'/'preview'/'diveops.html').write_text(preview)
shutil.copy(ROOT/'app'/'設置と使い方.md', dist/'設置と使い方.md')
# Excel 出力の部品（MIT）。index.html とは分け、出力するときに読み込む
shutil.copy(ROOT/'app'/'vendor'/'exceljs.min.js', dist/'exceljs.min.js')
shutil.copy(ROOT/'app'/'vendor'/'exceljs.LICENSE.txt', dist/'exceljs.LICENSE.txt')
for n in ('icon-192.png', 'icon-512.png', 'apple-touch-icon.png'):
    if (src/n).exists(): shutil.copy(src/n, dist/n)
print('built', build, len(full)//1024, 'KB')
