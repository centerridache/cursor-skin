#Requires -Version 5.1
<#
.SYNOPSIS
  Verify Cursor Dream Skin markers on live CDP workbench targets.
#>
param(
  [int]$Port = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "common-windows.ps1")

$root = Get-CdsRoot
$themeDir = Get-CdsThemeDir -Root $root
$stateDir = Get-CdsStateDir
$node = Get-NodeExe

if ($Port -le 0) {
  $state = Read-CdsSessionState
  if ($state -and $state.port) {
    $Port = [int]$state.port
  } else {
    $Port = 9342
  }
}

if (-not (Test-CdsPortOpen -Port $Port)) {
  Write-Error "CDP port $Port is not open. Start with scripts\start-dream-skin.ps1 first."
  exit 1
}

Write-Host "Verifying skin on 127.0.0.1:$Port ..."
& $node (Join-Path $PSScriptRoot "injector.mjs") --port $Port --theme-dir $themeDir --state-dir $stateDir --verify
$code = $LASTEXITCODE
if ($code -ne 0) {
  Write-Error "Verification failed (exit $code). Cursor DOM may have changed — see docs\SELECTORS.md"
  exit $code
}
Write-Host "OK: workbench targets responded with expected markers."
exit 0
