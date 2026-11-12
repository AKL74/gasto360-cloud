@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.14 - Servidor local
cd /d "%~dp0"
echo Accede a http://127.0.0.1:18914/
where py >nul 2>nul
if %errorlevel% equ 0 (
 py -3 -m http.server 18914 --bind 127.0.0.1
) else (
 python -m http.server 18914 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] Comprueba que el puerto 18914 no esta ocupado.
pause
endlocal
