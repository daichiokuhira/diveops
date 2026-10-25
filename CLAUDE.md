# diveops（潜水現場記録・潜水管理台帳）

宮古島市消防本部 潜水隊のための2つの道具を、1つのリポジトリで管理しています。

作業を始める前に HANDOFF.md（経緯・決まったこと・次にやること）を読んでください。

- 現場アプリ（app/ → docs/）：事案・潜水員の潜降と浮上・NAUI潜水表による計算を記録し、隊の全員で共有する。オフラインで動くPWA（電波がない間は端末に貯め、つながったら送る）。GitHub Pages（main ブランチの /docs）で公開。
- 共有の保存先（server/）：Cloudflare Workers ＋ D1。隊共通パスコード＋職員番号でログイン。app/config.json の apiBase が空なら共有せず、端末だけで動く（v0.4 までと同じ）。
- 潜水管理台帳（ledger/ → release/）：署のパソコンのExcel 2019で、隊員・資格・潜水記録・事案を管理し、経歴簿と報告書をPDFで出す。

## 構成

| 場所 | 中身 |
|---|---|
| app/src/engine.js | 計算エンジン。潜水表の数値には依存せず、表をデータとして受け取る |
| app/src/app.js, app.css | 画面と保存（IndexedDB。v0.3.0 までの localStorage から自動で移す）。記録・経歴簿と Excel 出力、共有（同期）もここ |
| server/src/index.js | 共有 API（ログイン・同期・権限）。D1 の形は server/schema.sql |
| server/src/schema.js | 共有する文書の形（欄・型・長さ）。サーバーとアプリで同じものを使う（build.py が export を外してアプリに入れる） |
| app/vendor/exceljs.min.js | Excel 出力の部品（ExcelJS 4.4.0、MIT）。出力するときだけ読み込む。Service Worker でオフライン用に保存 |
| app/tables/naui-2022.json | 内蔵の潜水表（NAUI 2022年版。2026-10-24 隊内2名で照合済み） |
| app/build.py | 1枚の index.html にまとめて docs/ へ出力 |
| ledger/build_ledger.py | 台帳（.xlsx）を作る |
| ledger/make_bas.py | 台帳のマクロ（.bas、Shift_JIS）を作る |
| ledger/export_port.py, import_port.py | マクロと同じ手順のPython版（テスト用） |
| tests/ | 計算テスト、台帳の往復テスト、画面のe2e |
| docs/ | 公開される現場アプリ（ビルド結果。手で直さない） |
| release/ | 配布する台帳とマクロ（ビルド結果。手で直さない） |

## コマンド

- `npm run test:server` … 共有 API の試験（手元で wrangler dev を起動）
- `npm run test:e2e:cloud` … 共有を使う画面テスト（3台の端末で同時に操作）

- `npm run build` … アプリと台帳を作り直す
- `npm test` … 計算テストと台帳の往復テスト
- `npm run test:e2e` … スマホ幅での画面テスト（Playwright）

## 守ること

### 安全
- 潜水表の数値を変えるときは、隊内2名の照合が済んでから。変えたら `npm test` を必ず通す。
- engine.js を変えたら、tests/naui2022.js にテストを足す。判定が甘くなる方向の変更は、理由を必ず説明する。
- アプリの判定は「計算の目安」。画面と報告書から、この位置づけを消さない。
- 潜水表で上限を決められないときに、空気の時間など別の値で埋めない。入力が数字として読めないときは判定を出さない。

### アプリと台帳の約束（片方だけ変えない）
- アプリのCSVの列名（app.js の buildCSV）と、台帳マクロの取り込み（make_bas.py の names/cols）は対になっている。列を増やす・名前を変えるときは両方を直す。
- 台帳「潜水表」シートの配置（build_ledger.py の grid）と、マクロの書き出し・export_port.py は対になっている。
- 取り込みの照合は「記録ID」（潜水1本ごとの一意な値）。記録IDのない旧CSVは「事案ID＋職員番号＋本数」。削除した潜水は消さずに「状態=削除」で送り、本数は振り直さない。
- 取り込みの列の対応・行数の上限は ledger/build/grids.json に一元化している（build_ledger.py が書き、make_bas.py・import_port.py が読む）。

### Excel 出力（アプリ）
- 「経歴簿」シートの並びは、台帳（build_ledger.py）の経歴簿と同じにする。「潜水記録」シートは CSV_HEAD と同じ列（csvValues を共通で使う）。
- 正本は署の台帳（台帳用CSVを取り込んだもの・PDF）として保存する、という位置づけを説明から消さない。

### 共有（同期）の約束
- 記録は文書（member / qual / incident / diver / dive）ごとに、変更した日時の新しい方を正とする。サーバーは「新しい方だけ書く」を1つの処理で行う。
- 文書の欄を増やすときは、schema.js にも足す（足さないと、サーバーと他の端末で捨てられる）。
- 画面では、潜水員は職員番号、潜水は記録IDで指す（並び順はほかの端末の変更で変わる）。
- 潜水中・潜水のある潜水員と、潜水のある事案は消させない（サーバーの guardDelete）。電波のない間の潜降は「外す」より優先する。
- 権限の検査はサーバーで行う（画面の出し分けは補助）。届いた値は schema.js で形を確かめてから使い、画面に出す値は esc() を通す。
- 秘密の値（TEAM_PASSCODE・SECRET_KEY）はリポジトリに入れない（wrangler secret / server/.dev.vars）。

### Excel 2019 の制約
- FILTER・XLOOKUP・UNIQUE・SORT は使わない（2019にない）。INDEX/MATCH と補助列で作る。
- MAXIFS・TEXTJOIN は `_xlfn.` を付けて書く。
- .bas は Shift_JIS（cp932）で保存。cp932 にない文字（〜 U+301C、— U+2014 など）を使わない。

### 個人情報
- 実際の隊員名・記録・CSV・台帳の実データをコミットしない（.gitignore 済み）。見本は「見本 一郎」などの架空の名前だけ。
- リポジトリが公開でも問題ないのは、コードと見本データだけだから。

### デザイン
- アプリ：紺（#1a2b4c）と黄（#ffd400）。依頼者の指定（消防の制服の色）。明るい表示は白地に紺、暗い表示は紺地（#16243f）に白。黄は選択中・見出しの下線と、暗い表示の主ボタン。白地の文字に黄を使わない。
- 台帳：モノクロ。注意は太字と「×」で示す。
- 絵文字は使わない。アイコンは Lucide。border-left のアクセントカードは使わない。
- 文言は現場の言葉で短く。ボタンは押した結果が分かる言葉にする。

## バージョン
- package.json の version が正。アプリの設定画面と、オフライン用キャッシュ名に反映される。
- 変更したら CHANGELOG.md に1行足す。潜水表の版はアプリのバージョンと別に、表の JSON の version で管理する。
