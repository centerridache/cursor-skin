#Requires -Version 5.1
<#
.SYNOPSIS
  Launch Cursor with loopback CDP and apply Cursor Dream Skin.
.PARAMETER RestartExisting
  If Cursor is already running, stop it and relaunch with CDP (affects your main session).
.PARAMETER TestWindow
  Open a separate Cursor window with an isolated profile. Does not touch your current Cursor.
.PARAMETER Port
  Preferred CDP port (default 9342). Scans upward if occupied.
.PARAMETER Once
  Inject once and exit (no watch daemon).
#>
param(
  [switch]$RestartExisting,
  [switch]$TestWindow,
  [int]$Port = 9342,
  [switch]$Once
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "common-windows.ps1")

$launcherLog = Join-Path (Get-CdsStateDir) "launcher-main.log"
function Write-CdsLauncherLog([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date).ToString("o"), $Message
  Add-Content -LiteralPath $launcherLog -Value $line -Encoding UTF8
}

$lock = $null
try {
  if (Test-Path -LiteralPath $launcherLog) {
    Remove-Item -LiteralPath $launcherLog -Force -ErrorAction SilentlyContinue
  }
  Write-CdsLauncherLog "start-dream-skin begin RestartExisting=$RestartExisting TestWindow=$TestWindow Port=$Port"

  $lock = Enter-CdsLock
  $root = Get-CdsRoot
  $themeDir = Get-CdsThemeDir -Root $root
  $stateDir = Get-CdsStateDir
  $node = Get-NodeExe
  $cursorExe = Find-CursorExe
  $theme = Get-Content (Join-Path $themeDir "theme.json") -Raw -Encoding UTF8 | ConvertFrom-Json

  Write-Host "Cursor: $cursorExe"
  Write-Host "Theme:  $($theme.id) ($($theme.name))"
  Write-Host "State:  $stateDir"
  Write-CdsLauncherLog "cursorExe=$cursorExe theme=$($theme.id)"

  $userDataDir = ""
  $isolated = $false

  if ($TestWindow) {
    $isolated = $true
    $userDataDir = Get-CdsTestProfileDir
    Write-Host "Mode:   TestWindow (isolated profile)"
    Write-Host "Profile:$userDataDir"
    $settingsPath = Initialize-CdsTestProfileSettings -UserDataDir $userDataDir
    Write-Host "Seeded: $settingsPath (transparent titleBar)"

    # Stop previous test window / injector only — leave main Cursor alone
    Stop-CdsInjector
    [void](Stop-CdsIsolatedCursor -UserDataDir $userDataDir)
    Start-Sleep -Milliseconds 500
  } else {
    $existing = Get-CursorProcessList
    if ($null -ne $existing -and $existing.Length -gt 0) {
      if (-not $RestartExisting) {
        throw "Cursor is already running ($($existing.Length) process(es)). Use -TestWindow to open a separate test window, or -RestartExisting to relaunch your main Cursor under CDP."
      }
      Write-Host "Mode:   Main session (will restart Cursor — save work first)"
      Write-CdsLauncherLog "stopping existing Cursor count=$($existing.Length)"
      Stop-CdsInjector
      Stop-CursorProcesses
      if (-not (Wait-CursorGone -TimeoutSec 10)) {
        throw "Cursor is still running after stop. Close it from Task Manager and retry Main."
      }
      # Second sweep in case updater respawned a non-CDP instance
      Start-Sleep -Seconds 1
      $again = Get-CursorProcessList
      if ($null -ne $again -and $again.Length -gt 0) {
        Write-CdsLauncherLog "respawn detected; stopping again"
        Stop-CursorProcesses
      }
    } else {
      Stop-CdsInjector
    }
  }

  if (-not (Test-CdsPortFree -Port $Port)) {
    $Port = Find-CdsFreePort -Preferred $Port
    Write-Host "Preferred port busy; using $Port"
  }

  $cursorArgs = [System.Collections.Generic.List[string]]::new()
  $cursorArgs.Add("--remote-debugging-port=$Port")
  if ($isolated) {
    $cursorArgs.Add("--user-data-dir=$userDataDir")
    $cursorArgs.Add("--disable-workspace-trust")
  }

  Write-Host "Starting Cursor with CDP port $Port ..."
  Write-CdsLauncherLog "starting Cursor args=$($cursorArgs -join ' ')"
  $proc = Start-Process -FilePath $cursorExe -ArgumentList $cursorArgs.ToArray() -PassThru
  if (-not $proc) { throw "Failed to start Cursor" }

  if (-not (Wait-CdsHttpJson -Port $Port -TimeoutSec 90)) {
    throw "CDP endpoint http://127.0.0.1:$Port did not become ready.`nCursor may have opened without the debug port (single-instance handoff). Close all Cursor windows from Task Manager, then use the Main shortcut again."
  }
  Write-Host "CDP ready on 127.0.0.1:$Port"
  Write-CdsLauncherLog "CDP ready port=$Port"

  $injector = Join-Path $PSScriptRoot "injector.mjs"
  $settingsPath = if ($isolated -and $userDataDir) {
    Join-Path $userDataDir "User\settings.json"
  } else {
    Join-Path $env:APPDATA "Cursor\User\settings.json"
  }

  $nodeArgs = @(
    "`"$injector`"",
    "--port", "$Port",
    "--theme-dir", "`"$themeDir`"",
    "--state-dir", "`"$stateDir`"",
    "--settings-path", "`"$settingsPath`""
  ) -join " "
  if ($Once) { $nodeArgs = "$nodeArgs --once" }

  $logPath = Join-Path $stateDir "injector.log"
  if (Test-Path $logPath) { Remove-Item $logPath -Force -ErrorAction SilentlyContinue }
  Write-Host "Starting injector (log: $logPath) ..."
  Write-Host "Settings: $settingsPath"

  $iproc = Start-Process -FilePath $node -ArgumentList $nodeArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru
  if (-not $iproc) { throw "Failed to start injector" }

  Start-Sleep -Seconds 5
  if ($iproc.HasExited -and -not $Once) {
    $tail = ""
    if (Test-Path $logPath) { $tail = Get-Content $logPath -Raw -ErrorAction SilentlyContinue }
    throw "Injector exited early (code $($iproc.ExitCode)). Log:`n$tail"
  }

  Save-CdsSessionState -Port $Port -InjectorPid $iproc.Id -CursorPid $proc.Id -CursorExe $cursorExe -ThemeId $theme.id -Isolated $isolated -UserDataDir $userDataDir | Out-Null
  Write-CdsLauncherLog "ok injectorPid=$($iproc.Id) cursorPid=$($proc.Id) isolated=$isolated"

  Write-Host ""
  Write-Host "Cursor Dream Skin is active."
  Write-Host "  Mode     : $(if ($isolated) { 'TestWindow (isolated)' } else { 'Main session' })"
  Write-Host "  CDP port : $Port"
  Write-Host "  Injector : PID $($iproc.Id)"
  Write-Host "  Verify   : powershell -NoProfile -File scripts\verify-dream-skin.ps1"
  Write-Host "  Theme HUD: click the Dream Skin chip inside Cursor"
  if ($isolated) {
    Write-Host "  Close    : powershell -NoProfile -File scripts\restore-dream-skin.ps1"
    Write-Host "             (only closes the test window; your main Cursor stays)"
  } else {
    Write-Host "  Restore  : powershell -NoProfile -File scripts\restore-dream-skin.ps1"
  }

  if ($Once) {
    Wait-Process -Id $iproc.Id
    exit $iproc.ExitCode
  }
} catch {
  $err = $_ | Out-String
  try { Write-CdsLauncherLog "FAIL $err" } catch { }
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Details logged to: $launcherLog"
  # Visible when launched from shortcut (otherwise window closes instantly)
  try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    [System.Windows.Forms.MessageBox]::Show(
      ("Cursor Dream Skin (Main) failed:`n`n{0}`n`nLog:`n{1}" -f $_.Exception.Message, $launcherLog),
      "Cursor Dream Skin",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  } catch { }
  exit 1
} finally {
  Exit-CdsLock -LockPath $lock
}
