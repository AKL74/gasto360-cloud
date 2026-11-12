@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.16 - Laboratorio de tickets
cd /d "%~dp0"
echo ======================================================
echo GASTO360 R8.16 - MOTOR DE TICKETS MULTIRENGLON
echo AISLADO - SIN SUPABASE, HUB NI GASTO360 HABITUAL
echo ======================================================
where py >nul 2>nul
if %errorlevel% equ 0 goto LISTO
where python >nul 2>nul
if %errorlevel% equ 0 goto LISTO
echo [ERROR] Necesitas Python 3.
pause
exit /b 1
:LISTO
start "Servidor Gasto360 R816" "%~dp0SERVIDOR_GASTO360_R816.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18916/"
echo R8.16 abierta en http://127.0.0.1:18916/
pause
endlocal
