# VBAの ImportAppCsv と同じ手順をPythonで再現（列の対応と重複判定の確認用）
import sys, datetime as dt
from openpyxl import load_workbook
src, csvp, out = sys.argv[1], sys.argv[2], sys.argv[3]
def parse_csv(s):
    s = s.replace('﻿', ''); res = []; fields = []; cur = ''; inq = False; i = 0
    while i < len(s):
        ch = s[i]
        if inq:
            if ch == '"':
                if i + 1 < len(s) and s[i + 1] == '"': cur += '"'; i += 1
                else: inq = False
            else: cur += ch
        else:
            if ch == '"': inq = True
            elif ch == ',': fields.append(cur); cur = ''
            elif ch == '\r': pass
            elif ch == '\n': fields.append(cur); cur = ''; res.append(fields); fields = []
            else: cur += ch
        i += 1
    if cur or fields: fields.append(cur); res.append(fields)
    return res
wb = load_workbook(src); wd = wb['潜水記録']; wk = wb['事案']
rows = parse_csv(open(csvp, encoding='utf-8').read())
hdr = {h.strip(): i for i, h in enumerate(rows[0])}
names = ["日付", "職員番号", "区分", "事案・訓練名", "地点", "最大水深(m)", "潜水時間(分)", "前の潜水からの水面休息(分)", "タンク容量(L)", "開始圧(気圧)", "終了圧(気圧)", "水温(℃)", "透視度(m)", "減圧停止", "体調異常", "指揮者", "備考", "事案ID", "本数", "潜降時刻", "浮上時刻", "表の水深(m)", "グループ", "残留窒素時間(分)", "合計窒素時間(分)", "最大潜水時間(分)", "修正最大潜水時間(分)", "判定", "5m減圧停止(分)", "潜水表", "氏名"]
cols = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 37]
kinds = "d n t t t n n n n n n n n t t t t t n h h n t n n n n t n t t".split()
def put(c, s, k):
    if s == '': c.value = None; return
    try:
        if k == 'd': c.value = dt.datetime.strptime(s, '%Y/%m/%d'); return
        if k == 'h': h, m = s.split(':'); c.value = dt.time(int(h), int(m)); return
        if k == 'n': c.value = float(s) if '.' in s else int(s); return
    except Exception: pass
    c.value = s
keys = {f"{wd.cell(r,19).value}|{wd.cell(r,2).value}|{wd.cell(r,20).value}" for r in range(5, 3005) if wd.cell(r, 19).value}
incs = {wk.cell(r, 1).value for r in range(5, 1005) if wk.cell(r, 1).value}
nd = max([r for r in range(5, 3005) if wd.cell(r, 1).value] or [4]) + 1
nk = max([r for r in range(5, 1005) if wk.cell(r, 1).value] or [4]) + 1
added = skipped = inca = 0
for v in (rows[1:] * 2):   # 2回流して、重複が入らないことも確かめる
    if len(v) < len(hdr): continue
    F = lambda n: v[hdr[n]] if n in hdr else ''
    key = f"{F('事案ID')}|{F('職員番号')}|{F('本数')}"
    if key in keys: skipped += 1; continue
    for n, c, k in zip(names, cols, kinds): put(wd.cell(nd, c), F(n), k)
    keys.add(key); added += 1; nd += 1
    if F('事案ID') not in incs:
        for c, n, k in [(1, '事案ID', 't'), (2, '日付', 'd'), (3, '区分', 't'), (4, '事案・訓練名', 't'), (5, '地点', 't'), (6, '指揮者', 't'), (7, '事案開始', 't'), (8, '事案終了', 't'), (9, '水温(℃)', 'n'), (10, '透視度(m)', 'n'), (11, '海況', 't'), (12, '事案備考', 't'), (13, '潜水表', 't')]:
            put(wk.cell(nk, c), F(n), k)
        wk.cell(nk, 16).value = '取り込み試験'; incs.add(F('事案ID')); inca += 1; nk += 1
wb['報告書']['C4'] = rows[1][hdr['事案ID']]
wb.save(out); print('added', added, 'skipped', skipped, 'incidents', inca)
