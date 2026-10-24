"""台帳とマクロを機械的に点検する（Excel・LibreOffice がなくても動く範囲）
- Excel 2019 にない関数（FILTER・XLOOKUP・UNIQUE・SORT・LET・IFS・CONCAT など）を使っていない
- MAXIFS・MINIFS・TEXTJOIN に _xlfn. が付いている
- .bas が cp932 で書け、cp932 にない文字・〜(U+301C)・—(U+2014) がない
- 補助列（MATCH を1回）にした経歴簿・報告書・CSV抽出の式が、補助列を元に戻すと前の式と同じになる
- 潜水記録を参照する範囲が、行の範囲（D_FIRST〜D_LAST）からはみ出していない
"""
import subprocess, sys, json, pathlib, tempfile, re
ROOT = pathlib.Path(__file__).resolve().parents[1]
B = ROOT / 'ledger' / 'build'; B.mkdir(exist_ok=True)
fails = []
def ok(cond, label, detail=''):
    print(('OK  ' if cond else 'NG  ') + label + (f'  {detail}' if detail else ''))
    if not cond: fails.append(label)

subprocess.run(f'node tests/sample_rows.js > "{B/"sample_rows.json"}"', shell=True, check=True, cwd=ROOT)
with tempfile.TemporaryDirectory() as td:
    x = pathlib.Path(td) / 'ledger.xlsx'; m = pathlib.Path(td) / 'm.bas'
    subprocess.run([sys.executable, 'ledger/build_ledger.py', str(x)], check=True, cwd=ROOT, capture_output=True)
    subprocess.run([sys.executable, 'ledger/make_bas.py', str(m)], check=True, cwd=ROOT, capture_output=True)
    from openpyxl import load_workbook
    wb = load_workbook(x)
    G = json.load(open(B / 'grids.json', encoding='utf-8')); L = G['limits']; Y = G['layout']
    fx = []
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith('='): fx.append((ws.title, c.coordinate, c.value))
        for dv in ws.data_validations.dataValidation:
            if dv.formula1: fx.append((ws.title, 'DV ' + str(dv.sqref), dv.formula1))
        for rng in ws.conditional_formatting:
            for rule in rng.rules:
                for f in rule.formula or []: fx.append((ws.title, 'CF ' + str(rng.sqref), f))
    ok(len(fx) > 40000, '数式を集めた', f'{len(fx)}個')
    banned = re.compile(r'(?<![A-Z0-9_.])(FILTER|XLOOKUP|XMATCH|UNIQUE|SORT|SORTBY|SEQUENCE|LET|LAMBDA|IFS|SWITCH|CONCAT|MAXIFS|MINIFS|TEXTJOIN)\s*\(')
    hits = [(s, a, f[:80]) for s, a, f in fx if banned.search(f)]
    ok(not hits, 'Excel 2019 にない関数・_xlfn. の付いていない MAXIFS/MINIFS/TEXTJOIN がない', str(hits[:3]))
    nx = sum(1 for s, a, f in fx if re.search(r'_xlfn\.(MAXIFS|MINIFS|TEXTJOIN)\(', f))
    ok(nx > 0, '_xlfn. 付きの MAXIFS/TEXTJOIN を使っている', f'{nx}個')

    # 潜水記録を参照する範囲
    refs = re.findall(r"'潜水記録'!\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)", ' '.join(f for s, a, f in fx))
    badr = {r for r in refs if (int(r[1]), int(r[3])) != (L['D_FIRST'], L['D_LAST'])}
    ok(refs and not badr, '潜水記録の参照範囲はすべて D_FIRST〜D_LAST', f'{len(refs)}か所 {list(badr)[:3]}')

    # 補助列：helper の MATCH を式に戻すと、前の書き方（MATCH を列ごとに計算）と同じになる
    def restore(sheet, hcol, first, n, src_col_of):
        bad = 0; total = 0
        ws = wb[sheet]
        for r in range(first, first + n):
            h = ws[f'{hcol}{r}'].value
            mm = re.fullmatch(r'=IF\(\$A(\d+)="","",(MATCH\(\$A\d+,[^)]*\))\)', h or '')
            if not mm or int(mm.group(1)) != r: bad += 1; continue
            match = mm.group(2)
            for c in range(2, ws.max_column + 1):
                v = ws.cell(r, c).value
                if not (isinstance(v, str) and f'${hcol}{r}' in v): continue
                total += 1
                if v.count(f'${hcol}{r}') and 'MATCH(' in v: bad += 1
                old = v.replace(f'${hcol}{r}', match)
                # 前の書き方の形：=IF($Ar="","",IF(INDEX(列,MATCH(..))="","",INDEX(列,MATCH(..))))
                if src_col_of and c in src_col_of:
                    exp_ix = f"INDEX('潜水記録'!${src_col_of[c]}${L['D_FIRST']}:${src_col_of[c]}${L['D_LAST']},{match})"
                    if old != f'=IF($A{r}="","",IF({exp_ix}="","",{exp_ix}))': bad += 1
        return bad, total
    from openpyxl.utils import get_column_letter as CL
    k_src = {2: "A", 3: "D", 4: "E", 5: "F", 6: "G", 7: "H", 8: "I", 9: "X", 10: "O", 11: "P", 12: "Q"}
    b1, t1 = restore('経歴簿', 'M', Y['KF'], Y['KN'], k_src)
    ok(b1 == 0 and t1 == 11 * Y['KN'], '経歴簿：MATCH は行ごとに1回、各列は前の式と同じ', f'{t1}個 不一致{b1}')
    r_src = {2: "C", 3: "T", 4: "U", 5: "V", 6: "G", 7: "H", 8: "I", 11: "AC", 12: "P", 13: "R"}
    b2, t2 = restore('報告書', 'N', Y['RF'], Y['RN'], r_src)
    ok(b2 == 0 and t2 == 12 * Y['RN'], '報告書：MATCH は行ごとに1回、各列は前の式と同じ', f'{t2}個 不一致{b2}')
    nx_ = Y['D_LASTCOLN'] - 38 + 1
    esrc = [CL(1 + j) for j in range(31)] + [CL(38 + j) for j in range(nx_)]
    b3, t3 = restore('CSV抽出', CL(Y['ECOLS'] + 1), Y['EF'], Y['EN'], {2 + j: c for j, c in enumerate(esrc)})
    ok(b3 == 0 and t3 == (31 + nx_) * Y['EN'], 'CSV抽出：MATCH は行ごとに1回、各列は前の式と同じ', f'{t3}個 不一致{b3}')

    # 職員番号の照合：隊員マスタを引く MATCH は、すべて文字にそろえた照合列（F）に「&""」で当てる
    mref = [f for s, a, f in fx if "MATCH(" in f and "'隊員マスタ'!$" in f]
    badm = [f[:90] for f in mref if re.search(r"MATCH\([^,]+,'隊員マスタ'!\$A", f) or re.search(r"MATCH\(([^,]+),'隊員マスタ'!\$F", f) and not all(a.endswith('&""') for a in re.findall(r"MATCH\(([^,]+),'隊員マスタ'!\$F", f))]
    ok(mref and not badm, '隊員マスタの照合は文字の職員番号でも数値の職員番号でも引ける形（&"" と照合列）', f'{len(mref)}個 {badm[:2]}')

    # 見出し
    wd = wb['潜水記録']
    ok(wd['O4'].value == '減圧停止(表の判定)' and wd['AL4'].value == '記録ID' and wd['AV4'].value == '修正記録' and wd['AW4'].value == '記録更新日時' and 'アプリの追加記録' in str(wd['AL3'].value),
       '潜水記録の見出し（O列の名前、AL〜AV の追加記録）')
    ok([wd.cell(4, c).value for c in range(32, 38)] == ["年度（自動）", "経歴簿用（自動）", "抽出対象（自動）", "抽出用（自動）", "報告書用（自動）", "取込時の氏名"], '補助列 AF〜AK は動いていない')
    we = wb['CSV抽出']; eh = [we.cell(Y['EH'], c).value for c in range(2, Y['ECOLS'] + 1)]
    ok(eh[2] == '氏名' and eh[-1] == '記録更新日時' and '記録ID' in eh, 'CSV抽出の見出しはアプリのCSVと同じ名前（氏名・記録ID・記録更新日時）', f'{len(eh)}列')
    ok('End(xlUp)' not in re.sub(r"'.*", '', (m.read_bytes().decode('cp932'))) , '.bas のコードに End(xlUp) を使っていない（絞り込み中に行を見落とすため）')
    wr = wb['報告書']; txt = ' '.join(str(c.value) for row in wr.iter_rows() for c in row if isinstance(c.value, str))
    ok('実際の判断は指揮者が行いました' not in txt and '指揮者確認：' in txt and '5年間保存' in txt, '報告書：定型文をやめ、指揮者の確認欄と5年保存')
    use = ' '.join(str(c.value) for row in wb['使い方'].iter_rows() for c in row if c.value)
    ok('VBAProject (潜水管理台帳.xlsm)' in use and '高圧則 第20条の2' in use and '計算の目安' in use, '使い方シートの注意書き')

    # .bas
    raw = m.read_bytes()
    try: text = raw.decode('cp932'); good = text.encode('cp932') == raw
    except UnicodeError: good = False; text = ''
    ok(good, '.bas は cp932 で読み書きできる', f'{len(raw)}バイト')
    ok('〜' not in text and '—' not in text and '\r\n' in text and '\n' not in text.replace('\r\n', ''), '.bas に 〜(U+301C)・—(U+2014) がなく、改行は CRLF')
    subs = re.findall(r'Public Sub (\w+)\(\)(.*?)End Sub', text, re.S)
    noerr = [n for n, b in subs if 'On Error GoTo' not in b]
    ok(subs and not noerr, 'Public Sub すべてに On Error GoTo がある', f'{len(subs)}個 {noerr}')
    ok(not re.search(r'__[A-Z0-9_]+__', text) and f"D_LAST As Long = {L['D_LAST']}" in text, '.bas の上限は grids.json の値')
    # release/ も同じ点検（ビルド済みなら）
    rel = ROOT / 'release' / '潜水管理マクロ.bas'
    if rel.exists():
        rr = rel.read_bytes()
        ok(rr == raw, 'release/ の .bas は今のビルドと同じ', '違うときは npm run build:ledger')

print('静的点検', 'すべて合格' if not fails else f'不合格 {len(fails)}件')
sys.exit(1 if fails else 0)
