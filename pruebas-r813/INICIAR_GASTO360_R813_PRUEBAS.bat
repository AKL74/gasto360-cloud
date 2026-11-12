@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.13 - Camara nativa en pruebas
cd /d "%~dp0"
echo =============================================================
echo  GASTO360 R8.13 - CAPTURA EN ALTA RESOLUCION / SOLO PRUEBAS
echo =============================================================
echo Sin cambios en HUB ni Supabase.
where py >nul 2>nul
if %errorlevel% equ 0 goto LISTO
where python >nul 2>nul
if %errorlevel% equ 0 goto LISTO
echo [ERROR] Falta Python 3; usa la pagina HTTPS en Android.
pause
exit /b 1
:LISTO
start "Gasto360 R8.13 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R813.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18913/"
echo Abierto: http://127.0.0.1:18913/
echo Para detenerlo cierra la ventana SERVIDOR.
pause
endlocal
