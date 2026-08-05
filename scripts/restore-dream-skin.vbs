' Restore / close Dream Skin test session.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Admin\Desktop\awesproject"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\Admin\Desktop\awesproject\scripts\restore-dream-skin.ps1""", 0, False
