@echo off
setlocal
REM No enabledelayedexpansion on purpose: the wrapper has no !var! use, and with it
REM enabled a '!' in the plugin path would be stripped as an unpaired token.
REM Keep this section ASCII-only (cmd misparses UTF-8 comments as cp936).
REM Release gate: double-click before packaging/publishing a new version.
set "PLUGIN_SCRIPT=%~f0"
REM Same self-extracting pattern as setup.cmd/uninstall.cmd (##PS## split).
powershell -ExecutionPolicy Bypass -NoProfile -Command "$scriptPath=$env:PLUGIN_SCRIPT; iex ((Get-Content $scriptPath -Raw -Encoding UTF8) -replace '(?s).*##PS##\r?\n','')"
if errorlevel 1 (
    echo [release-check] Integrity check FAILED. See PowerShell output above.
    pause
)
exit /b

##PS##

#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$script:Issues = 0
# iex 上下文中 MyInvocation 不可用，根目录从环境变量传入的脚本路径派生
$root = Split-Path -Parent $scriptPath

Write-Host ""
Write-Host "=== pmcraft Release Check ===" -ForegroundColor Cyan
Write-Host "Root: $root"
Write-Host ""

# 1. CRLF check: cmd.exe misparses LF-only batch files with blocks (command
#    lines get torn apart) -> scripts die instantly with no pause. This bit
#    2.3.0 (setup.cmd/uninstall.cmd saved as LF, double-click = flash crash).
Write-Host "Checking .cmd/.bat line endings (must be CRLF)..." -ForegroundColor Yellow
$batchFiles = @(Get-ChildItem -Path $root -Recurse -Include "*.cmd", "*.bat" -File -ErrorAction SilentlyContinue)
$badLineEndings = @()
foreach ($f in $batchFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $hasBareLf = $false
    for ($i = 0; $i -lt $bytes.Length; $i++) {
        if ($bytes[$i] -eq 0x0A) {
            if ($i -eq 0 -or $bytes[$i - 1] -ne 0x0D) { $hasBareLf = $true; break }
        }
    }
    if ($hasBareLf) { $badLineEndings += $f.FullName }
}
if ($badLineEndings.Count -gt 0) {
    foreach ($p in $badLineEndings) { Write-Host "  FAIL LF line endings (will flash-crash on double-click): $p" -ForegroundColor Red }
    $script:Issues++
} else {
    Write-Host "  OK $($batchFiles.Count) batch files all CRLF" -ForegroundColor Green
}
Write-Host ""

# 2. JSON check: unparseable plugin.json / marketplace.json / hooks.json makes
#    Claude Code silently fail to load the plugin (setup cannot detect it).
Write-Host "Checking .json files are parseable..." -ForegroundColor Yellow
$jsonFiles = @(Get-ChildItem -Path $root -Recurse -Include "*.json" -File -ErrorAction SilentlyContinue)
$badJson = @()
foreach ($f in $jsonFiles) {
    try { Get-Content -Path $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null }
    catch { $badJson += ("{0}: {1}" -f $f.FullName, $_.Exception.Message) }
}
if ($badJson.Count -gt 0) {
    foreach ($p in $badJson) { Write-Host "  FAIL Unparseable JSON: $p" -ForegroundColor Red }
    $script:Issues++
} else {
    Write-Host "  OK $($jsonFiles.Count) JSON files all parseable" -ForegroundColor Green
}
Write-Host ""

# 3. Hooks chain: all four files are required - hooks.json registers the hook,
#    run-hook.cmd resolves the hook scripts from the same directory, and the
#    two scripts are what hooks.json actually runs. Missing any of them =
#    routing brain dead (keep the file list in sync with setup.cmd Step 8).
Write-Host "Checking hooks runner files exist..." -ForegroundColor Yellow
$hooksRunner = Join-Path $root "pmcraft-infra\hooks\run-hook.cmd"
$hooksManifest = Join-Path $root "pmcraft-infra\hooks\hooks.json"
$hooksScript = Join-Path $root "pmcraft-infra\hooks\session-start"
$hooksGuardScript = Join-Path $root "pmcraft-infra\hooks\guard-session-reset"
$hooksMissing = @(@($hooksManifest, $hooksRunner, $hooksScript, $hooksGuardScript) | Where-Object { -not (Test-Path $_) })
if ($hooksMissing.Count -gt 0) {
    foreach ($p in $hooksMissing) { Write-Host "  FAIL missing hook file: $p" -ForegroundColor Red }
    Write-Host "    need hooks.json + run-hook.cmd + session-start + guard-session-reset" -ForegroundColor Red
    $script:Issues++
} else {
    Write-Host "  OK hooks files consistent" -ForegroundColor Green
}
Write-Host ""

# Summary: exit 1 on any issue so the cmd wrapper pauses.
Write-Host "========================================" -ForegroundColor Cyan
if ($script:Issues -eq 0) {
    Write-Host "  Release check PASSED" -ForegroundColor Green
    Write-Host "  ($($batchFiles.Count) batch files, $($jsonFiles.Count) JSON files)"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press SPACE or ENTER to close this window..." -ForegroundColor Gray
    $null = [Console]::ReadKey($true)
} else {
    Write-Host "  Release check FAILED ($script:Issues problem(s))" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Fix the items above (line endings: convert to CRLF, e.g. re-save with a Windows editor)"
    Write-Host "  then rerun this check."
}
exit $script:Issues
