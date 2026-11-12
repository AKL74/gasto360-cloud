@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.8 - Pruebas OCR
cd /d "%~dp0"
echo ===================================================
echo  GASTO360 R8.8 - PRUEBAS SIN SUPABASE NI HUB
echo ===================================================
where py >nul 2>nul
if %errorlevel% equ 0 goto PY_OK
where python >nul 2>nul
if %errorlevel% equ 0 goto PY_OK
echo ERROR: Es necesario Python 3. Puedes usar la web HTTPS:
echo https://akl74.github.io/gasto360-cloud/pruebas-r88/
pause
exit /b 1
:PY_OK
start "Gasto360 R8.8 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R88.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18988/"
echo.
echo Abierto http://127.0.0.1:18988/
echo Para DETENER, cierra la ventana del servidor.
pause
endlocal
