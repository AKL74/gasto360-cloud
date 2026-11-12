@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.6 - Iniciador de pruebas
cd /d "%~dp0"
echo ============================================================
echo  GASTO360 R8.6 - ESCANER EN MODO PRUEBAS (SIN NUBE)
echo ============================================================
echo.
echo  Este entorno NO modifica Gasto360, Supabase ni el HUB.
echo  Puerto local exclusivo: 18986
echo.
where py >nul 2>nul
if %errorlevel% equ 0 goto PY_OK
where python >nul 2>nul
if %errorlevel% equ 0 goto PY_OK
echo [ERROR] No se encuentra Python.
echo Instala Python 3 o utiliza la URL HTTPS de pruebas del README.
pause
exit /b 1
:PY_OK
echo [1/3] Carpeta: %CD%
echo [2/3] Abriendo servidor local en una ventana independiente...
start "Gasto360 R8.6 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R86.bat"
timeout /t 3 /nobreak >nul
echo [3/3] Abriendo navegador local...
start "" "http://127.0.0.1:18986/"
echo.
echo Si ya tenias otro servicio en ese puerto, cierra su ventana.
echo Si no se abre, utiliza http://127.0.0.1:18986/
echo Para DETENER, cierra la ventana Gasto360 R8.6 - SERVIDOR.
echo.
pause
endlocal
