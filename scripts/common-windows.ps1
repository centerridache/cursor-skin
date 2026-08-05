#Requires -Version 5.1
<#
.SYNOPSIS
  Shared helpers for Cursor Dream Skin on Windows.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-CdsRoot {
  if ($PSScriptRoot) {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  }
  return (Get-Location).Path
}

function Get-CdsStateDir {
  $dir = Join-Path $env:LOCALAPPDATA "CursorDreamSkin"
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  return $dir
}

function Get-CdsThemeDir {
  param([string]$Root = (Get-CdsRoot))
  return (Join-Path $Root "assets")
}

function Find-CursorExe {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\cursor\Cursor.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Cursor\Cursor.exe"),
    "C:\Program Files\Cursor\Cursor.exe",
    "C:\Program Files (x86)\Cursor\Cursor.exe"
  )

  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) { return (Resolve-Path -LiteralPath $c).Path }
  }

  # Running process path (custom installs)
  $proc = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($proc -and $proc.Path -and (Test-Path -LiteralPath $proc.Path)) {
    return $proc.Path
  }

  # cursor.cmd on PATH -> ../.. from resources/app/bin
  $cmd = Get-Command cursor.cmd -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    $binDir = Split-Path -Parent $cmd.Source
    # .../resources/app/bin -> ../../../Cursor.exe
    $guess = Join-Path $binDir "..\..\..\Cursor.exe"
    if (Test-Path -LiteralPath $guess) {
      return (Resolve-Path -LiteralPath $guess).Path
    }
  }

  throw "Cursor.exe not found. Install Cursor or start it once so the process path is discoverable."
}

function Test-CdsPortFree {
  param([int]$Port)
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

function Find-CdsFreePort {
  param(
    [int]$Preferred = 9342,
    [int]$ScanCount = 40
  )
  if (Test-CdsPortFree -Port $Preferred) { return $Preferred }
  for ($i = 1; $i -le $ScanCount; $i++) {
    $p = $Preferred + $i
    if (Test-CdsPortFree -Port $p) { return $p }
  }
  throw "No free loopback port near $Preferred"
}

function Test-CdsPortOpen {
  param([int]$Port)
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400)
    if ($ok -and $c.Connected) {
      $c.Close()
      return $true
    }
    $c.Close()
    return $false
  } catch {
    return $false
  }
}

function Get-CursorProcesses {
  # Stream processes; prefer Get-CursorProcessList for StrictMode-safe Length/Count.
  Get-Process -Name "Cursor" -ErrorAction SilentlyContinue |
    Where-Object { $null -ne $_ -and $_.Id }
}

function Get-CursorProcessList {
  # Always a real Object[] (including Length -eq 0). Plain `return @()` unwraps to $null.
  $buf = New-Object System.Collections.ArrayList
  foreach ($p in (Get-Process -Name "Cursor" -ErrorAction SilentlyContinue)) {
    if ($null -ne $p -and $p.Id) { [void]$buf.Add($p) }
  }
  Write-Output -NoEnumerate @($buf.ToArray())
}

function Stop-CursorProcesses {
  # Cursor is single-instance: if anything respawns without CDP, later Start-Process
  # just focuses that window and our --remote-debugging-port never binds.
  $deadline = (Get-Date).AddSeconds(35)
  $round = 0
  while ((Get-Date) -lt $deadline) {
    $procs = Get-CursorProcessList
    if ($null -eq $procs -or $procs.Length -eq 0) {
      # brief settle — Restart Manager / updater sometimes respawns once
      Start-Sleep -Milliseconds 800
      $again = Get-CursorProcessList
      if ($null -eq $again -or $again.Length -eq 0) { return }
      continue
    }
    $round++
    Write-Host "Stopping $($procs.Length) Cursor process(es) (round $round)..."
    foreach ($p in $procs) {
      if ($null -eq $p -or -not $p.Id) { continue }
      try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { }
    }
    Start-Sleep -Milliseconds 500
  }
  $leftIds = New-Object System.Collections.ArrayList
  foreach ($p in (Get-CursorProcessList)) {
    if ($null -ne $p -and $p.Id) { [void]$leftIds.Add($p.Id) }
  }
  throw "Cursor processes did not exit in time (still running: $($leftIds -join ', ')). Close Cursor manually and retry."
}

function Wait-CursorGone {
  param([int]$TimeoutSec = 15)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $procs = Get-CursorProcessList
    if ($null -eq $procs -or $procs.Length -eq 0) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Get-NodeExe {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js not found on PATH. Install Node 18+ from https://nodejs.org/"
  }
  $ver = & node -v
  Write-Host "Using Node $ver"
  return $node.Source
}

function Get-CdsTestProfileDir {
  $dir = Join-Path (Get-CdsStateDir) "test-profile"
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  return $dir
}

function Initialize-CdsTestProfileSettings {
  param([string]$UserDataDir = (Get-CdsTestProfileDir))
  $userDir = Join-Path $UserDataDir "User"
  if (-not (Test-Path $userDir)) {
    New-Item -ItemType Directory -Force -Path $userDir | Out-Null
  }
  $settingsPath = Join-Path $userDir "settings.json"

  # Keep this file simple (PS 5.1 friendly). Transparent title bar removes the
  # solid white Windows caption overlay plate on Agents / custom titlebar.
  $json = @'
{
  "window.titleBarStyle": "custom",
  "workbench.colorTheme": "Cursor Dark",
  "workbench.colorCustomizations": {
    "titleBar.activeBackground": "#00000000",
    "titleBar.inactiveBackground": "#00000000",
    "titleBar.border": "#00000000",
    "commandCenter.background": "#00000000"
  }
}
'@
  Set-Content -LiteralPath $settingsPath -Value $json.Trim() -Encoding UTF8
  return $settingsPath
}

function Save-CdsSessionState {
  param(
    [int]$Port,
    [int]$InjectorPid,
    [int]$CursorPid,
    [string]$CursorExe,
    [string]$ThemeId,
    [bool]$Isolated = $false,
    [string]$UserDataDir = ""
  )
  $stateDir = Get-CdsStateDir
  $obj = [ordered]@{
    port        = $Port
    injectorPid = $InjectorPid
    cursorPid   = $CursorPid
    cursorExe   = $CursorExe
    themeId     = $ThemeId
    isolated    = [bool]$Isolated
    userDataDir = $UserDataDir
    startedAt   = (Get-Date).ToString("o")
  }
  $path = Join-Path $stateDir "session.json"
  ($obj | ConvertTo-Json) | Set-Content -Path $path -Encoding UTF8
  return $path
}

function Read-CdsSessionState {
  $path = Join-Path (Get-CdsStateDir) "session.json"
  if (-not (Test-Path $path)) { return $null }
  return (Get-Content -Path $path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Stop-CdsInjector {
  $state = Read-CdsSessionState
  $stateDir = Get-CdsStateDir
  $injectorStatePath = Join-Path $stateDir "injector-state.json"

  $pids = @()
  if ($state -and $state.injectorPid) { $pids += [int]$state.injectorPid }
  if (Test-Path $injectorStatePath) {
    try {
      $is = Get-Content $injectorStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($is.pid) { $pids += [int]$is.pid }
    } catch { }
  }

  foreach ($procId in ($pids | Select-Object -Unique)) {
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p) {
      Write-Host "Stopping injector PID $procId"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Stop-CdsIsolatedCursor {
  param([string]$UserDataDir)
  if (-not $UserDataDir) { return 0 }

  $stopped = 0
  Get-CimInstance Win32_Process -Filter "Name = 'Cursor.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = [string]$_.CommandLine
    if ($cmd -and ($cmd.IndexOf($UserDataDir, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
      Write-Host "Stopping isolated Cursor PID $($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      $stopped++
    }
  }
  # Fallback: match profile folder name if path separators differ
  if ($stopped -eq 0) {
    $alt = $UserDataDir -replace '\\', '/'
    Get-CimInstance Win32_Process -Filter "Name = 'Cursor.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
      $cmd = [string]$_.CommandLine
      if ($cmd -and (
          $cmd.IndexOf($alt, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
          $cmd -match 'CursorDreamSkin[\\/]+test-profile'
        )) {
        Write-Host "Stopping isolated Cursor PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $stopped++
      }
    }
  }
  return $stopped
}

function Wait-CdsHttpJson {
  param(
    [int]$Port,
    [int]$TimeoutSec = 60
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $url = "http://127.0.0.1:$Port/json/version"
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Stop-CdsStaleLaunchers {
  # Hidden Main/Test launchers can hang (e.g. waiting on Cursor kill) and hold op.lock forever.
  $self = $PID
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessId -ne $self -and
      $_.CommandLine -and
      ($_.CommandLine -match 'start-dream-skin\.ps1|restore-dream-skin\.ps1')
    } |
    ForEach-Object {
      Write-Host "Stopping stuck Dream Skin launcher PID $($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Enter-CdsLock {
  Stop-CdsStaleLaunchers
  $lockPath = Join-Path (Get-CdsStateDir) "op.lock"
  if (Test-Path $lockPath) {
    $holderPid = 0
    try {
      $raw = (Get-Content -LiteralPath $lockPath -Raw -ErrorAction SilentlyContinue)
      if ($raw) { [void][int]::TryParse($raw.Trim(), [ref]$holderPid) }
    } catch { }

    $holderAlive = $false
    if ($holderPid -gt 0) {
      $holderAlive = [bool](Get-Process -Id $holderPid -ErrorAction SilentlyContinue)
    }

    $age = (Get-Date) - (Get-Item $lockPath).LastWriteTime
    # Stale if: no PID, holder process dead, or lock older than 90s (crash mid-restart).
    if (-not $holderAlive -or $age.TotalSeconds -gt 90) {
      Write-Host "Clearing stale Dream Skin lock (pid=$holderPid alive=$holderAlive age=$([int]$age.TotalSeconds)s)"
      Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
    } else {
      throw "Another Cursor Dream Skin operation is in progress (PID $holderPid). Wait a few seconds, or delete:`n$lockPath"
    }
  }
  Set-Content -Path $lockPath -Value $PID -Encoding ASCII
  return $lockPath
}

function Exit-CdsLock {
  param([string]$LockPath)
  if ($LockPath -and (Test-Path $LockPath)) {
    Remove-Item $LockPath -Force -ErrorAction SilentlyContinue
  }
}
