' ARQX Atlas Agent — start the tray silently (no console window).
' Runs python\pythonw.exe app\tray.py relative to this script's own folder, so it
' works from the portable bundle or the installed copy without hardcoded paths.
Option Explicit
Dim fso, sh, base
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base
sh.Run """" & base & "\python\pythonw.exe"" """ & base & "\app\tray.py""", 0, False
