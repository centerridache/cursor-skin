' Restart MAIN Cursor under Dream Skin (save work first).
' Errors show a MessageBox from start-dream-skin.ps1 (window used to flash and vanish).
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Admin\Desktop\awesproject"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\Admin\Desktop\awesproject\scripts\start-dream-skin.ps1"" -RestartExisting", 0, False
