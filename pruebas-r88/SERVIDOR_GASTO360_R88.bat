@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.8 - SERVIDOR DE PRUEBAS
cd /d "%~dp0"
echo Escaner R8.8 en http://127.0.0.1:18988/
echo NO escribe datos en Supabase.
where py >nul 2>nul
if %errorlevel% equ 0 (
 py -3 -m http.server 18988 --bind 127.0.0.1
) else (
 python -m http.server 18988 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] Verifica que 18988 esta libre.
pause
endlocal
