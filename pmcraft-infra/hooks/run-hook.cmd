@echo off
setlocal

REM run-hook.cmd - Windows polyglot hook executor
REM Usage: run-hook.cmd <hook-script-name>
REM The hook script MUST be in the same directory as this .cmd file.
REM
REM NOTE: bash stdout bytes are passed through to Claude Code verbatim.
REM Do NOT re-echo line-by-line with `for /f` (cmd would re-decode UTF-8
REM with console codepage cp936 and garble the Chinese routing brain,
REM and `for /f` also drops empty lines).
REM
REM This file is intentionally ASCII-only: cmd.exe misparses UTF-8
REM multibyte sequences inside comments (decodes them as cp936 and may
REM execute garbage fragments on every SessionStart).

set "HOOK_DIR=%~dp0"
set "HOOK_SCRIPT=%HOOK_DIR%%~1"

if "%~1"=="" (
    echo [pmcraft] Usage: run-hook.cmd ^<hook-script-name^>
    exit /b 1
)

if not exist "%HOOK_SCRIPT%" (
    echo [pmcraft] Hook script not found: %HOOK_SCRIPT%
    exit /b 1
)

REM Locate Git Bash: prefer Git for Windows install locations FIRST.
REM WSL machines have System32\bash.exe (WSL launcher) in PATH - it cannot
REM run Windows-path scripts (the hook would silently fail and the routing
REM brain would never be injected), so it is explicitly excluded from the
REM PATH fallback.
REM NOTE: keep each %VAR% expansion on its own line; inside a parenthesized
REM block %VAR% would expand at parse time (before the for-loop runs).
set "BASH_EXE="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
if defined BASH_EXE goto bash_found
if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles(x86)%\Git\bin\bash.exe"
if defined BASH_EXE goto bash_found
for %%p in (bash.exe) do set "BASH_EXE=%%~$PATH:p"
if /i "%BASH_EXE%"=="%SystemRoot%\System32\bash.exe" set "BASH_EXE="
if /i "%BASH_EXE%"=="%SystemRoot%\SysWOW64\bash.exe" set "BASH_EXE="
if not defined BASH_EXE goto bash_missing

:bash_found
"%BASH_EXE%" "%HOOK_SCRIPT%"
exit /b %errorlevel%

:bash_missing
echo [pmcraft] Git Bash not found. Please install Git for Windows with "Git Bash" component.
exit /b 1
