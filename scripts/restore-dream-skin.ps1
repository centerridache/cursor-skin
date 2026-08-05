#Requires -Version 5.1
<#
.SYNOPSIS
  Remove Cursor Dream Skin / close the themed session.
.PARAMETER NoRelaunch
  Do not start a stock Cursor after restore (main-session mode only).
#>
param(
  [switch]$NoRelaunch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "common-windows.ps1")

$lock = $null
try {
  $lock = Enter-CdsLock
  $root = Get-CdsRoot
  $themeDir = Get-CdsThemeDir -Root $root
  $stateDir = Get-CdsStateDir
  $state = Read-CdsSessionState
  $node = Get-NodeExe
  $cursorExe = $null
  try { $cursorExe = Find-CursorExe } catch {
    if ($state -and $state.cursorExe) { $cursorExe = [string]$state.cursorExe }
  }

  $isolated = $false
  $userDataDir = ""
  if ($state) {
    if ($state.isolated) { $isolated = [bool]$state.isolated }
    if ($state.userDataDir) { $userDataDir = [string]$state.userDataDir }
  }
  if (-not $userDataDir) {
    $userDataDir = Get-CdsTestProfileDir
  }

  $port = $null
  if ($state -and $state.port) { $port = [int]$state.port }

  if ($port -and (Test-CdsPortOpen -Port $port)) {
    Write-Host "Removing skin on port $port ..."
    try {
      & $node (Join-Path $PSScriptRoot "injector.mjs") --port $port --theme-dir $themeDir --state-dir $stateDir --remove --once
    } catch {
      Write-Warning "Live remove failed: $($_.Exception.Message)"
    }
  }

  Stop-CdsInjector

  if ($isolated) {
    $n = Stop-CdsIsolatedCursor -UserDataDir $userDataDir
    Write-Host "Closed $n isolated test process(es). Main Cursor was not touched."
  } else {
    $mainLeft = Get-CursorProcessList
    if ($null -ne $mainLeft -and $mainLeft.Length -gt 0) {
      Stop-CursorProcesses
    }
    if (-not $NoRelaunch) {
      if (-not $cursorExe -or -not (Test-Path -LiteralPath $cursorExe)) {
        throw "Cannot relaunch: Cursor.exe path unknown."
      }
      Write-Host "Relaunching Cursor without CDP ..."
      Start-Process -FilePath $cursorExe | Out-Null
    }
    Write-Host "Restored. Official appearance should be back."
  }

  $sessionPath = Join-Path $stateDir "session.json"
  if (Test-Path $sessionPath) { Remove-Item $sessionPath -Force }
} finally {
  Exit-CdsLock -LockPath $lock
}
