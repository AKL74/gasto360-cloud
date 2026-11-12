@echo off
setlocal
chcp 65001 >nul
title Restaurar Gasto360 antes R8.18
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RESTAURAR_GASTO360_HUB_ANTES_R818.ps1"
pause
