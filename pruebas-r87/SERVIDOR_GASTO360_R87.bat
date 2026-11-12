@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.7 - Servidor de pruebas
cd /d "%~dp0"
echo Gasto360 R8.7: http://127.0.0.1:18987/
echo Servidor aislado, sin Supabase.
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 -m http.server 18987 --bind 127.0.0.1
) else (
  python -m http.server 18987 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] Comprueba si el puerto 18987 esta ocupado.
pause
endlocal
