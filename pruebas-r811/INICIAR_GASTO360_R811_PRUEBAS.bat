@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.11 - Verificacion OCR
cd /d "%~dp0"
echo =============================================
echo GASTO360 R8.11 - RESTAURACION DEL ESCANER
echo =============================================
echo Pruebas aisladas, NO modifican el HUB ni Supabase.
where py >nul 2>nul
if %errorlevel% equ 0 goto EJECUTAR
where python >nul 2>nul
if %errorlevel% equ 0 goto EJECUTAR
echo [ERROR] Se necesita Python 3.
echo Usa el enlace movil HTTPS del archivo LEEME_PRIMERO.txt.
pause
exit /b 1
:EJECUTAR
start "Gasto360 R8.11 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R811.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18911/"
echo Servidor: http://127.0.0.1:18911/
echo Cierra la ventana SERVIDOR para detenerlo.
pause
endlocal
