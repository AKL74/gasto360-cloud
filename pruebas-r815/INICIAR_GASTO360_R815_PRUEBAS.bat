@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.15 - Rescate de desglose OCR
cd /d "%~dp0"
echo ============================================================
echo GASTO360 R8.15 - LABORATORIO INDEPENDIENTE
echo Rescate de productos, descuentos e IVA (sin Supabase/HUB)
echo ============================================================
where py >nul 2>nul
if %errorlevel% equ 0 goto LISTO
where python >nul 2>nul
if %errorlevel% equ 0 goto LISTO
echo [ERROR] Falta Python 3. Abre la pagina HTTPS en el telefono.
pause
exit /b 1
:LISTO
start "Gasto360 R8.15 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R815.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18915/"
echo Abierto en http://127.0.0.1:18915/
pause
endlocal
