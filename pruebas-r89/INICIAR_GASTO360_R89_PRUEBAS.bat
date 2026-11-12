@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.9 - Escaner de pruebas
cd /d "%~dp0"
echo ==================================================
echo  GASTO360 R8.9 - LABORATORIO MOVIL Y WINDOWS
echo ==================================================
echo.
echo Instalacion aislada - NO modifica Supabase ni HUB.
echo.
where py >nul 2>nul
if %errorlevel% equ 0 goto RUN
where python >nul 2>nul
if %errorlevel% equ 0 goto RUN
echo [ERROR] Falta Python 3. Prueba desde movil:
echo https://akl74.github.io/gasto360-cloud/pruebas-r89/
pause
exit /b 1
:RUN
start "Gasto360 R8.9 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R89.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18989/"
echo Abierto http://127.0.0.1:18989/
echo Para detenerlo cierra la ventana SERVIDOR.
pause
endlocal
