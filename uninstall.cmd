@echo off
setlocal
REM No enabledelayedexpansion on purpose: the wrapper has no !var! use, and with it
REM enabled a '!' in the plugin path (C:\dev\my!proj) would be stripped as an
REM unpaired delayed-expansion token, corrupting PLUGIN_DIR / PLUGIN_SCRIPT.
REM Keep this section ASCII-only (cmd misparses UTF-8 comments as cp936).
set "PLUGIN_DIR=%~dp0"
set "PLUGIN_SCRIPT=%~f0"
if /i "%~1"=="--yes" set "PMCRAFT_AUTO_CONFIRM=1"
if /i "%~1"=="-y" set "PMCRAFT_AUTO_CONFIRM=1"
REM Pass the script path via env var, not inline in the -Command string:
REM a single quote in the path (C:\Users\O'Brien\pmcraft) would truncate the
REM PS single-quoted string, a double quote would break the outer cmd quote
REM pairing, and an ampersand would be treated as a cmd command separator.
REM Keep this section ASCII-only (cmd misparses UTF-8 comments as cp936).
powershell -ExecutionPolicy Bypass -NoProfile -Command "$pluginDir=$env:PLUGIN_DIR; $scriptPath=$env:PLUGIN_SCRIPT; iex ((Get-Content $scriptPath -Raw -Encoding UTF8) -replace '(?s).*##PS##\r?\n','')"
if errorlevel 1 (
    echo If you see this, the uninstall encountered an error.
    echo Check the PowerShell output above for details.
    pause
)
exit /b

##PS##

#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$script:KeyPressed = $false
$script:ExitCode = 0
$script:AutoConfirm = ($env:PMCRAFT_AUTO_CONFIRM -eq "1")
$PluginNames = @("pmcraft-coach", "pmcraft-prompt", "pmcraft-req", "pmcraft-proto", "pmcraft-dev", "pmcraft-infra", "pmcraft-test")

function Write-Step    { param([double]$Step, [string]$Message); Write-Host "Step ${Step}: $Message" -ForegroundColor Yellow }
function Write-Success { param([string]$Message); Write-Host "  OK $Message" -ForegroundColor Green }
function Write-Failure { param([string]$Message); Write-Host "  FAIL $Message" -ForegroundColor Red }
function Write-Info    { param([string]$Message); Write-Host "    $Message" -ForegroundColor Gray }

function Exit-WithPrompt {
    param([string]$Message, [int]$ExitCode = 1)
    Write-Host ""; Write-Failure $Message; Write-Host ""
    Write-Host "Press SPACE or ENTER to close this window..." -ForegroundColor Gray
    $null = [Console]::ReadKey($true)
    $script:KeyPressed = $true
    exit $ExitCode
}

# ⚠️ 镜像函数（Invoke-ClaudeWithTimeout / Exit-WithPrompt / Write-*）：setup.cmd 与 uninstall.cmd
#    各含同一份，无共享文件（两脚本独立自包含），修改任一处必须同步另一处（v2.2.0 已核对一致）。
function Invoke-ClaudeWithTimeout {
    param([string[]]$Arguments, [string]$Label, [int]$TimeoutSeconds = 30, [switch]$Quiet)

    if (-not $Quiet) { Write-Info "Running: claude $($Arguments -join ' ')" }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    # 每个参数加双引号包裹：市场路径含空格（如 C:\Users\John Doe\pmcraft）时不加引号会被 cmd
    # 拆成多个 token，marketplace remove 会操作错误路径。
    # cmd /c 规则：命令行以引号开头时剥离首字符并移除末尾引号，故整体再包一层引号
    # （前缀 '/c "' + 首个 token 自带的前引号 = 两个前引号，后缀同理）。
    # 注意：首 token 必须是可执行文件名 "claude"——若从参数列表开始（如 "plugin"），
    # cmd 剥引号后会把第一个带引号的参数当程序名执行，报 '"plugin"' 不是内部或外部命令。
    $argStr = '"claude" ' + (($Arguments | ForEach-Object { '"' + $_.Replace('"', '""') + '"' }) -join ' ')
    $psi.Arguments = '/c "' + $argStr + '"'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $oldEncoding = [Console]::OutputEncoding
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
    $p = $null
    $output = ""; $errorOut = ""; $exitCode = 0
    try {
        $p = [System.Diagnostics.Process]::Start($psi)
        # 先异步读两个输出流再等待：顺序 ReadToEnd 要等进程退出后才读管道，
        # 子进程输出超过管道缓冲（64KB）时会互相阻塞，把正常进程误判为超时
        $outTask = $p.StandardOutput.ReadToEndAsync()
        $errTask = $p.StandardError.ReadToEndAsync()
        $exited = $p.WaitForExit($TimeoutSeconds * 1000)
        if (-not $exited) {
            $p.Kill()
            Write-Host ""; Write-Failure "$Label timed out after ${TimeoutSeconds}s"
            return $false
        }
        $output = $outTask.Result
        $errorOut = $errTask.Result
        $exitCode = $p.ExitCode
    } finally {
        if ($p -ne $null) { $p.Dispose() }
        [Console]::OutputEncoding = $oldEncoding
    }
    if ($output) { Write-Host $output }
    if ($errorOut -and -not $Quiet) { Write-Host $errorOut }
    if ($exitCode -ne 0) { return $false }
    return $true
}

try {
    Write-Host ""
    Write-Host "=== pmcraft 0.0.1 Uninstall ===" -ForegroundColor Cyan
    Write-Host ""

    # Step 1: Detect plugin directory
    Write-Step 1 "Detecting plugin directory"
    $PluginRoot = $pluginDir.TrimEnd('\')
    Write-Info "Plugin path: $PluginRoot"

    $MarketplaceJson = [System.IO.Path]::Combine($PluginRoot, ".claude-plugin", "marketplace.json")
    if (-not (Test-Path $MarketplaceJson)) {
        Exit-WithPrompt ".claude-plugin/marketplace.json not found. Make sure uninstall.cmd is in the pmcraft root folder"
    }
    $MarketInfo = Get-Content $MarketplaceJson -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Success "Marketplace: $($MarketInfo.name) v$($MarketInfo.version)"
    Write-Host ""

    # Step 2: Check Claude Code CLI
    Write-Step 2 "Checking Claude Code CLI"
    if (-not (Get-Command "claude" -ErrorAction SilentlyContinue)) {
        Exit-WithPrompt "claude command not found. Make sure Claude Code is installed and in PATH"
    }
    $ClaudeVersion = & claude --version 2>$null
    if ($LASTEXITCODE -ne 0) { $ClaudeVersion = "unknown" }
    Write-Success "Claude Code: $ClaudeVersion"
    Write-Host ""

    # Step 3: Check if marketplace is registered
    Write-Step 3 "Checking installation status"
    $SettingsPath = [System.IO.Path]::Combine($env:USERPROFILE, ".claude", "settings.json")
    if (-not (Test-Path $SettingsPath)) {
        Exit-WithPrompt "Nothing to uninstall - Claude Code config not found" 0
    }
    # 容错：settings 可能被手工编辑破坏（JSON 无法解析）——无法确认注册状态时继续执行
    # 卸载（claude plugin 命令会重建正确的 settings.json），不中断、不误报"未安装"
    try {
        $Settings = Get-Content $SettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $MarketSource = $Settings.extraKnownMarketplaces.'pmcraft'.source
    } catch {
        Write-Failure "Settings file unparseable ($SettingsPath): $($_.Exception.Message)"
        Write-Info "Cannot verify registration state - proceeding with uninstall anyway"
        $MarketSource = "unparseable"
    }

    if (-not $MarketSource) {
        Exit-WithPrompt "Nothing to uninstall - pmcraft marketplace is not registered" 0
    }

    Write-Info "pmcraft marketplace is registered"
    Write-Info "Make sure Claude Code is NOT running before continuing."
    if (-not $script:AutoConfirm) {
        Write-Host ""
        Write-Host "  Proceed with uninstall? (Y/N) " -ForegroundColor Yellow -NoNewline
        $resp = Read-Host
        if ($resp -ne "Y" -and $resp -ne "y") { Exit-WithPrompt "Uninstall cancelled" 0 }
    } else {
        Write-Success "--yes passed. Skipping confirmation."
    }
    Write-Host ""

    # Step 4: Disable plugins
    Write-Step 4 "Disabling plugins"
    $disableFailures = @()
    foreach ($name in $PluginNames) {
        $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "disable", "$name@pmcraft") -Label "Disable $name" -Quiet
        if (-not $ok) { $disableFailures += $name; Write-Info "  $name may not be enabled" }
        else           { Write-Info "  $name disabled" }
    }
    if ($disableFailures.Count -eq 0) { Write-Success "All plugins disabled" }
    else                              { Write-Failure "$($disableFailures.Count) plugins could not be disabled: $($disableFailures -join ', ')" }
    Write-Host ""

    # Step 5: Uninstall plugins
    Write-Step 5 "Uninstalling plugins"
    $uninstallFailures = @()
    foreach ($name in $PluginNames) {
        $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "uninstall", "$name@pmcraft") -Label "Uninstall $name" -Quiet
        if (-not $ok) { $uninstallFailures += $name; Write-Info "  $name may not be installed" }
        else           { Write-Info "  $name uninstalled" }
    }
    if ($uninstallFailures.Count -eq 0) { Write-Success "All plugins uninstalled" }
    else                                 { Write-Failure "$($uninstallFailures.Count) plugins could not be uninstalled: $($uninstallFailures -join ', ')" }
    Write-Host ""

    # Step 6: Remove marketplace（仅当已无插件实际残留——不能仅以 uninstall 命令失败数判断：
    # 对已卸载/未安装的插件再次 uninstall 同样可能非零退出，首次运行中途失败后重跑时失败计数
    # 会永远 >0，市场就再也无法移除（死锁）。以"命令失败 + 该插件缓存目录仍存在"双重条件
    # 判断真实残留：失败但缓存已不存在 → 视为"可能未安装"，不阻塞市场移除；失败且缓存仍在 →
    # 视为真实残留，保留市场供手动重试。全成功路径（失败数为 0）行为与原来完全一致。
    Write-Step 6 "Removing marketplace"
    $CachePath = [System.IO.Path]::Combine($env:USERPROFILE, ".claude", "plugins", "cache", "pmcraft")
    $stillInstalled = @()
    foreach ($name in $uninstallFailures) {
        if (Test-Path (Join-Path $CachePath $name)) { $stillInstalled += $name }
    }
    if ($stillInstalled.Count -gt 0) {
        Write-Host "  WARNING: $($stillInstalled.Count) plugin(s) failed to uninstall and still have cache present. Marketplace NOT removed." -ForegroundColor Yellow
        foreach ($f in $stillInstalled) { Write-Info "  Retry first: claude plugin uninstall $f@pmcraft" }
        Write-Info "  After all plugins are uninstalled, remove the marketplace: claude plugin marketplace remove pmcraft"
    } else {
        $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "marketplace", "remove", "pmcraft") -Label "Remove marketplace"
        if (-not $ok) {
            Exit-WithPrompt "Marketplace removal failed."
        }
        Write-Success "Marketplace removed"
    }
    Write-Host ""

    # Step 7: Clean cache（真实残留存在时跳过——缓存是已装插件的文件源，卸载未完成前删除会使插件损坏）
    Write-Step 7 "Cleaning cache"
    if ($stillInstalled.Count -gt 0) {
        Write-Info "Skipped: cache kept because $($stillInstalled.Count) plugin(s) still installed"
    } elseif (Test-Path $CachePath) {
        # 注意：不能用 -ErrorAction SilentlyContinue 包 try/catch——SilentlyContinue 吞掉非终止
        # 错误后 catch 分支永远不执行（死代码）。移除该参数让 catch 真正生效并显示失败原因。
        try {
            Remove-Item -Path $CachePath -Recurse -Force
            Write-Success "Cache cleaned"
        } catch {
            Write-Info "Cache cleanup skipped (non-critical): $($_.Exception.Message)"
        }
    } else {
        Write-Info "No cache to clean"
    }
    Write-Host ""

    # Done
    Write-Host "========================================" -ForegroundColor Cyan
    $totalFailures = $disableFailures.Count + $uninstallFailures.Count
    if ($totalFailures -eq 0) {
        Write-Host "  Uninstall complete!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "The plugins and their marketplace have been fully removed." -ForegroundColor Yellow
    } else {
        # 退出码只反映真实残留：命令失败但已无插件残留（"可能未安装"类失败）不算卸载未完成，
        # 供 --yes 静默模式/自动化脚本正确判断（全部移除 → 0，仍有残留 → 1）
        if ($stillInstalled.Count -gt 0) { $script:ExitCode = 1 }
        Write-Host "  Uninstall finished with $totalFailures plugin failure(s)!" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        # 手动重试指引以实际残留（缓存目录存在）为准：已卸载/未安装的插件再 uninstall 必然失败，
        # 按 $uninstallFailures 列出会给出永远失败的重试命令；市场已移除时也不应再提示移除市场
        if ($stillInstalled.Count -gt 0) {
            Write-Host "Some plugins still have cache present. Run manually:" -ForegroundColor Red
            foreach ($f in $stillInstalled) { Write-Host "  claude plugin uninstall $f@pmcraft" -ForegroundColor Red }
            Write-Host "  Then remove the marketplace: claude plugin marketplace remove pmcraft" -ForegroundColor Yellow
        } else {
            Write-Host "  All plugins have been removed; the marketplace and cache are already cleaned." -ForegroundColor Gray
        }
        if ($disableFailures.Count -gt 0 -and $stillInstalled.Count -eq 0) {
            Write-Host "  (disable failed for: $($disableFailures -join ', ') — plugins were uninstalled anyway)" -ForegroundColor Gray
        }
    }
    Write-Host "Project files (brief/prd/prototype etc.) are untouched." -ForegroundColor Gray
    Write-Host ""
    Write-Host "To reinstall later, place the pmcraft folder and double-click setup.cmd" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Press SPACE or ENTER to close this window..." -ForegroundColor Gray
    $null = [Console]::ReadKey($true)
    $script:KeyPressed = $true
}
catch {
    $script:ExitCode = 1
    Write-Host ""
    Write-Host "  Unexpected error:" -ForegroundColor Red
    Write-Host "    $_" -ForegroundColor Red
    Write-Host "    Line: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Gray
}
finally {
    if (-not $script:KeyPressed) {
        Write-Host ""
        Write-Host "Press SPACE or ENTER to close this window..." -ForegroundColor Gray
        $null = [Console]::ReadKey($true)
    }
}

# 失败时以非零退出码结束，供 --yes 静默模式/自动化脚本判断卸载是否真正完成
exit $script:ExitCode
