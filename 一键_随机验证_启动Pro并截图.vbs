Option Explicit

Dim shell, fso, root, ps, cmd, latestReport
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)

' 1 case is usually enough for UI spot-check. Increase Cases if needed by editing this file.
ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & root & "\tools\run-ribbon-layout-validation.ps1"" -Cases 1 -RunProUiCheck"

' Run and wait (hidden)
shell.Run ps, 0, True

latestReport = root & "\validation-runs\LATEST_REPORT.txt"
If fso.FileExists(latestReport) Then
  cmd = "cmd.exe /c start """" """ & Trim(ReadAllText(latestReport)) & """"
  shell.Run cmd, 0, False
End If

Function ReadAllText(path)
  Dim ts
  Set ts = fso.OpenTextFile(path, 1, False, -1)
  ReadAllText = ts.ReadAll
  ts.Close
End Function

