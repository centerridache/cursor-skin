' Launch Cursor Dream Skin test window (does not close your main Cursor).
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Admin\Desktop\awesproject"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\Admin\Desktop\awesproject\scripts\start-dream-skin.ps1"" -TestWindow", 0, False
