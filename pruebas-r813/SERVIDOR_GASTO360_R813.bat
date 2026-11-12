@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.13 - Servidor local
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
 py -3 -m http.server 18913 --bind 127.0.0.1
) else (
 python -m http.server 18913 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] Verifica que el puerto 18913 no este en uso.
pause
endlocal
