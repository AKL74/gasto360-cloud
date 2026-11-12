@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.16 - HTTP local
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
 py -3 -m http.server 18916 --bind 127.0.0.1
) else (
 python -m http.server 18916 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] Puerto 18916 ocupado.
pause
endlocal
