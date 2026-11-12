@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.10 - Laboratorio de escaneo
cd /d "%~dp0"
echo ========================================================
echo GASTO360 R8.10 - LABORATORIO AISLADO / SIN SUPABASE
echo ========================================================
where py >nul 2>nul
if %errorlevel% equ 0 goto RUN
where python >nul 2>nul
if %errorlevel% equ 0 goto RUN
echo [ERROR] Falta Python 3. Usa la prueba HTTPS desde el movil:
echo https://akl74.github.io/gasto360-cloud/pruebas-r810/
pause
exit /b 1
:RUN
start "Gasto360 R8.10 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R810.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18910/"
echo Abierto http://127.0.0.1:18910/
echo Para detener, cierra la ventana SERVIDOR.
pause
endlocal
