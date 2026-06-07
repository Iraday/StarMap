@echo off
chcp 65001 >nul
cd /d "%~dp0"

for /f "usebackq" %%s in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"`) do set STAMP=%%s
set DEST=backup\%STAMP%

mkdir "%DEST%"

copy /Y "data\stars.sqlite"      "%DEST%\" >nul
copy /Y "app.js"                 "%DEST%\" >nul
copy /Y "ships.js"               "%DEST%\" >nul
copy /Y "index.html"             "%DEST%\" >nul
copy /Y "styles.css"             "%DEST%\" >nul
copy /Y "star_data.js"           "%DEST%\" >nul
copy /Y "stars_reality.json"     "%DEST%\" >nul 2>nul
copy /Y "scripts\seed_data.py"   "%DEST%\" >nul
if exist "saves" xcopy /E /I /Y "saves" "%DEST%\saves" >nul

echo Backed up to %DEST%
