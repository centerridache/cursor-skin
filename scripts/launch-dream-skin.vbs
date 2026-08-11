' Launch Cursor Dream Skin test window (does not close your main Cursor).
' Resolves repo root from this script path (no machine-specific absolute paths).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
ps1 = root & "\scripts\start-dream-skin.ps1"
sh.CurrentDirectory = root
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ -TestWindow", 0, False
