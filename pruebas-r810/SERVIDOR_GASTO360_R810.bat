@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.10 - Servidor de pruebas
cd /d "%~dp0"
echo Modo local R8.10 en http://127.0.0.1:18910/
echo SIN escrituras en Supabase
where py >nul 2>nul
if %errorlevel% equ 0 (
 py -3 -m http.server 18910 --bind 127.0.0.1
) else (
 python -m http.server 18910 --bind 127.0.0.1
)
if errorlevel 1 echo [ERROR] Comprueba el puerto 18910.
pause
endlocal
