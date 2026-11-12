@echo off
setlocal
chcp 65001 >nul
title Gasto360 R8.14 - Desglose inteligente
cd /d "%~dp0"
echo ===========================================================
echo GASTO360 R8.14 - DESGLOSE INTELIGENTE DE COMPRAS
echo Laboratorio aislado. No modifica HUB ni Supabase.
echo ===========================================================
where py >nul 2>nul
if %errorlevel% equ 0 goto LISTO
where python >nul 2>nul
if %errorlevel% equ 0 goto LISTO
echo [ERROR] Python 3 no esta instalado. Usa la web HTTPS del LEEME.
pause
exit /b 1
:LISTO
start "Gasto360 R8.14 - SERVIDOR" "%~dp0SERVIDOR_GASTO360_R814.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:18914/"
echo Abierto en http://127.0.0.1:18914/
echo Cierra la ventana SERVIDOR para detener.
pause
endlocal
