Attribute VB_Name = "DiveTools"
Option Explicit

' =============================================================
' 潜水管理台帳 第2版 マクロ（取り込み・書き出し・整列）
' 一覧と集計は数式で動くため、マクロを無効にしても閲覧・入力はできます。
' 対象：Excel 2019（Windows）
' =============================================================

Private Const OUT_DIR As String = "出力"
Private Const D_FIRST As Long = 5
Private Const D_LAST As Long = 3004
Private Const K_FIRST As Long = 5
Private Const K_LAST As Long = 1004
Private Const M_FIRST As Long = 5
Private Const M_LAST As Long = 204
' 潜水表シートの各表の見出し行
Private Const T_MDT As Long = 12
Private Const T_G1 As Long = 17
Private Const T_DECO As Long = 33
Private Const T_RNT As Long = 49
Private Const T_AMDT As Long = 67
Private Const T_SILO As Long = 85
Private Const T_SIHI As Long = 103

' =============================================================
' アプリのCSVを取り込む
' =============================================================
Public Sub ImportAppCsv()
    Dim files As Variant, i As Long
    Dim added As Long, skipped As Long, incAdded As Long, bad As Long
    files = Application.GetOpenFilename("CSVファイル (*.csv),*.csv", , "アプリから届いたCSVを選ぶ（複数選べます）", , True)
    If Not IsArray(files) Then Exit Sub
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    On Error GoTo Fail
    For i = LBound(files) To UBound(files)
        ImportOne CStr(files(i)), added, skipped, incAdded, bad
    Next i
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Dim msg As String
    msg = "取り込みました。" & vbCrLf & "潜水記録：" & added & "件を追加"
    If skipped > 0 Then msg = msg & "（" & skipped & "件は取り込み済みのため追加せず）"
    msg = msg & vbCrLf & "事案：" & incAdded & "件を追加"
    If bad > 0 Then msg = msg & vbCrLf & "読めなかった行：" & bad & "件"
    MsgBox msg, vbInformation
    Exit Sub
Fail:
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    MsgBox "取り込みの途中で止まりました（" & added & "件は追加済み）。" & vbCrLf & Err.Description, vbExclamation
End Sub

Private Sub ImportOne(ByVal path As String, ByRef added As Long, ByRef skipped As Long, ByRef incAdded As Long, ByRef bad As Long)
    Dim rows As Collection, hdr As Object, h As Variant, v As Variant
    Dim r As Long, c As Long, k As Long
    Set rows = ParseCsv(ReadUtf8(path))
    If rows.Count < 2 Then Exit Sub
    Set hdr = CreateObject("Scripting.Dictionary")
    h = rows(1)
    For c = LBound(h) To UBound(h)
        hdr(Trim$(CStr(h(c)))) = c
    Next c
    If Not (hdr.Exists("事案ID") And hdr.Exists("職員番号") And hdr.Exists("本数")) Then
        Err.Raise vbObjectError + 1, , "アプリのCSVではありません：" & path
    End If

    Dim wd As Worksheet, wk As Worksheet
    Set wd = ThisWorkbook.Worksheets("潜水記録")
    Set wk = ThisWorkbook.Worksheets("事案")
    Dim keys As Object, incs As Object
    Set keys = CreateObject("Scripting.Dictionary")
    Set incs = CreateObject("Scripting.Dictionary")
    For r = D_FIRST To D_LAST
        If CStr(wd.Cells(r, 19).Value) <> "" Then keys(CStr(wd.Cells(r, 19).Value) & "|" & CStr(wd.Cells(r, 2).Value) & "|" & CStr(wd.Cells(r, 20).Value)) = True
    Next r
    For r = K_FIRST To K_LAST
        If CStr(wk.Cells(r, 1).Value) <> "" Then incs(CStr(wk.Cells(r, 1).Value)) = True
    Next r

    ' CSVの見出し → 潜水記録の列、種類（d=日付 n=数値 t=文字 h=時刻）
    Dim names As Variant, cols As Variant, kinds As Variant
    names = Array("日付", "職員番号", "区分", "事案・訓練名", "地点", "最大水深(m)", "潜水時間(分)", "前の潜水からの水面休息(分)", "タンク容量(L)", _
        "開始圧(気圧)", "終了圧(気圧)", "水温(℃)", "透視度(m)", "減圧停止", "体調異常", "指揮者", "備考", "事案ID", "本数", "潜降時刻", "浮上時刻", _
        "表の水深(m)", "グループ", "残留窒素時間(分)", "合計窒素時間(分)", "最大潜水時間(分)", "修正最大潜水時間(分)", "判定", "5m減圧停止(分)", "潜水表", "氏名")
    cols = Array(1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 37)
    kinds = Array("d", "n", "t", "t", "t", "n", "n", "n", "n", "n", "n", "n", "n", "t", "t", "t", "t", "t", "n", "h", "h", "n", "t", "n", "n", "n", "n", "t", "n", "t", "t")

    Dim nextD As Long, nextK As Long, key As String, iid As String
    nextD = NextEmptyRow(wd, D_FIRST, D_LAST)
    nextK = NextEmptyRow(wk, K_FIRST, K_LAST)
    For r = 2 To rows.Count
        v = rows(r)
        If UBound(v) - LBound(v) + 1 < hdr.Count Then
            If Trim$(Join(v, "")) <> "" Then bad = bad + 1
        Else
            iid = Fld(v, hdr, "事案ID")
            key = iid & "|" & Fld(v, hdr, "職員番号") & "|" & Fld(v, hdr, "本数")
            If keys.Exists(key) Then
                skipped = skipped + 1
            Else
                If nextD = 0 Then Err.Raise vbObjectError + 2, , "潜水記録の上限（3000件）に達しました。"
                For k = LBound(names) To UBound(names)
                    PutVal wd.Cells(nextD, cols(k)), Fld(v, hdr, CStr(names(k))), CStr(kinds(k))
                Next k
                keys(key) = True
                added = added + 1
                nextD = IIf(nextD >= D_LAST, 0, nextD + 1)
                If Not incs.Exists(iid) Then
                    If nextK = 0 Then Err.Raise vbObjectError + 3, , "事案の上限（1000件）に達しました。"
                    PutVal wk.Cells(nextK, 1), iid, "t"
                    PutVal wk.Cells(nextK, 2), Fld(v, hdr, "日付"), "d"
                    PutVal wk.Cells(nextK, 3), Fld(v, hdr, "区分"), "t"
                    PutVal wk.Cells(nextK, 4), Fld(v, hdr, "事案・訓練名"), "t"
                    PutVal wk.Cells(nextK, 5), Fld(v, hdr, "地点"), "t"
                    PutVal wk.Cells(nextK, 6), Fld(v, hdr, "指揮者"), "t"
                    PutVal wk.Cells(nextK, 7), Fld(v, hdr, "事案開始"), "t"
                    PutVal wk.Cells(nextK, 8), Fld(v, hdr, "事案終了"), "t"
                    PutVal wk.Cells(nextK, 9), Fld(v, hdr, "水温(℃)"), "n"
                    PutVal wk.Cells(nextK, 10), Fld(v, hdr, "透視度(m)"), "n"
                    PutVal wk.Cells(nextK, 11), Fld(v, hdr, "海況"), "t"
                    PutVal wk.Cells(nextK, 12), Fld(v, hdr, "事案備考"), "t"
                    PutVal wk.Cells(nextK, 13), Fld(v, hdr, "潜水表"), "t"
                    PutVal wk.Cells(nextK, 16), Format(Now, "yyyy/mm/dd hh:nn"), "t"
                    incs(iid) = True
                    incAdded = incAdded + 1
                    nextK = IIf(nextK >= K_LAST, 0, nextK + 1)
                End If
            End If
        End If
    Next r
End Sub

Private Function Fld(v As Variant, hdr As Object, ByVal name As String) As String
    If hdr.Exists(name) Then
        If hdr(name) <= UBound(v) Then Fld = CStr(v(hdr(name)))
    End If
End Function

Private Sub PutVal(ByVal cell As Range, ByVal s As String, ByVal kind As String)
    If s = "" Then
        cell.ClearContents
        Exit Sub
    End If
    Select Case kind
        Case "d"
            If IsDate(s) Then cell.Value = CDate(s) Else cell.NumberFormat = "@": cell.Value = s
        Case "h"
            If IsDate(s) Then cell.Value = TimeValue(s) Else cell.NumberFormat = "@": cell.Value = s
        Case "n"
            If IsNumeric(s) Then cell.Value = CDbl(s) Else cell.NumberFormat = "@": cell.Value = s
        Case Else
            cell.NumberFormat = "@"
            cell.Value = s
    End Select
End Sub

Private Function NextEmptyRow(ws As Worksheet, ByVal first As Long, ByVal last As Long) As Long
    Dim r As Long
    r = ws.Cells(last + 1, 1).End(xlUp).Row
    If r < first Then
        NextEmptyRow = first
    ElseIf r >= last Then
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

Private Function HmToMin(v As Variant) As Long
    Dim p As Variant
    If VarType(v) = vbDouble Or VarType(v) = vbDate Then
        HmToMin = CLng(Round(CDbl(v) * 1440, 0))
    Else
        p = Split(Trim$(CStr(v)), ":")
        HmToMin = CLng(p(0)) * 60 + CLng(p(1))
    End If
End Function

Private Function JNum(v As Variant) As String
    JNum = Trim$(Str$(Val(CStr(v))))
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
    Dim ws As Worksheet, folder As String, fname As String
    Set ws = ThisWorkbook.Worksheets("報告書")
    If Trim$(CStr(ws.Range("C4").Value)) = "" Then
        MsgBox "報告書のC4で事案IDを選んでください。", vbExclamation
        Exit Sub
    End If
    folder = OutFolder()
    If folder = "" Then Exit Sub
    Application.Calculate
    fname = folder & "潜水活動報告書_" & SafeName(CStr(ws.Range("C4").Value)) & "_" & Format(Date, "yyyymmdd") & ".pdf"
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fname, Quality:=xlQualityStandard, _
        IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=False
    MsgBox "報告書をPDFで保存しました。" & vbCrLf & fname, vbInformation
End Sub

Public Sub ExportCareerPdfCurrent()
    Dim ws As Worksheet, folder As String, f As String
    Set ws = ThisWorkbook.Worksheets("経歴簿")
    If Trim$(CStr(ws.Range("C4").Value)) = "" Then
        MsgBox "経歴簿のC4で職員番号を選んでください。", vbExclamation
        Exit Sub
    End If
    folder = OutFolder()
    If folder = "" Then Exit Sub
    f = ExportCareerPdf(folder)
    MsgBox "PDFを保存しました。" & vbCrLf & f, vbInformation
End Sub

Public Sub ExportCareerPdfAll()
    Dim ws As Worksheet, wm As Worksheet, folder As String
    Dim r As Long, cnt As Long, keep As Variant
    Set ws = ThisWorkbook.Worksheets("経歴簿")
    Set wm = ThisWorkbook.Worksheets("隊員マスタ")
    If MsgBox("在籍者全員の経歴簿を1人1ファイルのPDFで保存します。よろしいですか？", vbOKCancel + vbQuestion) <> vbOK Then Exit Sub
    folder = OutFolder()
    If folder = "" Then Exit Sub
    keep = ws.Range("C4").Value
    Application.ScreenUpdating = False
    On Error GoTo Fin
    For r = M_FIRST To M_LAST
        If Trim$(CStr(wm.Cells(r, 1).Value)) <> "" And CStr(wm.Cells(r, 4).Value) = "在籍" Then
            ws.Range("C4").Value = wm.Cells(r, 1).Value
            ExportCareerPdf folder
            cnt = cnt + 1
        End If
    Next r
Fin:
    ws.Range("C4").Value = keep
    Application.Calculate
    Application.ScreenUpdating = True
    If Err.Number <> 0 Then
        MsgBox "途中でエラーが起きました（" & cnt & "人分は保存済み）。" & vbCrLf & Err.Description, vbExclamation
    Else
        MsgBox cnt & "人分のPDFを保存しました。" & vbCrLf & folder, vbInformation
    End If
End Sub

Private Function ExportCareerPdf(ByVal folder As String) As String
    Dim ws As Worksheet, n As Long, fname As String
    Set ws = ThisWorkbook.Worksheets("経歴簿")
    Application.Calculate
    n = Val(CStr(ws.Range("C6").Value))
    If n < 1 Then n = 1
    If n > 300 Then n = 300
    ws.PageSetup.PrintArea = "$A$1:$L$" & (9 + n)
    fname = folder & "経歴簿_" & ws.Range("C4").Value & "_" & SafeName(CStr(ws.Range("F4").Value)) & "_" & Format(Date, "yyyymmdd") & ".pdf"
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fname, Quality:=xlQualityStandard, _
        IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=False
    ExportCareerPdf = fname
End Function

Public Sub ExportListPdf()
    Dim ws As Worksheet, folder As String, r As Long, lastRow As Long, fname As String
    Set ws = ThisWorkbook.Worksheets("隊員一覧")
    folder = OutFolder()
    If folder = "" Then Exit Sub
    Application.Calculate
    lastRow = 8
    For r = 8 To 207
        If Len(CStr(ws.Cells(r, 1).Value)) > 0 Then lastRow = r
    Next r
    ws.PageSetup.PrintArea = "$A$1:$M$" & lastRow
    fname = folder & "隊員一覧_" & Format(Date, "yyyymmdd") & ".pdf"
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fname, Quality:=xlQualityStandard, _
        IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=False
    MsgBox "PDFを保存しました。" & vbCrLf & fname, vbInformation
End Sub

' =============================================================
' CSV抽出の結果をCSV（UTF-8）で保存
' =============================================================
Public Sub ExportCsv()
    Dim ws As Worksheet, folder As String, fname As String
    Dim r As Long, c As Long, n As Long, ln As String, buf As String
    Set ws = ThisWorkbook.Worksheets("CSV抽出")
    Application.Calculate
    n = Val(CStr(ws.Range("C8").Value))
    If n = 0 Then
        MsgBox "条件に合う記録がありません。", vbExclamation
        Exit Sub
    End If
    If n > 500 Then
        MsgBox "該当が500件を超えています。期間を分けて出力してください。", vbExclamation
        Exit Sub
    End If
    folder = OutFolder()
    If folder = "" Then Exit Sub
    For r = 10 To 10 + n
        ln = ""
        For c = 2 To 32
            If c > 2 Then ln = ln & ","
            ln = ln & CsvField(ws.Cells(r, c).Value, ws.Cells(r, c).NumberFormat)
        Next c
        buf = buf & ln & vbCrLf
    Next r
    fname = folder & "潜水記録_" & Format(Now, "yyyymmdd_hhnn") & ".csv"
    WriteUtf8 fname, buf
    MsgBox n & "件をCSVで保存しました。" & vbCrLf & fname, vbInformation
End Sub

Private Function CsvField(ByVal v As Variant, ByVal fmt As String) As String
    Dim s As String
    If IsError(v) Then
        s = ""
    ElseIf VarType(v) = vbDate Then
        s = Format(v, "yyyy/mm/dd")
    ElseIf VarType(v) = vbDouble And fmt = "h:mm" Then
        s = Format(v, "hh:nn")
    Else
        s = CStr(v)
    End If
    If InStr(s, ",") > 0 Or InStr(s, """") > 0 Or InStr(s, vbLf) > 0 Or InStr(s, vbCr) > 0 Then
        s = """" & Replace(s, """", """""") & """"
    End If
    CsvField = s
End Function

' =============================================================
' 潜水記録を日付順・職員番号順に並べ替え
' =============================================================
Public Sub SortDiveLog()
    Dim ws As Worksheet, lastRow As Long
    Set ws = ThisWorkbook.Worksheets("潜水記録")
    lastRow = ws.Cells(D_LAST + 1, 1).End(xlUp).Row
    If lastRow < D_FIRST + 1 Then Exit Sub
    With ws.Sort
        .SortFields.Clear
        .SortFields.Add Key:=ws.Range("A" & D_FIRST & ":A" & lastRow), Order:=xlAscending
        .SortFields.Add Key:=ws.Range("U" & D_FIRST & ":U" & lastRow), Order:=xlAscending
        .SortFields.Add Key:=ws.Range("B" & D_FIRST & ":B" & lastRow), Order:=xlAscending
        .SetRange ws.Range("A" & D_FIRST & ":AK" & lastRow)
        .Header = xlNo
        .Apply
    End With
    MsgBox "日付順に並べ替えました。", vbInformation
End Sub

' =============================================================
' ボタンを各シートに配置（最初に1回だけ実行）
' =============================================================
Public Sub SetupButtons()
    AddBtn "潜水記録", "H1", "アプリのCSVを取り込む", "ImportAppCsv"
    AddBtn "潜水記録", "L1", "日付順に並べ替え", "SortDiveLog"
    AddBtn "事案", "I1", "アプリのCSVを取り込む", "ImportAppCsv"
    AddBtn "報告書", "N4", "報告書をPDF", "ExportReportPdf"
    AddBtn "経歴簿", "N4", "この人の経歴簿をPDF", "ExportCareerPdfCurrent"
    AddBtn "経歴簿", "N6", "在籍者全員の経歴簿をPDF", "ExportCareerPdfAll"
    AddBtn "隊員一覧", "O2", "隊員一覧をPDF", "ExportListPdf"
    AddBtn "CSV抽出", "E4", "CSVで保存", "ExportCsv"
    AddBtn "潜水表", "O3", "アプリ用に書き出す", "ExportTableJson"
    MsgBox "ボタンを配置しました。上書き保存してください。", vbInformation
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
Private Function OutFolder() As String
    Dim p As String
    If ThisWorkbook.Path = "" Then
        MsgBox "先にこのファイルを保存してください。", vbExclamation
        OutFolder = ""
        Exit Function
    End If
    p = ThisWorkbook.Path & Application.PathSeparator & OUT_DIR
    If Dir(p, vbDirectory) = "" Then MkDir p
    OutFolder = p & Application.PathSeparator
End Function

Private Function SafeName(ByVal s As String) As String
    Dim ch As Variant
    For Each ch In Array("\", "/", ":", "*", "?", """", "<", ">", "|", " ", "　")
        s = Replace(s, ch, "")
    Next ch
    SafeName = s
End Function

Private Function ReadUtf8(ByVal path As String) As String
    Dim st As Object
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = "UTF-8"
    st.Open
    st.LoadFromFile path
    ReadUtf8 = st.ReadText(-1)
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
