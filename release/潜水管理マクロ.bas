Attribute VB_Name = "DiveTools"
Option Explicit

' =============================================================
' 潜水管理台帳 第2版 マクロ（取り込み・書き出し・整列）
' 一覧と集計は数式で動くため、マクロを無効にしても閲覧・入力はできます。
' 対象：Excel 2019（Windows）
' このファイルは ledger/make_bas.py で作っています。手で直さず、make_bas.py を直してください。
' =============================================================

Private Const OUT_DIR As String = "出力"
' 行の範囲（build_ledger.py の値。grids.json 経由）
Private Const D_FIRST As Long = 5
Private Const D_LAST As Long = 3004
Private Const K_FIRST As Long = 5
Private Const K_LAST As Long = 1004
Private Const M_FIRST As Long = 5
Private Const M_LAST As Long = 204
Private Const D_LASTCOL As String = "AW"
Private Const C_RECID As Long = 38
Private Const C_TS As Long = 49
Private Const C_NOTE As Long = 48
' 経歴簿・報告書・CSV抽出・隊員一覧
Private Const KH As Long = 9
Private Const KN As Long = 300
Private Const RN As Long = 30
Private Const R_LASTCOL As String = "M"
Private Const R_LAST As Long = 49
Private Const EH As Long = 10
Private Const EN As Long = 500
Private Const ECOLS As Long = 44
Private Const V_FIRST As Long = 8
Private Const V_LAST As Long = 207
' 潜水表シートの各表の見出し行
Private Const T_MDT As Long = 12
Private Const T_G1 As Long = 17
Private Const T_DECO As Long = 33
Private Const T_RNT As Long = 49
Private Const T_AMDT As Long = 67
Private Const T_SILO As Long = 85
Private Const T_SIHI As Long = 103

' CSVの見出し → 潜水記録の列、種類（d=日付 n=数値 t=文字 h=時刻）
Private Const N_MAP As Long = 43
Private MapName(0 To 42) As String
Private MapCol(0 To 42) As Long
Private MapKind(0 To 42) As String
' CSVの見出し → 事案の列
Private Const N_INC As Long = 13
Private IncName(0 To 12) As String
Private IncCol(0 To 12) As Long
Private IncKind(0 To 12) As String

Private Sub InitMap()
    MapName(0) = "日付": MapCol(0) = 1: MapKind(0) = "d"
    MapName(1) = "職員番号": MapCol(1) = 2: MapKind(1) = "t"
    MapName(2) = "区分": MapCol(2) = 4: MapKind(2) = "t"
    MapName(3) = "事案・訓練名": MapCol(3) = 5: MapKind(3) = "t"
    MapName(4) = "地点": MapCol(4) = 6: MapKind(4) = "t"
    MapName(5) = "最大水深(m)": MapCol(5) = 7: MapKind(5) = "n"
    MapName(6) = "潜水時間(分)": MapCol(6) = 8: MapKind(6) = "n"
    MapName(7) = "前の潜水からの水面休息(分)": MapCol(7) = 9: MapKind(7) = "n"
    MapName(8) = "タンク容量(L)": MapCol(8) = 10: MapKind(8) = "n"
    MapName(9) = "開始圧(気圧)": MapCol(9) = 11: MapKind(9) = "n"
    MapName(10) = "終了圧(気圧)": MapCol(10) = 12: MapKind(10) = "n"
    MapName(11) = "水温(℃)": MapCol(11) = 13: MapKind(11) = "n"
    MapName(12) = "透視度(m)": MapCol(12) = 14: MapKind(12) = "n"
    MapName(13) = "減圧停止(表の判定)": MapCol(13) = 15: MapKind(13) = "t"
    MapName(14) = "体調異常": MapCol(14) = 16: MapKind(14) = "t"
    MapName(15) = "指揮者": MapCol(15) = 17: MapKind(15) = "t"
    MapName(16) = "備考": MapCol(16) = 18: MapKind(16) = "t"
    MapName(17) = "事案ID": MapCol(17) = 19: MapKind(17) = "t"
    MapName(18) = "本数": MapCol(18) = 20: MapKind(18) = "n"
    MapName(19) = "潜降時刻": MapCol(19) = 21: MapKind(19) = "h"
    MapName(20) = "浮上時刻": MapCol(20) = 22: MapKind(20) = "h"
    MapName(21) = "表の水深(m)": MapCol(21) = 23: MapKind(21) = "n"
    MapName(22) = "グループ": MapCol(22) = 24: MapKind(22) = "t"
    MapName(23) = "残留窒素時間(分)": MapCol(23) = 25: MapKind(23) = "n"
    MapName(24) = "合計窒素時間(分)": MapCol(24) = 26: MapKind(24) = "n"
    MapName(25) = "最大潜水時間(分)": MapCol(25) = 27: MapKind(25) = "n"
    MapName(26) = "修正最大潜水時間(分)": MapCol(26) = 28: MapKind(26) = "n"
    MapName(27) = "判定": MapCol(27) = 29: MapKind(27) = "t"
    MapName(28) = "5m減圧停止(分)": MapCol(28) = 30: MapKind(28) = "n"
    MapName(29) = "潜水表": MapCol(29) = 31: MapKind(29) = "t"
    MapName(30) = "氏名": MapCol(30) = 37: MapKind(30) = "t"
    MapName(31) = "記録ID": MapCol(31) = 38: MapKind(31) = "t"
    MapName(32) = "予定水深(m)": MapCol(32) = 39: MapKind(32) = "n"
    MapName(33) = "浮上開始時刻": MapCol(33) = 40: MapKind(33) = "h"
    MapName(34) = "安全停止": MapCol(34) = 41: MapKind(34) = "t"
    MapName(35) = "浮上停止の水深(m)": MapCol(35) = 42: MapKind(35) = "n"
    MapName(36) = "浮上停止の時間(分)": MapCol(36) = 43: MapKind(36) = "n"
    MapName(37) = "平均浮上速度(m/分)": MapCol(37) = 44: MapKind(37) = "n"
    MapName(38) = "呼吸ガス": MapCol(38) = 45: MapKind(38) = "t"
    MapName(39) = "監視員": MapCol(39) = 46: MapKind(39) = "t"
    MapName(40) = "1本目扱い": MapCol(40) = 47: MapKind(40) = "t"
    MapName(41) = "修正記録": MapCol(41) = 48: MapKind(41) = "t"
    MapName(42) = "記録更新日時": MapCol(42) = 49: MapKind(42) = "t"
    IncName(0) = "事案ID": IncCol(0) = 1: IncKind(0) = "t"
    IncName(1) = "日付": IncCol(1) = 2: IncKind(1) = "d"
    IncName(2) = "区分": IncCol(2) = 3: IncKind(2) = "t"
    IncName(3) = "事案・訓練名": IncCol(3) = 4: IncKind(3) = "t"
    IncName(4) = "地点": IncCol(4) = 5: IncKind(4) = "t"
    IncName(5) = "指揮者": IncCol(5) = 6: IncKind(5) = "t"
    IncName(6) = "事案開始": IncCol(6) = 7: IncKind(6) = "t"
    IncName(7) = "事案終了": IncCol(7) = 8: IncKind(7) = "t"
    IncName(8) = "水温(℃)": IncCol(8) = 9: IncKind(8) = "n"
    IncName(9) = "透視度(m)": IncCol(9) = 10: IncKind(9) = "n"
    IncName(10) = "海況": IncCol(10) = 11: IncKind(10) = "t"
    IncName(11) = "事案備考": IncCol(11) = 12: IncKind(11) = "t"
    IncName(12) = "潜水表": IncCol(12) = 13: IncKind(12) = "t"
End Sub

' =============================================================
' アプリのCSVを取り込む
'   照合：記録IDがあれば記録IDで。記録IDのない古いCSVは 事案ID＋職員番号＋本数 で。
'   登録済みのとき、CSVの記録更新日時が台帳より新しいときだけ、上書き（更新）・削除する。
'   同じか古いときは「取り込み済み」（署で手で直した内容を、同じCSVの取り込み直しで戻さない）。
'   台帳の記録更新日時が空（古い形式で入れた行）のときは、中身を比べて違えば上書き。
'   未登録 → 追加
'   状態=削除 → その行の入力列を消し、記録IDと記録更新日時だけ残す（古いCSVで戻らない）。
'               未登録でも記録IDがあれば、同じ形の削除の印の行を作る
' =============================================================
Public Sub ImportAppCsv()
    Dim files As Variant, i As Long, note As String, notes As String, msg As String
    Dim added As Long, updated As Long, deleted As Long, skipped As Long, incAdded As Long, incUpdated As Long, bad As Long
    Dim en As Long, ed As String
    On Error GoTo Fail
    files = Application.GetOpenFilename("CSVファイル (*.csv),*.csv", , "アプリから届いたCSVを選ぶ（複数選べます）", , True)
    If Not IsArray(files) Then Exit Sub
    InitMap
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    For i = LBound(files) To UBound(files)
        note = ImportOne(CStr(files(i)), added, updated, deleted, skipped, incAdded, incUpdated, bad)
        If note <> "" Then notes = notes & vbCrLf & note
    Next i
Cleanup:
    On Error Resume Next
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    If en <> 0 Then
        MsgBox "取り込みの途中で止まりました。" & vbCrLf & "ここまでに 追加 " & added & "件・更新 " & updated & "件・削除 " & deleted & "件 を反映しています。" & vbCrLf & vbCrLf & ErrText(en, ed, "import", ""), vbExclamation
        Exit Sub
    End If
    msg = "取り込みが終わりました。" & vbCrLf & "潜水記録：追加 " & added & "件"
    If updated > 0 Then msg = msg & "／更新 " & updated & "件（CSVの方が新しい記録を上書き）"
    If deleted > 0 Then msg = msg & "／削除 " & deleted & "件（アプリで削除した記録の行を空けた）"
    If skipped > 0 Then msg = msg & vbCrLf & "取り込み済み：" & skipped & "件（台帳と同じか、台帳の方が新しいため変えず）"
    msg = msg & vbCrLf & "事案：追加 " & incAdded & "件"
    If incUpdated > 0 Then msg = msg & "／事案更新 " & incUpdated & "件（CSVの方が新しい事案の内容で上書き）"
    If bad > 0 Then msg = msg & vbCrLf & "読めなかった行：" & bad & "件"
    If notes <> "" Then msg = msg & vbCrLf & vbCrLf & "取り込まなかったファイル：" & notes
    If notes = "" Then
        MsgBox msg, vbInformation
    Else
        MsgBox msg, vbExclamation
    End If
    Exit Sub
Fail:
    en = Err.Number: ed = Err.Description
    If en = 0 Then en = -1
    Resume Cleanup
End Sub

' 1つのファイルを取り込む。取り込まなかったときは理由を返す
Private Function ImportOne(ByVal path As String, ByRef added As Long, ByRef updated As Long, ByRef deleted As Long, ByRef skipped As Long, ByRef incAdded As Long, ByRef incUpdated As Long, ByRef bad As Long) As String
    Dim rows As Collection, hdr As Object, v As Variant
    Dim r As Long, k As Long, ncol As Long, found As Long
    Set rows = ParseCsv(ReadText(path, "UTF-8"))
    Set hdr = HeaderMap(rows)
    If Not IsAppHeader(hdr) Then
        ' Excelで開いて上書き保存すると Shift_JIS になる。読み直して見分ける（取り込みはしない）
        If IsAppHeader(HeaderMap(ParseCsv(ReadText(path, "Shift_JIS")))) Then
            ImportOne = FileName(path) & "：Excelで保存し直したCSVです。メールで届いた元のファイルを使ってください。"
        Else
            ImportOne = FileName(path) & "：アプリのCSVではありません（見出しに 事案ID・職員番号・本数 がありません）。"
        End If
        Exit Function
    End If
    ncol = UBound(rows(1)) - LBound(rows(1)) + 1

    Dim wd As Worksheet, wk As Worksheet
    Set wd = ThisWorkbook.Worksheets("潜水記録")
    Set wk = ThisWorkbook.Worksheets("事案")
    Dim ids As Object, keysAll As Object, keysNoId As Object, incs As Object, incDone As Object
    Set ids = CreateObject("Scripting.Dictionary")
    Set keysAll = CreateObject("Scripting.Dictionary")
    Set keysNoId = CreateObject("Scripting.Dictionary")
    Set incs = CreateObject("Scripting.Dictionary")
    Set incDone = CreateObject("Scripting.Dictionary")   ' このファイルで追加・更新した事案
    For r = D_FIRST To D_LAST
        Reindex wd, r, ids, keysAll, keysNoId
    Next r
    For r = K_FIRST To K_LAST
        If CellStr(wk.Cells(r, 1)) <> "" Then
            If Not incs.Exists(CellStr(wk.Cells(r, 1))) Then incs(CellStr(wk.Cells(r, 1))) = r
        End If
    Next r

    Dim nextD As Long, nextK As Long, key As String, iid As String, rid As String, st As String, ts As String, prior As String, live As Boolean, changed As Boolean
    nextD = NextEmptyRow(wd, D_FIRST, D_LAST, Array(1, 2, 19, 38))
    nextK = NextEmptyRow(wk, K_FIRST, K_LAST, Array(1, 2))
    For r = 2 To rows.Count
        v = rows(r)
        If UBound(v) - LBound(v) + 1 < ncol Then
            If Trim$(Join(v, "")) <> "" Then bad = bad + 1
        Else
            iid = Fld(v, hdr, "事案ID", "t")
            rid = Fld(v, hdr, "記録ID", "t")
            st = Fld(v, hdr, "状態", "t")
            ts = Fld(v, hdr, "記録更新日時", "t")
            key = iid & "|" & Fld(v, hdr, "職員番号", "t") & "|" & Fld(v, hdr, "本数", "t")
            found = FindRow(rid, key, ids, keysAll, keysNoId)
            live = False
            changed = False
            If found > 0 And Not IsNewer(ts, CellStr(wd.Cells(found, C_TS))) Then
                ' 台帳の方が新しいか同じ。何も変えない（削除の印の行なら、事案も足さない）
                skipped = skipped + 1
                live = (CellStr(wd.Cells(found, 19)) <> "")
            ElseIf st = "削除" Then
                If found > 0 Then
                    prior = CellStr(wd.Cells(found, C_RECID))
                    Unindex wd, found, ids, keysAll, keysNoId
                    If rid = "" Then rid = prior
                    ClearRow wd, found, rid, ts
                    Reindex wd, found, ids, keysAll, keysNoId
                    deleted = deleted + 1
                ElseIf rid <> "" Then
                    ' まだ台帳にない記録の削除：削除の印の行を作る（後から古いCSVを取り込んでも追加しない）
                    If nextD = 0 Then Err.Raise vbObjectError + 2, , "潜水記録の上限（" & (D_LAST - D_FIRST + 1) & "件）に達しました。新しい台帳に分けてください。"
                    ClearRow wd, nextD, rid, ts
                    Reindex wd, nextD, ids, keysAll, keysNoId
                    deleted = deleted + 1
                    nextD = IIf(nextD >= D_LAST, 0, nextD + 1)
                End If
            ElseIf found > 0 Then
                live = True
                If RowSame(wd, found, v, hdr) Then
                    skipped = skipped + 1
                Else
                    Unindex wd, found, ids, keysAll, keysNoId
                    WriteRow wd, found, v, hdr, False
                    Reindex wd, found, ids, keysAll, keysNoId
                    updated = updated + 1
                    changed = True
                End If
            Else
                If nextD = 0 Then Err.Raise vbObjectError + 2, , "潜水記録の上限（" & (D_LAST - D_FIRST + 1) & "件）に達しました。新しい台帳に分けてください。"
                WriteRow wd, nextD, v, hdr, True
                Reindex wd, nextD, ids, keysAll, keysNoId
                added = added + 1
                live = True
                changed = True
                nextD = IIf(nextD >= D_LAST, 0, nextD + 1)
            End If
            If live And iid <> "" Then
                If incs.Exists(iid) And changed And Not incDone.Exists(iid) Then
                    ' 潜水を追加・更新した（CSVの方が新しい）事案は、事案の内容もCSVの値で上書きする。事案IDと取り込み日時は残す
                    For k = 0 To N_INC - 1
                        If IncCol(k) <> 1 And hdr.Exists(IncName(k)) Then PutVal wk.Cells(incs(iid), IncCol(k)), Fld(v, hdr, IncName(k), IncKind(k)), IncKind(k)
                    Next k
                    incDone(iid) = True
                    incUpdated = incUpdated + 1
                ElseIf Not incs.Exists(iid) Then
                    If nextK = 0 Then Err.Raise vbObjectError + 3, , "事案の上限（" & (K_LAST - K_FIRST + 1) & "件）に達しました。新しい台帳に分けてください。"
                    For k = 0 To N_INC - 1
                        PutVal wk.Cells(nextK, IncCol(k)), Fld(v, hdr, IncName(k), IncKind(k)), IncKind(k)
                    Next k
                    PutVal wk.Cells(nextK, 16), Format(Now, "yyyy/mm/dd hh:nn"), "t"
                    incs(iid) = nextK
                    incDone(iid) = True
                    incAdded = incAdded + 1
                    nextK = IIf(nextK >= K_LAST, 0, nextK + 1)
                End If
            End If
        End If
    Next r
End Function

Private Function HeaderMap(rows As Collection) As Object
    Dim hdr As Object, h As Variant, c As Long, nm As String
    Set hdr = CreateObject("Scripting.Dictionary")
    If rows.Count >= 1 Then
        h = rows(1)
        For c = LBound(h) To UBound(h)
            nm = Trim$(CStr(h(c)))
            If Not hdr.Exists(nm) Then hdr(nm) = c
        Next c
        ' 旧形式の名前も受ける
        If hdr.Exists("減圧停止") And Not hdr.Exists("減圧停止(表の判定)") Then hdr("減圧停止(表の判定)") = hdr("減圧停止")
    End If
    Set HeaderMap = hdr
End Function

Private Function IsAppHeader(hdr As Object) As Boolean
    IsAppHeader = hdr.Exists("事案ID") And hdr.Exists("職員番号") And hdr.Exists("本数")
End Function

' 照合の索引：記録ID → 行、事案ID|職員番号|本数 → 行（全部の行と、記録IDのない行）
Private Function RowKey(wd As Worksheet, ByVal r As Long) As String
    RowKey = CellStr(wd.Cells(r, 19)) & "|" & CellStr(wd.Cells(r, 2)) & "|" & CellStr(wd.Cells(r, 20))
End Function

Private Sub Reindex(wd As Worksheet, ByVal r As Long, ids As Object, keysAll As Object, keysNoId As Object)
    Dim rid As String, key As String
    rid = CellStr(wd.Cells(r, C_RECID))
    If rid <> "" Then
        If Not ids.Exists(rid) Then ids(rid) = r
    End If
    If CellStr(wd.Cells(r, 19)) <> "" Then
        key = RowKey(wd, r)
        If Not keysAll.Exists(key) Then keysAll(key) = r
        If rid = "" Then
            If Not keysNoId.Exists(key) Then keysNoId(key) = r
        End If
    End If
End Sub

Private Sub Unindex(wd As Worksheet, ByVal r As Long, ids As Object, keysAll As Object, keysNoId As Object)
    Dim rid As String, key As String
    rid = CellStr(wd.Cells(r, C_RECID))
    key = RowKey(wd, r)
    If rid <> "" Then
        If ids.Exists(rid) Then
            If ids(rid) = r Then ids.Remove rid
        End If
    End If
    If keysAll.Exists(key) Then
        If keysAll(key) = r Then keysAll.Remove key
    End If
    If keysNoId.Exists(key) Then
        If keysNoId(key) = r Then keysNoId.Remove key
    End If
End Sub

' CSVの記録更新日時（yyyy/mm/dd hh:mm:ss）が台帳より新しいか。台帳が空なら True（中身を比べる）。CSVが空（古い形式）で台帳にあれば False
Private Function IsNewer(ByVal newTs As String, ByVal oldTs As String) As Boolean
    If oldTs = "" Then
        IsNewer = True
    ElseIf newTs = "" Then
        IsNewer = False
    Else
        IsNewer = (StrComp(newTs, oldTs, vbBinaryCompare) > 0)
    End If
End Function

Private Function FindRow(ByVal rid As String, ByVal key As String, ids As Object, keysAll As Object, keysNoId As Object) As Long
    FindRow = 0
    If rid <> "" Then
        If ids.Exists(rid) Then
            FindRow = ids(rid)
        ElseIf keysNoId.Exists(key) Then
            ' 記録IDのない行（古いCSVで取り込んだ行・手で入れた行）と同じ潜水
            FindRow = keysNoId(key)
        End If
    ElseIf keysAll.Exists(key) Then
        FindRow = keysAll(key)
    End If
End Function

' isNew=True：全部の列を書く（CSVに無い列は空）。False（更新）：CSVにある列だけ書く
Private Sub WriteRow(wd As Worksheet, ByVal r As Long, v As Variant, hdr As Object, ByVal isNew As Boolean)
    Dim k As Long
    For k = 0 To N_MAP - 1
        If isNew Or hdr.Exists(MapName(k)) Then PutVal wd.Cells(r, MapCol(k)), Fld(v, hdr, MapName(k), MapKind(k)), MapKind(k)
    Next k
End Sub

Private Function RowSame(wd As Worksheet, ByVal r As Long, v As Variant, hdr As Object) As Boolean
    Dim k As Long
    RowSame = True
    For k = 0 To N_MAP - 1
        If hdr.Exists(MapName(k)) Then
            If Not SameVal(wd.Cells(r, MapCol(k)), Fld(v, hdr, MapName(k), MapKind(k)), MapKind(k)) Then
                RowSame = False
                Exit Function
            End If
        End If
    Next k
End Function

' 入力の列だけ消す（氏名・補助列などの数式は残す）。削除の印として、記録IDと記録更新日時だけ残す
Private Sub ClearRow(wd As Worksheet, ByVal r As Long, ByVal rid As String, ByVal ts As String)
    Dim k As Long
    For k = 0 To N_MAP - 1
        wd.Cells(r, MapCol(k)).ClearContents
    Next k
    If rid <> "" Then
        PutVal wd.Cells(r, C_RECID), rid, "t"
        PutVal wd.Cells(r, C_TS), ts, "t"
        PutVal wd.Cells(r, C_NOTE), "削除済み（アプリで削除）", "t"
    End If
End Sub

' CSVの値。アプリが付けた先頭の ' （次の文字が = + - @ タブのとき）を1文字取り除く。列の種類は問わない
Private Function Fld(v As Variant, hdr As Object, ByVal name As String, ByVal kind As String) As String
    Dim s As String
    If hdr.Exists(name) Then
        If hdr(name) <= UBound(v) Then s = CStr(v(hdr(name)))
    End If
    If Len(s) >= 2 And Left$(s, 1) = "'" Then
        If InStr("=+-@" & vbTab, Mid$(s, 2, 1)) > 0 Then s = Mid$(s, 2)
    End If
    Fld = s
End Function

Private Function CellStr(ByVal cell As Range) As String
    Dim v As Variant
    v = cell.Value
    If IsError(v) Then
        CellStr = ""
    Else
        CellStr = CStr(v)
    End If
End Function

Private Sub PutVal(ByVal cell As Range, ByVal s As String, ByVal kind As String)
    If s = "" Then
        cell.ClearContents
        Exit Sub
    End If
    Select Case kind
        Case "d"
            If IsDate(s) Then
                cell.NumberFormat = "yyyy/m/d"
                cell.Value = CDate(s)
            Else
                cell.NumberFormat = "@"
                cell.Value = s
            End If
        Case "h"
            If IsDate(s) Then
                cell.NumberFormat = "h:mm"
                cell.Value = TimeValue(s)
            Else
                cell.NumberFormat = "@"
                cell.Value = s
            End If
        Case "n"
            If IsNumeric(s) Then
                cell.NumberFormat = "General"
                cell.Value = CDbl(s)
            Else
                cell.NumberFormat = "@"
                cell.Value = s
            End If
        Case Else
            ' 職員番号など。文字のまま入れる（0123 が 123 にならない）
            cell.NumberFormat = "@"
            cell.Value = s
    End Select
End Sub

' セルの値と CSV の値が同じか（PutVal で書いたときと同じ見方で比べる）
Private Function SameVal(ByVal cell As Range, ByVal s As String, ByVal kind As String) As Boolean
    Dim v As Variant
    v = cell.Value
    If IsError(v) Then
        SameVal = False
        Exit Function
    End If
    If s = "" Then
        SameVal = (CStr(v) = "")
        Exit Function
    End If
    If IsEmpty(v) Then
        SameVal = False
        Exit Function
    End If
    Select Case kind
        Case "d"
            If IsDate(s) And VarType(v) = vbDate Then
                SameVal = (CDbl(CDate(s)) = CDbl(v))
            Else
                SameVal = (CStr(v) = s)
            End If
        Case "h"
            If IsDate(s) And (VarType(v) = vbDate Or VarType(v) = vbDouble) Then
                SameVal = (Round((CDbl(v) - Int(CDbl(v))) * 1440, 0) = Round(CDbl(TimeValue(s)) * 1440, 0))
            Else
                SameVal = (CStr(v) = s)
            End If
        Case "n"
            If IsNumeric(s) And VarType(v) = vbDouble Then
                SameVal = (CDbl(s) = CDbl(v))
            Else
                SameVal = (CStr(v) = s)
            End If
        Case Else
            SameVal = (CStr(v) = s)
    End Select
End Function

' 指定した列のうち、一番下の値のある行（無ければ first-1）。
' 絞り込み中は End(xlUp) が隠れた行を飛ばすので使わない。絞り込みを解除し、値を配列に読んで下から探す
Private Function LastDataRow(ws As Worksheet, ByVal first As Long, ByVal last As Long, cols As Variant) As Long
    Dim c As Variant, a As Variant, i As Long, top As Long
    ShowAll ws
    top = first - 1
    For Each c In cols
        a = ws.Range(ws.Cells(first, CLng(c)), ws.Cells(last, CLng(c))).Value
        For i = UBound(a, 1) To 1 Step -1
            If HasVal(a(i, 1)) Then
                If first + i - 1 > top Then top = first + i - 1
                Exit For
            End If
        Next i
    Next c
    LastDataRow = top
End Function

Private Function HasVal(x As Variant) As Boolean
    If IsError(x) Then
        HasVal = True
    Else
        HasVal = (Len(CStr(x)) > 0)
    End If
End Function

' 絞り込み中なら、すべて表示に戻す
Private Sub ShowAll(ws As Worksheet)
    If ws.FilterMode Then ws.ShowAllData
End Sub

' 次に書く行。指定した列のうち一番下の行の次（日付が空でも、職員番号や事案IDがある行には上書きしない）。満杯なら 0
Private Function NextEmptyRow(ws As Worksheet, ByVal first As Long, ByVal last As Long, cols As Variant) As Long
    Dim r As Long
    r = LastDataRow(ws, first, last, cols)
    If r >= last Then
        NextEmptyRow = 0
    Else
        NextEmptyRow = r + 1
    End If
End Function

Private Function ParseCsv(ByVal s As String) As Collection
    Dim res As New Collection, fields() As String, n As Long
    Dim i As Long, L As Long, ch As String, cur As String, inQ As Boolean
    s = Replace(s, ChrW(&HFEFF), "")
    L = Len(s)
    ReDim fields(0 To 63)
    i = 1
    Do While i <= L
        ch = Mid$(s, i, 1)
        If inQ Then
            If ch = """" Then
                If i < L And Mid$(s, i + 1, 1) = """" Then
                    cur = cur & """"
                    i = i + 1
                Else
                    inQ = False
                End If
            Else
                cur = cur & ch
            End If
        Else
            Select Case ch
                Case """"
                    inQ = True
                Case ","
                    fields(n) = cur
                    cur = ""
                    n = n + 1
                    If n > UBound(fields) Then ReDim Preserve fields(0 To n * 2)
                Case vbCr
                    ' 行の区切りは LF で判定する
                Case vbLf
                    fields(n) = cur
                    cur = ""
                    AddRow res, fields, n
                    n = 0
                Case Else
                    cur = cur & ch
            End Select
        End If
        i = i + 1
    Loop
    If cur <> "" Or n > 0 Then
        fields(n) = cur
        AddRow res, fields, n
    End If
    Set ParseCsv = res
End Function

Private Sub AddRow(res As Collection, fields() As String, ByVal n As Long)
    Dim a() As String, k As Long
    ReDim a(0 To n)
    For k = 0 To n
        a(k) = fields(k)
        fields(k) = ""
    Next k
    res.Add a
End Sub

' =============================================================
' 潜水表をアプリ用のファイル（.json）に書き出す
' =============================================================
Public Sub ExportTableJson()
    Dim ws As Worksheet, folder As String, fname As String, j As String
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("潜水表")
    If CStr(ws.Range("B6").Value) <> "照合済み" Then
        If MsgBox("「照合」欄が照合済みになっていません。照合前の表として書き出しますか？", vbOKCancel + vbExclamation) <> vbOK Then Exit Sub
    End If
    folder = OutFolder()
    If folder = "" Then Exit Sub

    Dim depths As Collection, letters As Collection, rowsK As Collection, colsK As Collection
    Dim i As Long, k As Long, v As Variant, s As String, first As Boolean, first2 As Boolean

    j = "{""format"":""dive-table/1"""
    j = j & ",""name"":" & JStr(ws.Range("B3").Value)
    j = j & ",""version"":" & JStr(ws.Range("B4").Value)
    j = j & ",""source"":" & JStr(ws.Range("B5").Value)
    j = j & ",""verified"":" & IIf(CStr(ws.Range("B6").Value) = "照合済み", "true", "false")
    j = j & ",""verifiedBy"":" & JStr(ws.Range("B7").Value)
    v = ws.Range("B8").Value
    If VarType(v) = vbDate Then s = Format(v, "yyyy-mm-dd") Else s = CStr(v)
    j = j & ",""updatedAt"":" & JStr(s)
    j = j & ",""notes"":["
    Dim parts As Variant: parts = Split(CStr(ws.Range("B9").Value), "／")
    first = True
    For i = LBound(parts) To UBound(parts)
        If Trim$(parts(i)) <> "" Then
            j = j & IIf(first, "", ",") & JStr(parts(i))
            first = False
        End If
    Next i
    j = j & "]"
    j = j & ",""rules"":{""minSurfaceInterval"":" & JNum(ws.Range("M3").Value) & ",""clearAfterMinutes"":" & JNum(ws.Range("M4").Value) & _
        ",""avoidRepetitiveDeeperThan"":" & JNum(ws.Range("M5").Value) & ",""safetyStopMinutes"":" & JNum(ws.Range("M6").Value) & _
        ",""safetyStopDepth"":" & JNum(ws.Range("M7").Value) & ",""maxAscentRate"":" & JNum(ws.Range("M8").Value) & "}"

    ' 最大潜水時間
    Set depths = KeysRow(ws, T_MDT)
    j = j & ",""depths"":["
    For i = 1 To depths.Count
        j = j & IIf(i = 1, "", ",") & JNum(depths(i))
    Next i
    j = j & "],""mdt"":{"
    For i = 1 To depths.Count
        j = j & IIf(i = 1, "", ",") & JStr(JNum(depths(i))) & ":" & JNum(ws.Cells(T_MDT + 1, 1 + i).Value)
    Next i
    j = j & "}"

    ' 表1（グループ）と減圧停止
    Set letters = KeysRow(ws, T_G1)
    Set rowsK = KeysCol(ws, T_G1)
    Dim deco As String: deco = ""
    j = j & ",""groups"":{"
    For i = 1 To rowsK.Count
        j = j & IIf(i = 1, "", ",") & JStr(JNum(rowsK(i))) & ":["
        first = True
        For k = 1 To letters.Count
            v = ws.Cells(T_G1 + i, 1 + k).Value
            If Not IsEmptyCell(v) Then
                j = j & IIf(first, "", ",") & "[" & JNum(v) & "," & JStr(letters(k)) & "]"
                first = False
                If Not IsEmptyCell(ws.Cells(T_DECO + i, 1 + k).Value) Then
                    deco = deco & IIf(deco = "", "", ",") & JStr(JNum(rowsK(i)) & "-" & letters(k)) & ":{""limit"":" & JNum(v) & ",""stop5"":" & JNum(ws.Cells(T_DECO + i, 1 + k).Value) & "}"
                End If
            End If
        Next k
        j = j & "]"
    Next i
    j = j & "},""deco"":{" & deco & "}"

    ' 表3（RNT・AMDT）
    j = j & ",""rnt"":" & GridJson(ws, T_RNT) & ",""amdt"":" & GridJson(ws, T_AMDT)

    ' 表2（水面休息）：列＝終了時のグループ、行＝新しいグループ。下の行（短い休息）から順に並べる
    Set colsK = KeysRow(ws, T_SILO)
    Set rowsK = KeysCol(ws, T_SILO)
    j = j & ",""surfaceInterval"":{"
    first2 = True
    For k = 1 To colsK.Count
        s = ""
        For i = rowsK.Count To 1 Step -1
            If Not IsEmptyCell(ws.Cells(T_SILO + i, 1 + k).Value) And Not IsEmptyCell(ws.Cells(T_SIHI + i, 1 + k).Value) Then
                s = s & IIf(s = "", "", ",") & "[" & HmToMin(ws.Cells(T_SILO + i, 1 + k).Value) & "," & HmToMin(ws.Cells(T_SIHI + i, 1 + k).Value) & "," & JStr(rowsK(i)) & "]"
            End If
        Next i
        If s <> "" Then
            j = j & IIf(first2, "", ",") & JStr(Replace(CStr(colsK(k)), "終了", "")) & ":[" & s & "]"
            first2 = False
        End If
    Next k
    j = j & "}}"

    fname = folder & "潜水表_" & SafeName(CStr(ws.Range("B4").Value)) & "_" & Format(Now, "yyyymmdd_hhnn") & ".json"
    WriteUtf8 fname, j
    MsgBox "アプリ用の潜水表を書き出しました。現場用スマホへメールで送り、アプリの［潜水表ファイルを読み込む］で取り込んでください。" & vbCrLf & fname, vbInformation
    Exit Sub
Fail:
    MsgBox "潜水表を書き出せませんでした。" & vbCrLf & ErrText(Err.Number, Err.Description, "file", fname), vbExclamation
End Sub

Private Function GridJson(ws As Worksheet, ByVal top As Long) As String
    Dim colsK As Collection, rowsK As Collection, i As Long, k As Long, s As String, row As String, v As Variant, firstRow As Boolean
    Set colsK = KeysRow(ws, top)
    Set rowsK = KeysCol(ws, top)
    s = "{": firstRow = True
    For i = 1 To rowsK.Count
        row = ""
        For k = 1 To colsK.Count
            v = ws.Cells(top + i, 1 + k).Value
            If Not IsEmptyCell(v) Then row = row & IIf(row = "", "", ",") & JStr(CStr(Val(CStr(colsK(k))))) & ":" & JNum(v)
        Next k
        If row <> "" Then
            s = s & IIf(firstRow, "", ",") & JStr(rowsK(i)) & ":{" & row & "}"
            firstRow = False
        End If
    Next i
    GridJson = s & "}"
End Function

Private Function KeysRow(ws As Worksheet, ByVal r As Long) As Collection
    Dim c As Long, res As New Collection
    c = 2
    Do While Not IsEmptyCell(ws.Cells(r, c).Value)
        res.Add ws.Cells(r, c).Value
        c = c + 1
    Loop
    Set KeysRow = res
End Function

Private Function KeysCol(ws As Worksheet, ByVal r As Long) As Collection
    Dim rr As Long, res As New Collection
    rr = r + 1
    Do While Not IsEmptyCell(ws.Cells(rr, 1).Value)
        res.Add ws.Cells(rr, 1).Value
        rr = rr + 1
    Loop
    Set KeysCol = res
End Function

Private Function IsEmptyCell(v As Variant) As Boolean
    IsEmptyCell = (Trim$(CStr(v)) = "")
End Function

' 表2の「時:分」を分に。時刻型のセル、数値のセル、コロンのない「10」（分とみなす）でも止まらない
Private Function HmToMin(v As Variant) As Long
    Dim p As Variant, s As String
    If VarType(v) = vbDate Then
        HmToMin = CLng(Round(CDbl(v) * 1440, 0))
    ElseIf IsNumeric(v) And VarType(v) <> vbString Then
        If CDbl(v) < 1 Then
            HmToMin = CLng(Round(CDbl(v) * 1440, 0))
        Else
            HmToMin = CLng(Round(CDbl(v), 0))
        End If
    Else
        s = Replace(Trim$(CStr(v)), "：", ":")
        p = Split(s, ":")
        If UBound(p) >= 1 Then
            HmToMin = CLng(Val(p(0))) * 60 + CLng(Val(p(1)))
        Else
            HmToMin = CLng(Val(s))
        End If
    End If
End Function

' 数値を JSON の数字に。Str$ は 0.5 を " .5" にするので、先頭に 0 を補う
Private Function JNum(v As Variant) As String
    Dim s As String
    s = Trim$(Str$(Val(CStr(v))))
    If Left$(s, 1) = "." Then
        s = "0" & s
    ElseIf Left$(s, 2) = "-." Then
        s = "-0" & Mid$(s, 2)
    End If
    JNum = s
End Function

Private Function JStr(v As Variant) As String
    Dim s As String
    s = CStr(v)
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, vbCr, "")
    s = Replace(s, vbLf, "\n")
    s = Replace(s, vbTab, "\t")
    JStr = """" & s & """"
End Function

' =============================================================
' 報告書・経歴簿・隊員一覧をPDF
' =============================================================
Public Sub ExportReportPdf()
    Dim ws As Worksheet, folder As String, fname As String, n As Long
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("報告書")
    If Trim$(CStr(ws.Range("C4").Value)) = "" Then
        MsgBox "報告書のC4で事案IDを選んでください。", vbExclamation
        Exit Sub
    End If
    folder = OutFolder()
    If folder = "" Then Exit Sub
    Application.Calculate
    n = Val(CStr(ws.Range("G11").Value))
    If n > RN Then
        If MsgBox("この事案の記録は " & n & " 本あります。報告書に載るのは " & RN & " 本までで、" & (RN + 1) & " 本目からはPDFに入りません。" & vbCrLf & _
            "載らない分は、潜水記録シートを絞り込んで印刷し、添えてください。このままPDFを作りますか？", vbOKCancel + vbExclamation) <> vbOK Then Exit Sub
    End If
    ws.PageSetup.PrintArea = "$A$1:$" & R_LASTCOL & "$" & R_LAST
    fname = folder & "潜水活動報告書_" & SafeName(CStr(ws.Range("C4").Value)) & "_" & Format(Date, "yyyymmdd") & ".pdf"
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fname, Quality:=xlQualityStandard, _
        IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=False
    MsgBox "報告書をPDFで保存しました。印刷して、指揮者が確認・署名してください。" & vbCrLf & fname, vbInformation
    Exit Sub
Fail:
    MsgBox "報告書のPDFを保存できませんでした。" & vbCrLf & ErrText(Err.Number, Err.Description, "pdf", fname), vbExclamation
End Sub

Public Sub ExportCareerPdfCurrent()
    Dim ws As Worksheet, folder As String, f As String, n As Long
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("経歴簿")
    If Trim$(CStr(ws.Range("C4").Value)) = "" Then
        MsgBox "経歴簿のC4で職員番号を選んでください。", vbExclamation
        Exit Sub
    End If
    folder = OutFolder()
    If folder = "" Then Exit Sub
    Application.Calculate
    n = Val(CStr(ws.Range("C6").Value))
    If n > KN Then
        If MsgBox("この人の記録は " & n & " 本あります。経歴簿に載るのは " & KN & " 本までで、" & (KN + 1) & " 本目からはPDFに入りません。" & vbCrLf & _
            "載らない分は、CSV抽出で職員番号を指定して出してください。このままPDFを作りますか？", vbOKCancel + vbExclamation) <> vbOK Then Exit Sub
    End If
    f = ExportCareerPdf(folder, n)
    MsgBox "PDFを保存しました。" & vbCrLf & f, vbInformation
    Exit Sub
Fail:
    MsgBox "経歴簿のPDFを保存できませんでした。" & vbCrLf & ErrText(Err.Number, Err.Description, "pdf", f), vbExclamation
End Sub

Public Sub ExportCareerPdfAll()
    Dim ws As Worksheet, wm As Worksheet, folder As String, f As String, msg As String, over As String
    Dim r As Long, cnt As Long, n As Long, keep As Variant, en As Long, ed As String
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("経歴簿")
    Set wm = ThisWorkbook.Worksheets("隊員マスタ")
    If MsgBox("在籍者全員の経歴簿を1人1ファイルのPDFで保存します。よろしいですか？", vbOKCancel + vbQuestion) <> vbOK Then Exit Sub
    folder = OutFolder()
    If folder = "" Then Exit Sub
    keep = ws.Range("C4").Value
    Application.ScreenUpdating = False
    For r = M_FIRST To M_LAST
        If Trim$(CellStr(wm.Cells(r, 1))) <> "" And CellStr(wm.Cells(r, 4)) = "在籍" Then
            ws.Range("C4").Value = wm.Cells(r, 1).Value
            f = ExportCareerPdf(folder, n)
            If n > KN Then over = over & vbCrLf & "・" & CellStr(wm.Cells(r, 1)) & " " & CellStr(wm.Cells(r, 2)) & "（" & n & "本）"
            cnt = cnt + 1
        End If
    Next r
Cleanup:
    On Error Resume Next
    ws.Range("C4").Value = keep
    Application.Calculate
    Application.ScreenUpdating = True
    If en <> 0 Then
        MsgBox "途中で止まりました（" & cnt & "人分は保存済み）。" & vbCrLf & ErrText(en, ed, "pdf", f), vbExclamation
        Exit Sub
    End If
    msg = cnt & "人分のPDFを保存しました。" & vbCrLf & folder
    If over <> "" Then msg = msg & vbCrLf & vbCrLf & "次の人は " & KN & " 本を超えているため、" & (KN + 1) & " 本目からはPDFに入っていません（CSV抽出で出してください）。" & over
    MsgBox msg, IIf(over = "", vbInformation, vbExclamation)
    Exit Sub
Fail:
    en = Err.Number: ed = Err.Description
    If en = 0 Then en = -1
    Resume Cleanup
End Sub

' 今の C4 の人の経歴簿をPDFに。n にその人の本数を返す（KN 本を超えた分は表に出ない）
Private Function ExportCareerPdf(ByVal folder As String, ByRef n As Long) As String
    Dim ws As Worksheet, rowsN As Long, fname As String
    Set ws = ThisWorkbook.Worksheets("経歴簿")
    Application.Calculate
    n = Val(CStr(ws.Range("C6").Value))
    rowsN = n
    If rowsN < 1 Then rowsN = 1
    If rowsN > KN Then rowsN = KN
    ws.PageSetup.PrintArea = "$A$1:$L$" & (KH + rowsN)
    fname = folder & "経歴簿_" & SafeName(CStr(ws.Range("C4").Value)) & "_" & SafeName(CStr(ws.Range("F4").Value)) & "_" & Format(Date, "yyyymmdd") & ".pdf"
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fname, Quality:=xlQualityStandard, _
        IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=False
    ExportCareerPdf = fname
End Function

Public Sub ExportListPdf()
    Dim ws As Worksheet, folder As String, r As Long, lastRow As Long, fname As String
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("隊員一覧")
    folder = OutFolder()
    If folder = "" Then Exit Sub
    Application.Calculate
    lastRow = V_FIRST
    For r = V_FIRST To V_LAST
        If Len(CellStr(ws.Cells(r, 1))) > 0 Then lastRow = r
    Next r
    ws.PageSetup.PrintArea = "$A$1:$M$" & lastRow
    fname = folder & "隊員一覧_" & Format(Date, "yyyymmdd") & ".pdf"
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fname, Quality:=xlQualityStandard, _
        IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=False
    MsgBox "PDFを保存しました。" & vbCrLf & fname, vbInformation
    Exit Sub
Fail:
    MsgBox "隊員一覧のPDFを保存できませんでした。" & vbCrLf & ErrText(Err.Number, Err.Description, "pdf", fname), vbExclamation
End Sub

' =============================================================
' CSV抽出の結果をCSV（UTF-8）で保存。見出しはアプリのCSVと同じ名前
' =============================================================
Public Sub ExportCsv()
    Dim ws As Worksheet, folder As String, fname As String
    Dim r As Long, c As Long, n As Long, ln As String, buf As String
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("CSV抽出")
    Application.Calculate
    n = Val(CStr(ws.Range("C8").Value))
    If n = 0 Then
        MsgBox "条件に合う記録がありません。", vbExclamation
        Exit Sub
    End If
    If n > EN Then
        MsgBox "該当が" & EN & "件を超えています（" & n & "件）。期間を分けて出力してください。", vbExclamation
        Exit Sub
    End If
    folder = OutFolder()
    If folder = "" Then Exit Sub
    For r = EH To EH + n
        ln = ""
        For c = 2 To ECOLS
            If c > 2 Then ln = ln & ","
            ln = ln & CsvField(ws.Cells(r, c).Value, ws.Cells(r, c).NumberFormat)
        Next c
        buf = buf & ln & vbCrLf
    Next r
    fname = folder & "潜水記録_" & Format(Now, "yyyymmdd_hhnn") & ".csv"
    WriteUtf8 fname, buf
    MsgBox n & "件をCSVで保存しました。" & vbCrLf & fname, vbInformation
    Exit Sub
Fail:
    MsgBox "CSVを保存できませんでした。" & vbCrLf & ErrText(Err.Number, Err.Description, "file", fname), vbExclamation
End Sub

Private Function CsvField(ByVal v As Variant, ByVal fmt As String) As String
    Dim s As String, d As Double
    If IsError(v) Then
        s = ""
    ElseIf VarType(v) = vbDate Then
        ' 時刻だけのセルは整数部が 0（1899/12/30）。日付にしない
        d = CDbl(v)
        If Int(d) = 0 Then
            s = Format(v, "hh:nn")
        ElseIf d <> Int(d) Then
            s = Format(v, "yyyy/mm/dd hh:nn")
        Else
            s = Format(v, "yyyy/mm/dd")
        End If
    ElseIf VarType(v) = vbDouble And (fmt = "h:mm" Or fmt = "hh:mm") Then
        s = Format(v, "hh:nn")
    ElseIf VarType(v) = vbString Then
        s = v
        ' Excel で直接開いたときに数式にならないよう、アプリと同じく先頭に ' を付ける
        If Len(s) > 0 Then
            If InStr("=+-@" & vbTab, Left$(s, 1)) > 0 Then s = "'" & s
        End If
    Else
        s = CStr(v)
    End If
    If InStr(s, ",") > 0 Or InStr(s, """") > 0 Or InStr(s, vbLf) > 0 Or InStr(s, vbCr) > 0 Then
        s = """" & Replace(s, """", """""") & """"
    End If
    CsvField = s
End Function

' =============================================================
' 潜水記録を日付順・職員番号順に並べ替え（補助列と追加記録の列まで一緒に動かす）
' =============================================================
Public Sub SortDiveLog()
    Dim ws As Worksheet, lastRow As Long
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("潜水記録")
    ShowAll ws
    lastRow = LastDataRow(ws, D_FIRST, D_LAST, Array(1, 2, 19, 38))
    If lastRow < D_FIRST + 1 Then Exit Sub
    With ws.Sort
        .SortFields.Clear
        .SortFields.Add Key:=ws.Range("A" & D_FIRST & ":A" & lastRow), Order:=xlAscending
        .SortFields.Add Key:=ws.Range("U" & D_FIRST & ":U" & lastRow), Order:=xlAscending
        .SortFields.Add Key:=ws.Range("B" & D_FIRST & ":B" & lastRow), Order:=xlAscending
        .SetRange ws.Range("A" & D_FIRST & ":" & D_LASTCOL & lastRow)
        .Header = xlNo
        .Apply
    End With
    MsgBox "日付順に並べ替えました。", vbInformation
    Exit Sub
Fail:
    MsgBox "並べ替えできませんでした。" & vbCrLf & ErrText(Err.Number, Err.Description, "sheet", ""), vbExclamation
End Sub

' =============================================================
' ボタンを各シートに配置（最初に1回だけ実行）
' =============================================================
Public Sub SetupButtons()
    On Error GoTo Fail
    AddBtn "潜水記録", "H1", "アプリのCSVを取り込む", "ImportAppCsv"
    AddBtn "潜水記録", "L1", "日付順に並べ替え", "SortDiveLog"
    AddBtn "事案", "I1", "アプリのCSVを取り込む", "ImportAppCsv"
    AddBtn "報告書", "O4", "報告書をPDF", "ExportReportPdf"
    AddBtn "経歴簿", "N4", "この人の経歴簿をPDF", "ExportCareerPdfCurrent"
    AddBtn "経歴簿", "N6", "在籍者全員の経歴簿をPDF", "ExportCareerPdfAll"
    AddBtn "隊員一覧", "O2", "隊員一覧をPDF", "ExportListPdf"
    AddBtn "CSV抽出", "E4", "CSVで保存", "ExportCsv"
    AddBtn "潜水表", "O3", "アプリ用に書き出す", "ExportTableJson"
    MsgBox "ボタンを配置しました。上書き保存してください。", vbInformation
    Exit Sub
Fail:
    MsgBox "ボタンを付けられませんでした。シートの保護を外してから、もう一度実行してください。" & vbCrLf & ErrText(Err.Number, Err.Description, "sheet", ""), vbExclamation
End Sub

Private Sub AddBtn(ByVal sheetName As String, ByVal anchor As String, ByVal caption As String, ByVal macroName As String)
    Dim ws As Worksheet, b As Object, nm As String
    Set ws = ThisWorkbook.Worksheets(sheetName)
    nm = "btn_" & macroName
    On Error Resume Next
    ws.Buttons(nm).Delete
    On Error GoTo 0
    With ws.Range(anchor)
        Set b = ws.Buttons.Add(.Left, .Top + 2, 170, 26)
    End With
    b.Name = nm
    b.Caption = caption
    b.OnAction = macroName
    b.PrintObject = False
End Sub

' =============================================================
' 共通
' =============================================================
' 出力フォルダ。使えないときは理由を知らせて "" を返す
Private Function OutFolder() As String
    Dim p As String, ok As Boolean
    OutFolder = ""
    If ThisWorkbook.Path = "" Then
        MsgBox "先にこのファイルを保存してください（パソコンの中、例：ドキュメント）。", vbExclamation
        Exit Function
    End If
    If LCase$(Left$(ThisWorkbook.Path, 4)) = "http" Then
        MsgBox "このファイルは OneDrive などのWeb上の場所で開かれているため、PDFやファイルを書き出せません。" & vbCrLf & _
            "［ファイル］→［名前を付けて保存］→［参照］で、パソコンの中（例：ドキュメント）に保存し直し、そのファイルを開いてから、もう一度押してください。", vbExclamation
        Exit Function
    End If
    p = ThisWorkbook.Path & Application.PathSeparator & OUT_DIR
    On Error Resume Next
    If Dir(p, vbDirectory) = "" Then MkDir p
    ok = (Err.Number = 0)
    If ok Then ok = (Dir(p, vbDirectory) <> "")
    On Error GoTo 0
    If Not ok Then
        MsgBox "出力フォルダを作れませんでした。" & vbCrLf & p & vbCrLf & _
            "保存先が読み取り専用か、書き込みできない場所です。台帳をパソコンの中（例：ドキュメント）に保存し直してから、もう一度押してください。", vbExclamation
        Exit Function
    End If
    OutFolder = p & Application.PathSeparator
End Function

' エラーを分かる言葉に。ctx：pdf／file／import／sheet
Private Function ErrText(ByVal n As Long, ByVal desc As String, ByVal ctx As String, ByVal target As String) As String
    Dim s As String
    If n < 0 And n >= vbObjectError And n < vbObjectError + 1000 Then
        ErrText = desc
        Exit Function
    End If
    Select Case n
        Case 70, 75, 3004, -2146825284, -2147018887
            s = "ファイルに書き込めませんでした。同じ名前のファイル（PDF・CSVなど）を開いたままだと上書きできません。開いているファイルを閉じてから、もう一度押してください。"
        Case 1004
            If ctx = "pdf" Then
                s = "PDFを作れませんでした。同じ名前のPDFを開いたままだと上書きできません。PDFを閉じてから、もう一度押してください。"
            ElseIf ctx = "import" Or ctx = "sheet" Then
                s = "シートに書き込めませんでした。シートの保護を外してから、もう一度押してください。"
            Else
                s = "ファイルを保存できませんでした。"
            End If
        Case 76
            s = "保存先のフォルダが見つかりません。台帳をパソコンの中（例：ドキュメント）に保存し直してください。"
        Case 53, 3002, -2146825286
            s = "ファイルを開けませんでした。ほかのソフトで開いていないか、ファイルが移動・削除されていないか確かめてください。"
        Case 429
            s = "Windowsの部品（Scripting.Dictionary・ADODB.Stream）を使えませんでした。情報担当に相談してください。"
        Case Else
            s = "思わぬエラーで止まりました。"
    End Select
    If target <> "" Then s = s & vbCrLf & target
    ErrText = s & vbCrLf & "（エラー番号 " & n & "：" & desc & "）"
End Function

Private Function FileName(ByVal path As String) As String
    FileName = Mid$(path, InStrRev(path, Application.PathSeparator) + 1)
End Function

Private Function SafeName(ByVal s As String) As String
    Dim ch As Variant
    For Each ch In Array("\", "/", ":", "*", "?", """", "<", ">", "|", " ", "　")
        s = Replace(s, ch, "")
    Next ch
    SafeName = s
End Function

Private Function ReadText(ByVal path As String, ByVal charset As String) As String
    Dim st As Object
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = charset
    st.Open
    st.LoadFromFile path
    ReadText = st.ReadText(-1)
    st.Close
End Function

Private Sub WriteUtf8(ByVal path As String, ByVal text As String)
    Dim st As Object
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = "UTF-8"
    st.Open
    st.WriteText text
    st.SaveToFile path, 2
    st.Close
End Sub
