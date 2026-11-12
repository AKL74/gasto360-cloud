@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.12 - Servidor de pruebas
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
 py -3 -m http.server 18912 --bind 127.0.0.1
) else (
 python -m http.server 18912 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] Verifica si el puerto 18912 esta libre.
pause
endlocal
