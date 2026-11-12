@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.9 - Servidor de pruebas
cd /d "%~dp0"
echo Gasto360 R8.9: http://127.0.0.1:18989/
echo Modo local. Sin escrituras en Supabase.
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 -m http.server 18989 --bind 127.0.0.1
) else (
  python -m http.server 18989 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] Verifica que el puerto 18989 este disponible.
pause
endlocal
