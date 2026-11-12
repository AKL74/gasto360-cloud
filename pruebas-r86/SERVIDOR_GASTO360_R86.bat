@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.6 - SERVIDOR DE PRUEBAS
cd /d "%~dp0"
echo [GASTO360 R8.6] Servidor local: http://127.0.0.1:18986/
echo [IMPORTANTE] No usa Supabase. Cierra esta ventana para detener.
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 -m http.server 18986 --bind 127.0.0.1
) else (
  python -m http.server 18986 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] No se pudo iniciar. Comprueba Python y que el puerto 18986 este libre.
pause
endlocal
