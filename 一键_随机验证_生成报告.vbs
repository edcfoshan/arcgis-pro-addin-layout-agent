Option Explicit

Dim shell, fso, root, ps, cmd, latestReport
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & root & "\tools\run-ribbon-layout-validation.ps1"" -Cases 10"

' Run and wait (hidden)
shell.Run ps, 0, True

latestReport = root & "\validation-runs\LATEST_REPORT.txt"
If fso.FileExists(latestReport) Then
  cmd = "cmd.exe /c start """" """ & Trim(ReadAllText(latestReport)) & """"
  shell.Run cmd, 0, False
Else
  shell.Popup "找不到 LATEST_REPORT.txt，验证可能没有生成报告。", 4, "Ribbon 验证", 48
End If

Function ReadAllText(path)
  Dim ts
  Set ts = fso.OpenTextFile(path, 1, False, -1)
  ReadAllText = ts.ReadAll
  ts.Close
End Function

