@echo off
cd /d "%~dp0"
echo ============================================================
echo   pmcraft survey - starting server...
echo   Local test : http://localhost:5178/
echo   Results    : http://localhost:5178/admin
echo   Stop       : double-click close.bat
echo   (Your LAN link is printed below once the server starts.)
echo ============================================================
node server.js
pause
