#Requires -Version 5.1
<#
.SYNOPSIS
  Open a foreground file or folder picker owned by the Cursor window.
.PARAMETER Mode
  File  = modern OpenFileDialog for wallpapers
  Folder = Vista-style folder picker (same explorer UI, select a directory)
#>
param(
  [ValidateSet("File", "Folder")]
  [string]$Mode = "File",
  [string]$Title = "",
  [string]$Filter = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Title) {
  $Title = if ($Mode -eq "Folder") {
    "Cursor Dream Skin — choose Wallpaper Engine workshop folder"
  } else {
    "Cursor Dream Skin — choose wallpaper"
  }
}
if (-not $Filter) {
  $Filter = "Wallpaper|*.jpg;*.jpeg;*.png;*.webp;*.gif;*.mp4;*.webm;project.json;scene.pkg|Images|*.jpg;*.jpeg;*.png;*.webp;*.gif|Video|*.mp4;*.webm|WE project|project.json;scene.pkg|All files|*.*"
}

Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null
$formsAsm = [System.Windows.Forms.Form].Assembly.Location

Add-Type -ReferencedAssemblies $formsAsm -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class HwndOwner : IWin32Window {
  public IntPtr Handle { get; private set; }
  public HwndOwner(IntPtr h) { Handle = h; }
}

public static class CdsFg {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
  public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
  public static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  public static IntPtr FindLargestVisibleWindow(int[] pids) {
    var set = new HashSet<int>(pids);
    IntPtr best = IntPtr.Zero;
    long bestArea = 0;
    EnumWindows((h, lp) => {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!set.Contains((int)pid)) return true;
      if (GetWindowTextLength(h) <= 0) return true;
      RECT r; if (!GetWindowRect(h, out r)) return true;
      long area = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      if (area > bestArea) { bestArea = area; best = h; }
      return true;
    }, IntPtr.Zero);
    return best;
  }

  public static IntPtr FindWindowByTitleContains(string needle) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, lp) => {
      if (!IsWindowVisible(h)) return true;
      int len = GetWindowTextLength(h);
      if (len <= 0) return true;
      var sb = new System.Text.StringBuilder(len + 1);
      GetWindowText(h, sb, sb.Capacity);
      if (sb.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) {
        found = h;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static void ForceFront(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero) return;
    IntPtr fg = GetForegroundWindow();
    uint fgPid; uint fgTid = GetWindowThreadProcessId(fg, out fgPid);
    uint cur = GetCurrentThreadId();
    AttachThreadInput(cur, fgTid, true);
    ShowWindow(hWnd, 9);
    SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040);
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);
    SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040);
    AttachThreadInput(cur, fgTid, false);
  }
}

/// Vista+ explorer-style folder picker (not the old tree FolderBrowserDialog).
public static class CdsFolderDialog {
  public static string Pick(IntPtr owner, string title) {
    var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
    try {
      uint opts;
      dialog.GetOptions(out opts);
      dialog.SetOptions(opts | (uint)(FOS.FOS_PICKFOLDERS | FOS.FOS_FORCEFILESYSTEM | FOS.FOS_PATHMUSTEXIST));
      if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);
      int hr = dialog.Show(owner);
      if (hr != 0) return null; // cancelled (HRESULT_FROM_WIN32(ERROR_CANCELLED) == 0x800704C7) or other
      IShellItem item;
      dialog.GetResult(out item);
      string path;
      item.GetDisplayName(SIGDN.SIGDN_FILESYSPATH, out path);
      return path;
    } finally {
      Marshal.ReleaseComObject(dialog);
    }
  }

  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  private class FileOpenDialogRCW { }

  [Flags]
  private enum FOS : uint {
    FOS_PICKFOLDERS = 0x00000020,
    FOS_FORCEFILESYSTEM = 0x00000040,
    FOS_PATHMUSTEXIST = 0x00000800,
  }

  private enum SIGDN : uint {
    SIGDN_FILESYSPATH = 0x80058000,
  }

  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
    void GetResults(out IntPtr ppenum);
    void GetSelectedItems(out IntPtr ppsai);
  }

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(SIGDN sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }
}
'@

$pids = @(Get-Process -Name 'Cursor' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$cursorHwnd = [IntPtr]::Zero
if ($pids.Count -gt 0) {
  $cursorHwnd = [CdsFg]::FindLargestVisibleWindow([int[]]$pids)
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 120
$script:pullCount = 0
$timer.Add_Tick({
  $script:pullCount++
  $dlg = [CdsFg]::FindWindowByTitleContains('Cursor Dream Skin')
  if ($dlg -eq [IntPtr]::Zero) {
    # Vista folder dialog title may omit custom prefix briefly; also match "Select Folder"
    $dlg = [CdsFg]::FindWindowByTitleContains('Select Folder')
  }
  if ($dlg -ne [IntPtr]::Zero) {
    [CdsFg]::ForceFront($dlg)
    if ($script:pullCount -ge 10) { $timer.Stop() }
  } elseif ($script:pullCount -ge 50) {
    $timer.Stop()
  }
})
$timer.Start()

$fallback = $null
$chosen = $null
try {
  $ownerHwnd = $cursorHwnd
  if ($ownerHwnd -eq [IntPtr]::Zero) {
    $fallback = New-Object System.Windows.Forms.Form
    $fallback.Text = 'Cursor Dream Skin'
    $fallback.ShowInTaskbar = $false
    $fallback.FormBorderStyle = 'None'
    $fallback.StartPosition = 'CenterScreen'
    $fallback.Size = New-Object System.Drawing.Size(1, 1)
    $fallback.TopMost = $true
    [void]$fallback.Show()
    $fallback.Activate()
    [CdsFg]::ForceFront($fallback.Handle)
    $ownerHwnd = $fallback.Handle
  }

  if ($Mode -eq "Folder") {
    $chosen = [CdsFolderDialog]::Pick($ownerHwnd, $Title)
    if (-not $chosen) { exit 2 }
  } else {
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Title = $Title
    $d.Filter = $Filter
    $d.Multiselect = $false
    $d.CheckFileExists = $true
    $d.RestoreDirectory = $true
    $owner = New-Object HwndOwner $ownerHwnd
    if ($d.ShowDialog($owner) -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
    $chosen = $d.FileName
  }
} finally {
  $timer.Stop()
  $timer.Dispose()
  if ($null -ne $fallback) { $fallback.Close(); $fallback.Dispose() }
}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::Out.Write($chosen)
