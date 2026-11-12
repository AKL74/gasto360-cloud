@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.17 - Pruebas independientes
cd /d "%~dp0"
start "Servidor Gasto360 R817" "%~dp0SERVIDOR_GASTO360_R817.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18917/"
echo [OK] Prueba R8.17: http://127.0.0.1:18917
echo [SEGURIDAD] No usa tu cuenta, Supabase ni el HUB.
pause
