@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.18 - Actualizar aplicacion del HUB
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR_GASTO360_HUB_R818.ps1"
set "rc=%ERRORLEVEL%"
if not "%rc%"=="0" (
 echo.
 echo La version instalada no se ha activado. Consulta el mensaje anterior.
)
echo.
pause
exit /b %rc%
