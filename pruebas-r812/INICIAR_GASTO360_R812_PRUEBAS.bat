@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.12 - OCR y deteccion de papel
cd /d "%~dp0"
echo ==============================================
echo GASTO360 R8.12 - LABORATORIO INDEPENDIENTE
echo ==============================================
echo No escribe en HUB ni Supabase.
where py >nul 2>nul
if %errorlevel% equ 0 goto INICIAR
where python >nul 2>nul
if %errorlevel% equ 0 goto INICIAR
echo [ERROR] No hay Python 3. Usa la URL HTTPS del LEEME.
pause
exit /b 1
:INICIAR
start "Gasto360 R8.12 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R812.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18912/"
echo Abierto en http://127.0.0.1:18912/
echo Cierra la ventana del SERVIDOR para detener.
pause
endlocal
