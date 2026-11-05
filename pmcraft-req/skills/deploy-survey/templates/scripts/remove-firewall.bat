@echo off
title Remove survey port 5178 rule
netsh advfirewall firewall delete rule name="pmcraft-survey-5178"
if %errorlevel% neq 0 goto failed
echo.
echo   [OK] Firewall rule for port 5178 removed.
echo.
goto end
:failed
echo.
echo   [FAILED] Could not remove the rule.
echo   Either this window is not administrator, or the rule was not present.
echo   If needed, RIGHT-CLICK this file and choose "Run as administrator".
echo.
:end
pause
