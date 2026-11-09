@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" goto preparar
if not exist "dist\renderer.js" goto preparar
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
:preparar
echo Primero ejecuta scripts\Preparar.ps1 como se indica en README.md.
pause
exit /b 1
