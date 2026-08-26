Option Explicit

If WScript.Arguments.Count < 1 Then
  WScript.Quit 87
End If

Dim shell, command, index, powershellPath
Set shell = CreateObject("WScript.Shell")
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = Quote(powershellPath) & " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Quote(WScript.Arguments(0))

For index = 1 To WScript.Arguments.Count - 1
  command = command & " " & Quote(WScript.Arguments(index))
Next

WScript.Quit shell.Run(command, 0, True)

Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
