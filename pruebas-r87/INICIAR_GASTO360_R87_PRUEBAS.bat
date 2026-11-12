@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.7 - Arranque de pruebas OCR
cd /d "%~dp0"
echo =======================================================
echo   GASTO360 R8.7 - LABORATORIO OCR AISLADO
echo =======================================================
echo No modifica tu HUB, Supabase ni los datos de Gasto360.
echo.
where py >nul 2>nul
if %errorlevel% equ 0 goto PREPARADO
where python >nul 2>nul
if %errorlevel% equ 0 goto PREPARADO
echo [ERROR] No se encuentra Python 3. Prueba la web desde:
echo https://akl74.github.io/gasto360-cloud/pruebas-r87/
pause
exit /b 1
:PREPARADO
echo [1/3] Iniciando servidor local en puerto 18987...
start "Gasto360 R87 SERVIDOR" "%~dp0SERVIDOR_GASTO360_R87.bat"
timeout /t 3 /nobreak >nul
echo [2/3] Abriendo navegador...
start "" "http://127.0.0.1:18987/"
echo [3/3] Abre el menu Escaner para realizar lecturas OCR.
echo.
echo Cierra la ventana Gasto360 R87 SERVIDOR para detener.
echo.
pause
endlocal
