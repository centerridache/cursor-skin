#Requires -Version 5.1
<#
.SYNOPSIS
  Install desktop + Start Menu launchers for Cursor Dream Skin (double-click, no console).
#>
param(
  [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "common-windows.ps1")

$root = Get-CdsRoot
$startPs1 = Join-Path $PSScriptRoot "start-dream-skin.ps1"
$restorePs1 = Join-Path $PSScriptRoot "restore-dream-skin.ps1"
$launchVbs = Join-Path $PSScriptRoot "launch-dream-skin.vbs"
$restoreVbs = Join-Path $PSScriptRoot "restore-dream-skin.vbs"

$desktop = [Environment]::GetFolderPath("Desktop")
$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Cursor Dream Skin"

function New-CdsShortcut {
  param(
    [string]$Path,
    [string]$TargetPath,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [string]$IconLocation,
    [string]$Description
  )
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($Path)
  $s.TargetPath = $TargetPath
  $s.Arguments = $Arguments
  $s.WorkingDirectory = $WorkingDirectory
  $s.WindowStyle = 7 # minimized host if any
  if ($IconLocation) { $s.IconLocation = $IconLocation }
  if ($Description) { $s.Description = $Description }
  $s.Save()
}

function Remove-IfExists([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force -Recurse -ErrorAction SilentlyContinue
  }
}

if ($Uninstall) {
  Remove-IfExists (Join-Path $desktop "Cursor Dream Skin.lnk")
  Remove-IfExists (Join-Path $desktop "Cursor Dream Skin (Main).lnk")
  Remove-IfExists (Join-Path $desktop "Restore Cursor Dream Skin.lnk")
  Remove-IfExists $programs
  Write-Host "Removed desktop / Start Menu launchers."
  exit 0
}

$cursorExe = Find-CursorExe
$icon = if (Test-Path -LiteralPath $cursorExe) { "$cursorExe,0" } else { "powershell.exe,0" }

$launchMainVbs = Join-Path $PSScriptRoot "launch-dream-skin-main.vbs"

# Hidden-console VBS wrappers (feel closer to an app than a flashing PowerShell window)
$launchVbsBody = @"
' Launch Cursor Dream Skin test window (does not close your main Cursor).
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$root"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$startPs1"" -TestWindow", 0, False
"@
$launchMainVbsBody = @"
' Restart MAIN Cursor under Dream Skin (save work first).
' Errors show a MessageBox from start-dream-skin.ps1 (window used to flash and vanish).
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$root"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$startPs1"" -RestartExisting", 0, False
"@
$restoreVbsBody = @"
' Restore / close Dream Skin test session.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$root"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$restorePs1""", 0, False
"@
$launchVbsBody | Set-Content -LiteralPath $launchVbs -Encoding ASCII
$launchMainVbsBody | Set-Content -LiteralPath $launchMainVbs -Encoding ASCII
$restoreVbsBody | Set-Content -LiteralPath $restoreVbs -Encoding ASCII

New-Item -ItemType Directory -Force -Path $programs | Out-Null

$items = @(
  @{
    Name = "Cursor Dream Skin.lnk"
    Target = "wscript.exe"
    Args = "`"$launchVbs`""
    Desc = "Open a separate Cursor window with Dream Skin (keeps your main Cursor)"
  },
  @{
    Name = "Cursor Dream Skin (Main).lnk"
    Target = "wscript.exe"
    Args = "`"$launchMainVbs`""
    Desc = "Restart MAIN Cursor under Dream Skin (save work first)"
  },
  @{
    Name = "Restore Cursor Dream Skin.lnk"
    Target = "wscript.exe"
    Args = "`"$restoreVbs`""
    Desc = "Stop injector and close the Dream Skin test window"
  }
)

foreach ($it in $items) {
  foreach ($dir in @($desktop, $programs)) {
    New-CdsShortcut `
      -Path (Join-Path $dir $it.Name) `
      -TargetPath $it.Target `
      -Arguments $it.Args `
      -WorkingDirectory $root `
      -IconLocation $icon `
      -Description $it.Desc
  }
}

Write-Host ""
Write-Host "Cursor Dream Skin launchers installed."
Write-Host "  Desktop : $desktop"
Write-Host "  Start   : $programs"
Write-Host ""
Write-Host "How to use:"
Write-Host "  1. Double-click  Cursor Dream Skin          → test window + skin"
Write-Host "  2. In that window, click  Dream Skin  chip → themes / wallpapers"
Write-Host "  3. Double-click  Restore Cursor Dream Skin → close test session"
Write-Host ""
Write-Host "Codex-style note: the shortcut launches Cursor WITH a debug port,"
Write-Host "then injects the skin. Normal Cursor.exe shortcut = no skin."
Write-Host ""
Write-Host "Uninstall launchers:"
Write-Host "  powershell -NoProfile -File scripts\install-launchers.ps1 -Uninstall"
