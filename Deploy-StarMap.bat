@echo off
echo Starting StarMap Deployment...
powershell.exe -ExecutionPolicy Bypass -File "%~dp0Deploy-StarMap.ps1"
pause
