@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.18 - Pruebas aisladas
cd /d "%~dp0"
start "Servidor Gasto360 R818" "%~dp0SERVIDOR_GASTO360_R818.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18918/"
echo [OK] Gasto360 R8.18: http://127.0.0.1:18918
echo [SEGURIDAD] Sin HUB, sin cuenta, sin Supabase.
pause
