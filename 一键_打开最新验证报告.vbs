Option Explicit

Dim shell, fso, root, latestReport, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
latestReport = root & "\validation-runs\LATEST_REPORT.txt"

If fso.FileExists(latestReport) Then
  cmd = "cmd.exe /c start """" """ & Trim(ReadAllText(latestReport)) & """"
  shell.Run cmd, 0, False
Else
  shell.Popup "还没有生成验证报告。先运行：一键_随机验证_生成报告。", 4, "Ribbon 验证", 48
End If

Function ReadAllText(path)
  Dim ts
  Set ts = fso.OpenTextFile(path, 1, False, -1)
  ReadAllText = ts.ReadAll
  ts.Close
End Function

