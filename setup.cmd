@echo off
setlocal
REM No enabledelayedexpansion on purpose: the wrapper has no !var! use, and with it
REM enabled a '!' in the plugin path (C:\dev\my!proj) would be stripped as an
REM unpaired delayed-expansion token, corrupting PLUGIN_DIR / PLUGIN_SCRIPT.
REM Keep this section ASCII-only (cmd misparses UTF-8 comments as cp936).
set "PLUGIN_DIR=%~dp0"
set "PLUGIN_SCRIPT=%~f0"
REM Pass the script path via env var, not inline in the -Command string:
REM a single quote in the path (C:\Users\O'Brien\pmcraft) would truncate the
REM PS single-quoted string, a double quote would break the outer cmd quote
REM pairing, and an ampersand would be treated as a cmd command separator.
REM Keep this section ASCII-only (cmd misparses UTF-8 comments as cp936).
powershell -ExecutionPolicy Bypass -NoProfile -Command "$pluginDir=$env:PLUGIN_DIR; $scriptPath=$env:PLUGIN_SCRIPT; iex ((Get-Content $scriptPath -Raw -Encoding UTF8) -replace '(?s).*##PS##\r?\n','')"
if errorlevel 1 (
    echo If you see this, the setup encountered an error.
    echo Check the PowerShell output above for details.
    pause
)
exit /b

##PS##

#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$IsInstall = $false
$script:KeyPressed = $false
$script:ExitCode = 0
$rollbackActions = @()
$PluginNames = @("pmcraft-coach", "pmcraft-prompt", "pmcraft-req", "pmcraft-proto", "pmcraft-dev", "pmcraft-infra", "pmcraft-test")

function Write-Step    { param([double]$Step, [string]$Message); Write-Host "Step ${Step}: $Message" -ForegroundColor Yellow }
function Write-Success { param([string]$Message); Write-Host "  OK $Message" -ForegroundColor Green }
function Write-Failure { param([string]$Message); Write-Host "  FAIL $Message" -ForegroundColor Red }
function Write-Info    { param([string]$Message); Write-Host "    $Message" -ForegroundColor Gray }

# 共享库分发：marketplace 根 _shared/scripts（唯一副本）→ 每个插件 cache 目录 _shared/scripts
# 脚本运行时从自身位置向上搜索 _shared/scripts/lib，源环境找到 marketplace 根、cache 环境找到分发副本。
# 注意：目标 _shared/scripts 已存在时（如 proto 自带 lib），必须复制源"内容"而非源目录本身，
# 否则 Copy-Item 会把源目录嵌套成 target/scripts/scripts（PowerShell 经典坑）。
function Sync-SharedLibrary {
    param([string]$PluginRoot)
    $sharedSrc = Join-Path $PluginRoot "_shared\scripts"
    if (-not (Test-Path $sharedSrc)) {
        Write-Info "Shared library source not found, skipped: $sharedSrc"
        return
    }
    $CacheRoot = Join-Path $env:USERPROFILE ".claude\plugins\cache\pmcraft"
    foreach ($name in $PluginNames) {
        $pluginCache = Join-Path $CacheRoot $name
        if (-not (Test-Path $pluginCache)) { continue }
        Get-ChildItem -Path $pluginCache -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
            ForEach-Object {
                $target = Join-Path $_.FullName "_shared\scripts"
                if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
                Copy-Item -Path (Join-Path $sharedSrc "*") -Destination $target -Recurse -Force
                # 剪枝：源中已删除的文件从缓存副本中清除（Copy-Item 只覆盖同名文件、不删多余文件）
                $srcRel = @(Get-ChildItem -Path $sharedSrc -Recurse -File -ErrorAction SilentlyContinue |
                    ForEach-Object { $_.FullName.Substring($sharedSrc.Length).TrimStart('\') })
                $staleFiles = @(Get-ChildItem -Path $target -Recurse -File -ErrorAction SilentlyContinue |
                    Where-Object { $_.FullName.Substring($target.Length).TrimStart('\') -notin $srcRel })
                foreach ($stale in $staleFiles) {
                    Remove-Item -Path $stale.FullName -Force -ErrorAction SilentlyContinue
                }
                # 清理源中已不存在的空目录（子目录先删，排序按路径长度降序）
                Get-ChildItem -Path $target -Recurse -Directory -ErrorAction SilentlyContinue |
                    Sort-Object { $_.FullName.Length } -Descending |
                    ForEach-Object { if (-not (Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue)) { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue } }
                if ($staleFiles.Count -gt 0) { Write-Info "  Pruned $($staleFiles.Count) stale shared files: $target" }
                Write-Info "  Shared library synced: $($_.FullName)"
            }
    }
}

# 验证插件缓存中是否已出现源 plugin.json 声明的版本目录。
# 升级成功的判据必须是"install 真的把新内容复制进了缓存"，而非仅看退出码——
# install 对已安装插件可能 no-op 且退出码 0，只靠退出码会误判成功并删掉回滚备份。
# 缓存目录布局：{cache}\pmcraft\{name}\{版本目录}
function Test-CacheVersion {
    param([string]$PluginRoot, [string]$Name, [string]$CacheRoot)
    $Manifest = Join-Path $PluginRoot "$Name\.claude-plugin\plugin.json"
    $expectedVersion = $null
    try {
        $expectedVersion = (Get-Content $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
    } catch {
        Write-Failure "Cannot read source version manifest: $Manifest"
    }
    $cacheDir = Join-Path $CacheRoot $Name
    if (-not (Test-Path $cacheDir)) { return $false }
    $versionDirs = @(Get-ChildItem -Path $cacheDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' })
    if ($versionDirs.Count -eq 0) { return $false }
    # 清单读不到时退化为"存在任意版本目录"（仍能证明 install 复制过，比仅退出码可靠）
    if (-not $expectedVersion) { return $true }
    return @($versionDirs | Where-Object { $_.Name -eq $expectedVersion }).Count -gt 0
}

function Clear-LegacyPermissions {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        Write-Info "Not found, skipped: $Path"
        return
    }
    # 容错：settings 文件可能被手工编辑破坏（JSON 无法解析）。损坏时跳过并警告，不中断整个 setup。
    try {
        $SettingsJson = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Failure "Skipped $Path (unparseable JSON): $($_.Exception.Message)"
        return
    }
    $Before = @($SettingsJson.permissions.allow)
    # pm-gym 相关 + 退役插件谱系：product-ai-plugin（含过渡名 product-def-plugin）→ product-req-plugin（旧市场 my-market）
    # + 旧独立技能时代残留：Skill(prd-gen)、Skill(prd-revise)、Skill(consistency-check)
    # 注意：旧独立 prepare-dev 的清理职责已移交 Step 9c（Clear-PrepareDevPermissions），不再在此处处理；
    #       独立技能 changelog-update / skill-optimizer / update-config / web-design-engineer 是活跃技能，不在清理名单。
    $LegacyPattern = 'pm-gym|pm_gym|pm-gym-logs|product-ai-plugin|product-def-plugin|product-req-plugin|my-market|Skill\((consistency-check|prd-gen|prd-revise)'
    $After = @($Before | Where-Object { $_ -notmatch $LegacyPattern })
    if ($After.Count -lt $Before.Count) {
        Copy-Item $Path "$Path.legacy-backup" -Force
        $SettingsJson.permissions.allow = $After
        # 无 BOM UTF-8 写入（PS 5.1 的 Set-Content -Encoding UTF8 会写 BOM，JSON.parse 会解析失败）
        [System.IO.File]::WriteAllText($Path, ($SettingsJson | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
        Write-Info "Removed $($Before.Count - $After.Count) legacy entries from $Path (backup: $Path.legacy-backup)"
        Write-Success "Legacy permission entries cleaned"
    } else {
        Write-Info "No legacy entries found in $Path"
    }
}

function Clear-PrepareDevPermissions {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        Write-Info "prepare-dev: not found, skipped: $Path"
        return $false
    }
    # 容错：settings 文件可能被手工编辑破坏（JSON 无法解析）。损坏时跳过并警告，不中断整个 setup。
    try {
        $SettingsJson = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Failure "prepare-dev: skipped $Path (unparseable JSON): $($_.Exception.Message)"
        return $false
    }
    # 旧独立 prepare-dev（pmcraft-dev 插件的前身）的全部残留形态：
    #   allow/deny 工具串：Skill(prepare-dev)、prepare-dev-dev、双反斜杠路径（C:\\dev\\prepare-dev）、
    #     git-bash 路径（/c/dev/prepare-dev）、正斜杠盘符路径（C:/dev/prepare-dev）
    #   additionalDirectories 纯路径：单反斜杠（C:\dev\prepare-dev-dev\1.0.0）
    # 安全：Skill(pmcraft-dev:prepare-dev) 不以 Skill(prepare-dev 开头（Skill( 后是 pmcraft-）；
    #       新插件脚本路径（...\pmcraft-dev\skills\prepare-dev\scripts\diff-prd.js）路径段是 pmcraft-dev\skills\...，
    #       不含上述任一形态，均不会被命中。
    # 转义说明（settings 中 Windows 路径以 JSON 双重转义存储）：
    #   allow/deny 工具串原始 4 反斜杠（解析后 2 字面反斜杠）→ 正则写 4 反斜杠（\\\\）
    #   additionalDirectories 原始 2 反斜杠（解析后 1 反斜杠）→ 正则写 2 反斜杠（\\）
    #   两个形态都列出，同一模式同时服务三个字段。
    $PrepDevPattern = 'Skill\(prepare-dev|prepare-dev-dev|C:\\\\dev\\\\prepare-dev|C:\\dev\\prepare-dev|/c/dev/prepare-dev|C:/dev/prepare-dev'
    $Changed = $false
    # permissions 键缺失时补齐空对象，避免 $ErrorActionPreference = "Stop" 下动态属性赋值抛错
    if (-not $SettingsJson.PSObject.Properties.Name -contains "permissions") {
        $SettingsJson | Add-Member -NotePropertyName "permissions" -NotePropertyValue ([PSCustomObject]@{})
    }
    foreach ($field in @("allow", "additionalDirectories", "deny")) {
        if (-not $SettingsJson.permissions.PSObject.Properties.Name -contains $field) { continue }
        $Before = @($SettingsJson.permissions.$field)
        $After = @($Before | Where-Object { $_ -notmatch $PrepDevPattern })
        if ($After.Count -lt $Before.Count) {
            $SettingsJson.permissions.$field = $After
            $Changed = $true
            Write-Info "prepare-dev: removed $($Before.Count - $After.Count) legacy entries from $Path permissions.$field"
        }
    }
    if ($Changed) {
        # 独立备份后缀：Step 9e 会以 .legacy-backup 再次备份并覆盖同名文件，
        # prepare-dev 专属后缀保留清理前证据，便于核对本次删了什么
        Copy-Item $Path "$Path.prepare-dev-backup" -Force
        # 无 BOM UTF-8 写入（PS 5.1 的 Set-Content -Encoding UTF8 会写 BOM，JSON.parse 会解析失败）
        [System.IO.File]::WriteAllText($Path, ($SettingsJson | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
        Write-Info "prepare-dev: backup written: $Path.prepare-dev-backup"
    } else {
        Write-Info "prepare-dev: no legacy entries found in $Path"
    }
    return $Changed
}

function Clear-PromptWriterPermissions {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        Write-Info "prompt-writer: not found, skipped: $Path"
        return $false
    }
    # 容错：settings 文件可能被手工编辑破坏（JSON 无法解析）。损坏时跳过并警告，不中断整个 setup。
    try {
        $SettingsJson = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Failure "prompt-writer: skipped $Path (unparseable JSON): $($_.Exception.Message)"
        return $false
    }
    # 旧独立 prompt-writer（pmcraft-prompt 插件的前身）的全部残留形态：
    #   allow/deny 工具串：Skill(prompt-writer)
    #   additionalDirectories 纯路径：c:\dev\prompt-writer（2）\1.1.0\prompt-writer 及 references（全角括号）
    # 安全：新插件技能名是 write-prompt（路径 pmcraft-prompt/skills/write-prompt），不含 prompt-writer 子串；
    #       pmcraft-prompt 插件名也不含 prompt-writer，均不会被命中。
    # 转义说明（settings 中 Windows 路径以 JSON 双重转义存储）：
    #   allow/deny 工具串原始 4 反斜杠（解析后 2 字面反斜杠）→ 正则写 4 反斜杠（\\\\）
    #   additionalDirectories 原始 2 反斜杠（解析后 1 反斜杠）→ 正则写 2 反斜杠（\\）
    #   两个形态都列出，同一模式同时服务三个字段。
    $PromptWriterPattern = 'Skill\(prompt-writer|prompt-writer（|prompt-writer\\|prompt-writer/|prompt_writer|C:\\dev\\prompt-writer|c:\\dev\\prompt-writer'
    $Changed = $false
    # permissions 键缺失时补齐空对象，避免 $ErrorActionPreference = "Stop" 下动态属性赋值抛错
    if (-not $SettingsJson.PSObject.Properties.Name -contains "permissions") {
        $SettingsJson | Add-Member -NotePropertyName "permissions" -NotePropertyValue ([PSCustomObject]@{})
    }
    foreach ($field in @("allow", "additionalDirectories", "deny")) {
        if (-not $SettingsJson.permissions.PSObject.Properties.Name -contains $field) { continue }
        $Before = @($SettingsJson.permissions.$field)
        $After = @($Before | Where-Object { $_ -notmatch $PromptWriterPattern })
        if ($After.Count -lt $Before.Count) {
            $SettingsJson.permissions.$field = $After
            $Changed = $true
            Write-Info "prompt-writer: removed $($Before.Count - $After.Count) legacy entries from $Path permissions.$field"
        }
    }
    if ($Changed) {
        # 独立备份后缀：Step 9e 会以 .legacy-backup 再次备份并覆盖同名文件，
        # prompt-writer 专属后缀保留清理前证据，便于核对本次删了什么
        Copy-Item $Path "$Path.prompt-writer-backup" -Force
        # 无 BOM UTF-8 写入（PS 5.1 的 Set-Content -Encoding UTF8 会写 BOM，JSON.parse 会解析失败）
        [System.IO.File]::WriteAllText($Path, ($SettingsJson | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
        Write-Info "prompt-writer: backup written: $Path.prompt-writer-backup"
    } else {
        Write-Info "prompt-writer: no legacy entries found in $Path"
    }
    return $Changed
}

function Exit-WithPrompt {
    param([string]$Message, [int]$ExitCode = 1)
    Write-Host ""; Write-Failure $Message; Write-Host ""
    Write-Host "Press SPACE or ENTER to close this window..." -ForegroundColor Gray
    $null = [Console]::ReadKey($true)
    $script:KeyPressed = $true
    exit $ExitCode
}

function Run-Rollback {
    param([array]$actions)
    if ($actions.Count -eq 0) { return }
    Write-Host ""; Write-Host "  Rolling back changes..." -ForegroundColor Yellow
    foreach ($action in $actions) {
        try { & $action | Out-Null }
        catch { Write-Info "  Rollback warning: $_" }
    }
    Write-Host "  Rollback complete." -ForegroundColor Yellow
}

# ⚠️ 镜像函数（Invoke-ClaudeWithTimeout / Exit-WithPrompt / Write-*）：setup.cmd 与 uninstall.cmd
#    各含同一份，无共享文件（两脚本独立自包含），修改任一处必须同步另一处（v2.2.0 已核对一致）。
function Invoke-ClaudeWithTimeout {
    param([string[]]$Arguments, [string]$Label, [int]$TimeoutSeconds = 30, [switch]$Quiet)

    if (-not $Quiet) { Write-Info "Running: claude $($Arguments -join ' ')" }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    # 每个参数加双引号包裹：市场路径含空格（如 C:\Users\John Doe\pmcraft）时不加引号会被 cmd
    # 拆成多个 token，marketplace add / install 会注册或安装到错误路径。
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
    Write-Host "=== pmcraft 0.0.1 Setup ===" -ForegroundColor Cyan
    Write-Host ""

    # Step 1: Detect plugin directory
    Write-Step 1 "Detecting plugin directory"
    $PluginRoot = $pluginDir.TrimEnd('\')
    Write-Info "Plugin path: $PluginRoot"

    $MarketplaceJson = [System.IO.Path]::Combine($PluginRoot, ".claude-plugin", "marketplace.json")
    if (-not (Test-Path $MarketplaceJson)) {
        Exit-WithPrompt ".claude-plugin/marketplace.json not found. Make sure setup.cmd is in the pmcraft root folder"
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

    # Step 3: Check Node.js (required - pmcraft 脚本层已全面 Node 化)
    Write-Step 3 "Checking Node.js"
    $hasNode = Get-Command "node" -ErrorAction SilentlyContinue
    if (-not $hasNode) {
        Exit-WithPrompt "Node.js is required for pmcraft (deploy-survey/deploy-prototype/save-doc/save-version etc. all need it). Install from https://nodejs.org (LTS), verify 'node --version' works in a new terminal, then rerun setup."
    } else {
        $nodeVersion = & node --version 2>$null
        if ($LASTEXITCODE -ne 0) { $nodeVersion = "unknown" }
        Write-Success "Node.js $nodeVersion"
    }
    Write-Host ""

    # Step 4: Check marketplace registration
    Write-Step 4 "Checking marketplace registration"
    $SettingsPath = [System.IO.Path]::Combine($env:USERPROFILE, ".claude", "settings.json")
    if (-not (Test-Path $SettingsPath)) {
        Exit-WithPrompt "Claude Code config not found ($SettingsPath)"
    }
    # 容错：settings 文件可能被手工编辑破坏（JSON 无法解析）——与 Step 9e 清理函数的
    # 容错策略一致。解析失败按"未注册"处理走全新安装路径，后续清理步骤会尝试修复。
    try {
        $Settings = Get-Content $SettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $MarketSource = $Settings.extraKnownMarketplaces.'pmcraft'.source
    } catch {
        Write-Failure "Settings file unparseable ($SettingsPath) - treating as not registered; cleanup steps will try to repair it: $($_.Exception.Message)"
        $MarketSource = $null
    }

    if (-not $MarketSource) {
        Write-Success "Marketplace not registered - will perform first-time install"
        $IsInstall = $true
    } else {
        $MarketPath = $MarketSource.path
        Write-Info "Registered market path: $MarketPath"

        $NormalizedPluginRoot = $PluginRoot.TrimEnd('\').TrimEnd('/')
        $NormalizedMarketPath = $MarketPath.TrimEnd('\').TrimEnd('/')
        if ($NormalizedPluginRoot -ne $NormalizedMarketPath) {
            Write-Host "  WARNING: Plugin directory does not match registered market path:" -ForegroundColor Yellow
            Write-Info "    Current plugin: $NormalizedPluginRoot"
            Write-Info "    Registered:     $NormalizedMarketPath"
            # 重新注册：先移除旧注册（注册的是声明，不卸载插件），再把当前路径注册回去。
            # 之后升级路径的 install 才会从新根复制内容，避免新旧混装。
            Write-Host "    Re-register marketplace to the current path and continue? (Y/N) " -ForegroundColor Yellow -NoNewline
            $resp = Read-Host
            if ($resp -ne "Y" -and $resp -ne "y") { Exit-WithPrompt "Cancelled" 0 }
            $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "marketplace", "remove", "pmcraft") -Label "Remove old marketplace registration" -TimeoutSeconds 30 -Quiet
            if (-not $ok) { Write-Info "  marketplace remove failed (may be fine); continuing" }
            $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "marketplace", "add", $PluginRoot) -Label "Re-register marketplace" -TimeoutSeconds 60
            # 注意：走到这里时旧注册可能已移除（remove 成功、add 失败）——此时手动 remove 反而会报
            # "marketplace not found"。正确恢复路径：直接重跑 setup（走全新安装自动注册），或手动 add。
            if (-not $ok) { Exit-WithPrompt "Marketplace re-registration failed (old registration may already be removed). Rerun setup to perform a first-time install, or run 'claude plugin marketplace add $PluginRoot' manually." }
            $MarketPath = $PluginRoot   # 后续以新路径为准
            Write-Success "Marketplace re-registered to current path"
            Write-Host ""
        } else {
            Write-Success "Marketplace path matches"
        }
    }
    Write-Host ""

    if ($IsInstall) {
        # First-time install: register marketplace -> install 7 plugins -> enable 7 plugins
        Write-Step 5 "Registering marketplace"
        $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "marketplace", "add", $PluginRoot) -Label "Marketplace add" -TimeoutSeconds 60
        if (-not $ok) { Exit-WithPrompt "Marketplace registration failed" }
        $rollbackActions = @({ Invoke-ClaudeWithTimeout -Arguments @("plugin", "marketplace", "remove", "pmcraft") -Label "Rollback: remove marketplace" })
        Write-Host ""

        Write-Step 6 "Installing plugins"
        $installed = @()
        foreach ($name in $PluginNames) {
            $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "install", "$name@pmcraft") -Label "Install $name" -TimeoutSeconds 60
            if (-not $ok) {
                # Rollback: uninstall whatever we installed so far, then remove marketplace
                foreach ($installedName in $installed) {
                    Invoke-ClaudeWithTimeout -Arguments @("plugin", "uninstall", "$installedName@pmcraft") -Label "Rollback: uninstall $installedName" | Out-Null
                }
                Run-Rollback $rollbackActions
                Exit-WithPrompt "Plugin install failed: $name. Rolling back changes."
            }
            $installed += $name
            Write-Info "  Installed: $name"
        }
        Write-Success "All 7 plugins installed"
        $rollbackActions = @()
        Write-Host ""

        Write-Step 7 "Enabling plugins"
        foreach ($name in $PluginNames) {
            $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "enable", "$name@pmcraft") -Label "Enable $name" -Quiet
            if (-not $ok) {
                Write-Info "  $name already enabled or enable failed (proceeding)"
            } else {
                Write-Info "  $name enabled"
            }
        }
        Write-Success "All plugins enabled"
        Sync-SharedLibrary $PluginRoot
        Write-Host ""
    } else {
        # 升级路径会 rename/删除缓存目录；Claude Code 正在运行时 Windows 文件锁
        # 可能导致 Rename-Item/Remove-Item 失败（落进外层 catch 成半升级状态，
        # 虽可由 Step 5.1 残留恢复续接，但应尽量避免）。仅警告不阻断。
        $claudeProcs = @(Get-Process -Name "claude" -ErrorAction SilentlyContinue)
        if ($claudeProcs.Count -gt 0) {
            Write-Host "  WARNING: Claude Code is currently running ($($claudeProcs.Count) process(es))." -ForegroundColor Yellow
            Write-Host "  The update path renames plugin cache directories, which may be locked while running." -ForegroundColor Yellow
            Write-Host "  For a clean update, close Claude Code first, then rerun setup." -ForegroundColor Yellow
            Write-Host ""
        }

        # Update: 先同步 init-project 技能模板（根 CLAUDE.md + agents → 技能 assets/），
        # 再逐插件重建缓存——顺序不能反：install 从源复制缓存时会带上最新模板，
        # 若先重建缓存再同步 assets，本次升级分发给 init-project 的将是旧模板
        Write-Step 5 "Syncing init-project skill templates"
        $InitAssets = Join-Path $PluginRoot "pmcraft-infra\skills\init-project\assets"
        $RootClaudeMd = Join-Path $PluginRoot "CLAUDE.md"
        $RootAgents = Join-Path $PluginRoot ".claude\agents"
        if ((Test-Path $RootClaudeMd) -and (Test-Path $InitAssets)) {
            Copy-Item $RootClaudeMd (Join-Path $InitAssets "CLAUDE.md") -Force
            if (Test-Path $RootAgents) {
                # 防御：包结构异常（assets/agents 缺失）时先建目标目录，否则 Copy-Item 抛错
                # 且 $ErrorActionPreference = "Stop" 会中止整个 setup
                $AgentsTarget = Join-Path $InitAssets "agents"
                if (-not (Test-Path $AgentsTarget)) { New-Item -ItemType Directory -Path $AgentsTarget -Force | Out-Null }
                Get-ChildItem (Join-Path $RootAgents "*.md") | Copy-Item -Destination "$AgentsTarget\" -Force
            }
            Write-Success "init-project skill templates synced"
        } else {
            Write-Info "Skipped (assets/ or root template not found)"
        }
        Write-Host ""

        # Update: 逐插件重建缓存（--force 不可用：移走旧缓存 → install 从 marketplace 源完整复制）
        # 备份可回滚：install 失败则恢复旧缓存，不影响已运行的插件
        Write-Step 5.1 "Updating plugins"
        $CacheRoot = [System.IO.Path]::Combine($env:USERPROFILE, ".claude", "plugins", "cache", "pmcraft")
        foreach ($name in $PluginNames) {
            $pluginCache = [System.IO.Path]::Combine($CacheRoot, $name)
            $backupPath = "$pluginCache.upgrade-bak"

            # 0. 残留恢复：上次运行可能中断在任意阶段，按"缓存+备份"组合判定
            #    - 仅备份（缓存缺失）→ 上次中断于 rename 之后：备份保留，直接作为本次回滚底
            #    - 缓存+备份且缓存含期望版本 → 上次已升级成功仅残留备份：删备份
            #    - 缓存+备份但缓存版本不符 → 上次 install 中断的残缺缓存：删残缺缓存，备份保留为回滚底
            if (Test-Path $backupPath) {
                if (Test-Path $pluginCache) {
                    if (Test-CacheVersion -PluginRoot $PluginRoot -Name $name -CacheRoot $CacheRoot) {
                        Remove-Item -Path $backupPath -Recurse -Force -ErrorAction SilentlyContinue
                        Write-Info "  $($name): leftover backup removed (previous update already completed)"
                    } else {
                        Remove-Item -Path $pluginCache -Recurse -Force -ErrorAction SilentlyContinue
                        Write-Info "  $($name): partial cache from interrupted install removed"
                    }
                }
                # 仅备份（缓存缺失）时不做任何事，备份直接充当本次回滚底
            }

            # 1. 移走当前缓存（备份可回滚：install 失败则恢复旧缓存，不影响已运行的插件）
            if (Test-Path $pluginCache) { Rename-Item -Path $pluginCache -NewName "$name.upgrade-bak" -Force }

            # 2. 重新安装（缓存缺失 → 从源复制最新内容）
            $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "install", "$name@pmcraft") -Label "Update $name" -TimeoutSeconds 60
            $installed = $false
            if ($ok) {
                # 3. 验证：缓存必须出现源 plugin.json 声明的版本目录，才算升级成功
                $installed = Test-CacheVersion -PluginRoot $PluginRoot -Name $name -CacheRoot $CacheRoot
            }
            if (-not $installed) {
                # 回滚：清掉 install 可能产生的残留，恢复旧缓存
                if (Test-Path $pluginCache) { Remove-Item -Path $pluginCache -Recurse -Force -ErrorAction SilentlyContinue }
                if (Test-Path $backupPath) { Rename-Item -Path $backupPath -NewName $name -Force -ErrorAction SilentlyContinue }
                Write-Host "  WARNING: Update failed for $name, old version restored" -ForegroundColor Yellow
            } else {
                # 4. 升级成功，删除备份
                if (Test-Path $backupPath) { Remove-Item -Path $backupPath -Recurse -Force -ErrorAction SilentlyContinue }
                Write-Info "  $name updated"
            }
        }
        Write-Success "Plugin update complete"
        Sync-SharedLibrary $PluginRoot
        Write-Host ""
    }

    # Step 8: Verify SessionStart hook (pmcraft-infra 插件根内，随插件安装被复制到缓存并被 Claude Code 加载)
    # 注意：Claude Code 只加载插件根 {plugin}/hooks/hooks.json（需 .claude-plugin/plugin.json）；
    #       市场根（marketplace.json 所在目录）不是插件，其下 hooks/ 不会被加载。
    $hookStep = if ($IsInstall) { 8 } else { 6 }
    Write-Step $hookStep "Verifying SessionStart hook"
    $HookPluginDir = [System.IO.Path]::Combine($PluginRoot, "pmcraft-infra", "hooks")
    $HookManifest = [System.IO.Path]::Combine($HookPluginDir, "hooks.json")
    $HookRunner = [System.IO.Path]::Combine($HookPluginDir, "run-hook.cmd")
    $HookScript = [System.IO.Path]::Combine($HookPluginDir, "session-start")
    $HookGuardScript = [System.IO.Path]::Combine($HookPluginDir, "guard-session-reset")
    if ((Test-Path $HookManifest) -and (Test-Path $HookRunner) -and (Test-Path $HookScript) -and (Test-Path $HookGuardScript)) {
        # 校验 hooks.json 是否为当前嵌套格式（matcher → hooks[] → {type: command}）。
        # 旧平铺格式（command + args 直挂事件）会被 Claude Code v2.1+ 硬拒绝，SessionStart 钩子静默失效。
        $hookFormatOk = $false
        try {
            $cfg = Get-Content $HookManifest -Raw | ConvertFrom-Json
            $hook = $cfg.hooks.SessionStart[0].hooks[0]
            $hookFormatOk = ($hook.type -eq "command") -and ([string]::IsNullOrWhiteSpace($hook.command) -eq $false)
        } catch {
            $hookFormatOk = $false
        }
        if ($hookFormatOk) {
            Write-Success "SessionStart hook present in pmcraft-infra/hooks/ (format OK)"
            Write-Info "Hook files: $HookPluginDir"
        } else {
            Write-Host "  WARNING: SessionStart hook files present but hooks.json format invalid." -ForegroundColor Yellow
            Write-Host "  Expected nested format: matcher -> hooks[] -> {type: command}. Old flat format is rejected by Claude Code v2.1+." -ForegroundColor Yellow
            Write-Host "  The routing brain will not be injected into new sessions. Fix hooks.json and rerun setup." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARNING: SessionStart hook files missing from pmcraft-infra/hooks/." -ForegroundColor Yellow
        Write-Host "  The routing brain will not be injected into new sessions. Re-copy the plugin folder and rerun setup." -ForegroundColor Yellow
    }
    Write-Host ""

    # Step 9: Clean up legacy product-req-plugin
    $legacyStep = if ($IsInstall) { 9 } else { 7 }
    Write-Step $legacyStep "Checking for legacy product-req-plugin"
    $LegacyCache = [System.IO.Path]::Combine($env:USERPROFILE, ".claude", "plugins", "cache", "my-market", "product-req-plugin")
    if (Test-Path $LegacyCache) {
        Write-Info "Found legacy product-req-plugin cache, removing..."
        # 1. 先尝试 claude 命令卸载（显示过程；市场注册已移除时命令必然失败，属正常）
        Invoke-ClaudeWithTimeout -Arguments @("plugin", "disable", "product-req-plugin@my-market") -Label "Disable legacy" -TimeoutSeconds 30
        Invoke-ClaudeWithTimeout -Arguments @("plugin", "uninstall", "product-req-plugin@my-market") -Label "Uninstall legacy" -TimeoutSeconds 30
        # 2. 兜底：命令失败（市场已移除）时直接删除残留缓存目录
        if (Test-Path $LegacyCache) {
            Remove-Item -Path $LegacyCache -Recurse -Force -ErrorAction SilentlyContinue
            Write-Info "  Removed cache directory: $LegacyCache"
        }
        # 3. 清理已空的 my-market 缓存目录
        $MyMarketCache = [System.IO.Path]::Combine($env:USERPROFILE, ".claude", "plugins", "cache", "my-market")
        if ((Test-Path $MyMarketCache) -and -not (Get-ChildItem $MyMarketCache -Force)) {
            Remove-Item -Path $MyMarketCache -Force -ErrorAction SilentlyContinue
            Write-Info "  Removed empty my-market cache directory"
        }
        if (Test-Path $LegacyCache) { Write-Failure "Legacy product-req-plugin cache could not be removed" }
        else                        { Write-Success "Legacy product-req-plugin removed" }
    } else {
        Write-Info "No legacy product-req-plugin cache found: $LegacyCache"
        Write-Success "No legacy product-req-plugin found"
    }
    Write-Host ""

    # Step 9a: Remove legacy my-market registration (旧版 product-req-plugin 市场)
    $legacyStepA = $legacyStep + 0.5
    Write-Step $legacyStepA "Removing legacy my-market registration"
    $SettingsPathForMarket = Join-Path $env:USERPROFILE ".claude\settings.json"
    $MyMarketExists = $false
    if (Test-Path $SettingsPathForMarket) {
        # 容错：settings 可能被手工编辑破坏（JSON 无法解析）——跳过本步，不阻塞 setup
        try {
            $SettingsForMarket = Get-Content $SettingsPathForMarket -Raw -Encoding UTF8 | ConvertFrom-Json
            $MyMarketExists = $SettingsForMarket.extraKnownMarketplaces.PSObject.Properties.Name -contains "my-market"
        } catch {
            Write-Failure "Skipped my-market cleanup ($SettingsPathForMarket unparseable): $($_.Exception.Message)"
            $MyMarketExists = $false
        }
    }
    if ($MyMarketExists) {
        Write-Info "Found legacy my-market registration, removing..."
        # 1. 尝试 claude 命令移除市场（失败不阻塞，settings.json 直接删条目兜底）
        Invoke-ClaudeWithTimeout -Arguments @("plugin", "marketplace", "remove", "my-market") -Label "Remove my-market" -Quiet | Out-Null
        # 2. 直接从 settings.json 删除 my-market 条目（先备份）
        Copy-Item $SettingsPathForMarket "$SettingsPathForMarket.legacy-backup" -Force
        $SettingsForMarket.extraKnownMarketplaces.PSObject.Properties.Remove("my-market")
        # 无 BOM UTF-8 写入（PS 5.1 的 Set-Content -Encoding UTF8 会写 BOM，JSON.parse 会解析失败）
        [System.IO.File]::WriteAllText($SettingsPathForMarket, ($SettingsForMarket | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
        Write-Success "Legacy my-market registration removed (backup: settings.json.legacy-backup)"
    } else {
        Write-Info "No my-market registration found in: $SettingsPathForMarket"
        Write-Success "No legacy my-market registration found"
    }
    Write-Host ""

    # Step 9b: Clean up legacy pm-gym (skill form, predecessor of pmcraft-coach)
    $legacyStepB = $legacyStep + 1
    Write-Step $legacyStepB "Checking for legacy pm-gym"
    $gymFound = $false

    # 1. 技能目录
    $GymSkillDir = Join-Path $env:USERPROFILE ".claude\skills\pm-gym"
    if (Test-Path $GymSkillDir) {
        Write-Info "Found pm-gym skill directory, removing..."
        Remove-Item -Path $GymSkillDir -Recurse -Force -ErrorAction SilentlyContinue
        $gymFound = $true
    } else {
        Write-Info "No pm-gym skill directory found: $GymSkillDir"
    }

    # 2. 日志目录残留
    $GymLogDirs = @(
        (Join-Path $env:USERPROFILE ".pm-gym-logs"),
        (Join-Path $env:USERPROFILE "Desktop\.pm-gym-logs")
    )
    $GymLogFound = $false
    foreach ($logDir in $GymLogDirs) {
        if (Test-Path $logDir) {
            Write-Info "Found pm-gym logs at $logDir, removing..."
            Remove-Item -Path $logDir -Recurse -Force -ErrorAction SilentlyContinue
            $gymFound = $true
            $GymLogFound = $true
        }
    }
    if (-not $GymLogFound) { Write-Info "No pm-gym log directories found: $($GymLogDirs -join ', ')" }

    if ($gymFound) { Write-Success "Legacy pm-gym removed" }
    else { Write-Success "No legacy pm-gym found" }
    Write-Host ""

    # Step 9c: Clean up legacy standalone prepare-dev (skill form, predecessor of pmcraft-dev:prepare-dev)
    $legacyStepC = $legacyStep + 1.5
    Write-Step $legacyStepC "Checking for legacy prepare-dev"
    $prepFound = $false

    # 1. 旧技能目录 ~/.claude/skills/prepare-dev（对标 Step 9b pm-gym 技能目录检查）
    $PrepSkillDir = Join-Path $env:USERPROFILE ".claude\skills\prepare-dev"
    if (Test-Path $PrepSkillDir) {
        Write-Info "Found legacy prepare-dev skill directory, removing..."
        Remove-Item -Path $PrepSkillDir -Recurse -Force -ErrorAction SilentlyContinue
        $prepFound = $true
    } else {
        Write-Info "No legacy prepare-dev skill directory found: $PrepSkillDir"
    }

    # 2. 旧插件缓存：plugins/cache 顶层名称含 prepare 的目录（对标 Step 9 product-req-plugin 缓存检查）
    #    只查顶层、绝不递归——cache/pmcraft/pmcraft-dev/skills/prepare-dev 是新插件技能目录，不可删
    $PrepCacheRoot = Join-Path $env:USERPROFILE ".claude\plugins\cache"
    if (Test-Path $PrepCacheRoot) {
        $LegacyPrepCaches = @(Get-ChildItem $PrepCacheRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "prepare" })
        foreach ($cacheDir in $LegacyPrepCaches) {
            Write-Info "Found legacy prepare-dev cache $($cacheDir.FullName), removing..."
            Remove-Item -Path $cacheDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
            $prepFound = $true
        }
    }

    # 3. settings.json / settings.local.json 的 permissions.allow / additionalDirectories / deny 清理
    $prepFound = (Clear-PrepareDevPermissions -Path $SettingsPath) -or $prepFound
    $prepFound = (Clear-PrepareDevPermissions -Path (Join-Path $env:USERPROFILE ".claude\settings.local.json")) -or $prepFound

    # 4. 旧斜杠命令 ~/.claude/commands/prepare-dev.md（旧独立 prepare-dev 1.1.0 时代注册；
    #    插件版通过 CLAUDE.md 路由调用，不依赖 commands 目录，删后无影响）
    #    只查固定文件名，绝不枚举 commands 目录——不碰用户自定义的其他命令
    $PrepCmdFile = Join-Path $env:USERPROFILE ".claude\commands\prepare-dev.md"
    if (Test-Path $PrepCmdFile) {
        # 先备份再删除：commands 是用户自定义命令区，删了无法恢复；
        # 备份名 .legacy-backup 非 *.md 结尾，Claude Code 扫描 *.md 时不会注册为命令
        Copy-Item $PrepCmdFile "$PrepCmdFile.legacy-backup" -Force
        Remove-Item -Path $PrepCmdFile -Force -ErrorAction SilentlyContinue
        $prepFound = $true
        Write-Info "Found legacy /prepare-dev slash command, removed (backup: $PrepCmdFile.legacy-backup)"
    } else {
        Write-Info "No legacy /prepare-dev slash command found: $PrepCmdFile"
    }

    if ($prepFound) { Write-Success "Legacy prepare-dev removed" }
    else            { Write-Success "No legacy prepare-dev found" }
    Write-Host ""

    # Step 9d: Clean up legacy standalone prompt-writer (skill form, predecessor of pmcraft-prompt:write-prompt)
    $legacyStepD = $legacyStep + 1.75
    Write-Step $legacyStepD "Checking for legacy prompt-writer"
    $promptFound = $false

    # 1. 旧技能目录 ~/.claude/skills/prompt-writer（对标 Step 9c prepare-dev 技能目录检查）
    $PromptSkillDir = Join-Path $env:USERPROFILE ".claude\skills\prompt-writer"
    if (Test-Path $PromptSkillDir) {
        Write-Info "Found legacy prompt-writer skill directory, removing..."
        Remove-Item -Path $PromptSkillDir -Recurse -Force -ErrorAction SilentlyContinue
        $promptFound = $true
    } else {
        Write-Info "No legacy prompt-writer skill directory found: $PromptSkillDir"
    }

    # 2. 旧插件缓存：plugins/cache 顶层名称含 prompt 的目录（对标 Step 9c prepare-dev 缓存检查）
    #    只查顶层、绝不递归；显式排除 pmcraft-prompt——它是新插件，不可删
    $PromptCacheRoot = Join-Path $env:USERPROFILE ".claude\plugins\cache"
    if (Test-Path $PromptCacheRoot) {
        $LegacyPromptCaches = @(Get-ChildItem $PromptCacheRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "prompt" -and $_.Name -ne "pmcraft-prompt" })
        foreach ($cacheDir in $LegacyPromptCaches) {
            Write-Info "Found legacy prompt-writer cache $($cacheDir.FullName), removing..."
            Remove-Item -Path $cacheDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
            $promptFound = $true
        }
    }

    # 3. settings.json / settings.local.json 的 permissions.allow / additionalDirectories / deny 清理
    $promptFound = (Clear-PromptWriterPermissions -Path $SettingsPath) -or $promptFound
    $promptFound = (Clear-PromptWriterPermissions -Path (Join-Path $env:USERPROFILE ".claude\settings.local.json")) -or $promptFound

    if ($promptFound) { Write-Success "Legacy prompt-writer removed" }
    else              { Write-Success "No legacy prompt-writer found" }
    Write-Host ""

    # Step 9e: Clean up legacy permission entries (pm-gym + retired plugin lineage) from settings.json & settings.local.json
    $legacyStepE = $legacyStep + 2
    Write-Step $legacyStepE "Cleaning legacy permission entries from settings files"
    $SettingsPath = Join-Path $env:USERPROFILE ".claude\settings.json"
    Clear-LegacyPermissions -Path $SettingsPath
    Clear-LegacyPermissions -Path (Join-Path $env:USERPROFILE ".claude\settings.local.json")
    Write-Host ""

    # Done
    Write-Host "========================================" -ForegroundColor Cyan
    if ($IsInstall) { Write-Host "  Setup complete!" -ForegroundColor Green }
    else            { Write-Host "  Update complete!" -ForegroundColor Green }
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # 检测禁用的插件：安装/升级不改变启用状态（尊重用户手动 disable 的意图），最后一步统一询问
    # 容错：settings 损坏时跳过本检查（清理步骤已尝试修复），不阻塞 setup 收尾
    $DisabledPlugins = @()
    try {
        $UpdateSettings = Get-Content $SettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($name in $PluginNames) {
            $key = "$name@pmcraft"
            if (-not $UpdateSettings.enabledPlugins -or
                -not ($UpdateSettings.enabledPlugins.PSObject.Properties.Name -contains $key) -or
                -not $UpdateSettings.enabledPlugins.$key) {
                $DisabledPlugins += $key
            }
        }
    } catch {
        Write-Failure "Settings file unparseable ($SettingsPath) - skipped disabled-plugin check: $($_.Exception.Message)"
    }
    if ($DisabledPlugins.Count -gt 0) {
        Write-Host "  WARNING: These plugins are disabled:" -ForegroundColor Yellow
        foreach ($dp in $DisabledPlugins) { Write-Info "    - $dp" }
        Write-Host "  Enable them now? (Y/N) " -ForegroundColor Yellow -NoNewline
        $resp = Read-Host
        if ($resp -eq "Y" -or $resp -eq "y") {
            foreach ($dp in $DisabledPlugins) {
                $ok = Invoke-ClaudeWithTimeout -Arguments @("plugin", "enable", $dp) -Label "Enable $dp" -TimeoutSeconds 30 -Quiet
                if ($ok) { Write-Info "  $dp enabled" }
                else     { Write-Host "  WARNING: Failed to enable $dp. Run manually: claude plugin enable $dp" -ForegroundColor Yellow }
            }
        } else {
            Write-Info "  Skipped. To enable manually: claude plugin enable <plugin>@pmcraft"
        }
        Write-Host ""
    }

    Write-Host "Please completely exit Claude Code (close terminal or press Ctrl+C twice)"
    Write-Host "then restart for the change to take effect."
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

# 失败时以非零退出码结束，供上层（cmd 包装的 if errorlevel）判断是否成功
exit $script:ExitCode
