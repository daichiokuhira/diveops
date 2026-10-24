# VBAの「アプリ用に書き出す」と同じ手順をPythonで再現し、結果をアプリの点検に通す
import json, sys
from openpyxl import load_workbook
ws = load_workbook(sys.argv[1])['潜水表']
def cell(r, c):
    v = ws.cell(r, c).value
    return None if v is None or (isinstance(v, str) and v.strip() == '') else v
def hm(s): h, m = str(s).split(':'); return int(h) * 60 + int(m)
def keys_row(r):
    out = []; c = 2
    while cell(r, c) is not None: out.append(cell(r, c)); c += 1
    return out
def keys_col(r):
    out = []; rr = r + 1
    while cell(rr, 1) is not None: out.append(cell(rr, 1)); rr += 1
    return out
num = lambda v: int(str(v).replace('m', '').replace('終了', '')) if str(v).replace('m','').isdigit() else v
t = {"format": "dive-table/1", "name": cell(3, 2), "version": str(cell(4, 2)), "source": cell(5, 2) or "",
     "verified": cell(6, 2) == "照合済み", "verifiedBy": cell(7, 2) or "", "updatedAt": str(cell(8, 2) or ""),
     "notes": [x for x in str(cell(9, 2) or "").split("／") if x]}
rk = ["minSurfaceInterval", "clearAfterMinutes", "avoidRepetitiveDeeperThan", "safetyStopMinutes", "safetyStopDepth", "maxAscentRate"]
t["rules"] = {k: cell(3 + i, 13) for i, k in enumerate(rk)}
depths = keys_row(12); t["depths"] = depths
t["mdt"] = {str(d): cell(13, 2 + j) for j, d in enumerate(depths)}
G1, DC, RN, AM, SL, SH = 17, 33, 49, 67, 85, 103
letters = keys_row(G1)
t["groups"] = {}; t["deco"] = {}
for i, d in enumerate(keys_col(G1)):
    cuts = []
    for j, g in enumerate(letters):
        v = cell(G1 + 1 + i, 2 + j)
        if v is not None:
            cuts.append([v, g]); s = cell(DC + 1 + i, 2 + j)
            if s is not None: t["deco"][f"{d}-{g}"] = {"limit": v, "stop5": s}
    t["groups"][str(d)] = cuts
for key, top in (("rnt", RN), ("amdt", AM)):
    cols = [num(x) for x in keys_row(top)]; t[key] = {}
    for i, g in enumerate(keys_col(top)):
        row = {str(d): cell(top + 1 + i, 2 + j) for j, d in enumerate(cols) if cell(top + 1 + i, 2 + j) is not None}
        if row: t[key][g] = row
ends = [str(x).replace('終了', '') for x in keys_row(SL)]; news = keys_col(SL)
t["surfaceInterval"] = {}
for j, eg in enumerate(ends):
    rows = []
    for i in range(len(news) - 1, -1, -1):
        lo, hi = cell(SL + 1 + i, 2 + j), cell(SH + 1 + i, 2 + j)
        if lo is not None and hi is not None: rows.append([hm(lo), hm(hi), news[i]])
    if rows: t["surfaceInterval"][eg] = rows
json.dump(t, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
