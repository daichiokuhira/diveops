# diveops（潜水現場記録・潜水管理台帳）

宮古島市消防本部 潜水隊のための2つの道具を、1つのリポジトリで管理しています。

- 現場アプリ（app/ → docs/）：現場用スマホで、事案・潜水員の潜降と浮上・NAUI潜水表による計算を記録し、CSVをメールで署へ送る。オフラインで動くPWA。GitHub Pages（main ブランチの /docs）で公開。
- 潜水管理台帳（ledger/ → release/）：署のパソコンのExcel 2019で、隊員・資格・潜水記録・事案を管理し、経歴簿と報告書をPDFで出す。

## 構成

| 場所 | 中身 |
|---|---|
| app/src/engine.js | 計算エンジン。潜水表の数値には依存せず、表をデータとして受け取る |
| app/src/app.js, app.css | 画面と保存（localStorage） |
| app/tables/naui-2022.json | 内蔵の潜水表（NAUI 2022年版。2026-10-24 隊内2名で照合済み） |
| app/build.py | 1枚の index.html にまとめて docs/ へ出力 |
| ledger/build_ledger.py | 台帳（.xlsx）を作る |
| ledger/make_bas.py | 台帳のマクロ（.bas、Shift_JIS）を作る |
| ledger/export_port.py, import_port.py | マクロと同じ手順のPython版（テスト用） |
| tests/ | 計算テスト、台帳の往復テスト、画面のe2e |
| docs/ | 公開される現場アプリ（ビルド結果。手で直さない） |
| release/ | 配布する台帳とマクロ（ビルド結果。手で直さない） |

## コマンド

- `npm run build` … アプリと台帳を作り直す
- `npm test` … 計算テストと台帳の往復テスト
- `npm run test:e2e` … スマホ幅での画面テスト（Playwright）

## 守ること

### 安全
- 潜水表の数値を変えるときは、隊内2名の照合が済んでから。変えたら `npm test` を必ず通す。
- engine.js を変えたら、tests/naui2022.js にテストを足す。判定が甘くなる方向の変更は、理由を必ず説明する。
- アプリの判定は「計算の目安」。画面と報告書から、この位置づけを消さない。

### アプリと台帳の約束（片方だけ変えない）
- アプリのCSVの列名（app.js の buildCSV）と、台帳マクロの取り込み（make_bas.py の names/cols）は対になっている。列を増やす・名前を変えるときは両方を直す。
- 台帳「潜水表」シートの配置（build_ledger.py の grid）と、マクロの書き出し・export_port.py は対になっている。
- 重複判定は「事案ID＋職員番号＋本数」。

### Excel 2019 の制約
- FILTER・XLOOKUP・UNIQUE・SORT は使わない（2019にない）。INDEX/MATCH と補助列で作る。
- MAXIFS・TEXTJOIN は `_xlfn.` を付けて書く。
- .bas は Shift_JIS（cp932）で保存。cp932 にない文字（〜 U+301C、— U+2014 など）を使わない。

### 個人情報
- 実際の隊員名・記録・CSV・台帳の実データをコミットしない（.gitignore 済み）。見本は「見本 一郎」などの架空の名前だけ。
- リポジトリが公開でも問題ないのは、コードと見本データだけだから。

### デザイン
- アプリ：白・黒・差し色1色（黄 #ffd400）。黄は選択中と見出しの下線だけ。白地の文字に黄を使わない。
- 台帳：モノクロ。注意は太字と「×」で示す。
- 絵文字は使わない。アイコンは Lucide。border-left のアクセントカードは使わない。
- 文言は現場の言葉で短く。ボタンは押した結果が分かる言葉にする。

## バージョン
- package.json の version が正。アプリの設定画面と、オフライン用キャッシュ名に反映される。
- 変更したら CHANGELOG.md に1行足す。潜水表の版はアプリのバージョンと別に、表の JSON の version で管理する。
