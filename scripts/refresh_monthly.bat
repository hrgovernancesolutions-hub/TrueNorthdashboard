@echo off
REM ============================================================
REM  True North Dashboard - Monthly Data Refresh (Windows)
REM
REM  HOW TO USE:
REM    1. Export the latest data from the source system.
REM    2. Drop that file into the "incoming" folder next to this script.
REM    3. Double-click this file (refresh_monthly.bat).
REM    4. The finished data\dashboard_data.js is revealed in File
REM       Explorer, ready to drag into GitHub Desktop (or drop into
REM       github.com's upload area) and commit/push.
REM
REM  ONE-TIME SETUP (optional but recommended): if you keep a local
REM  clone of your GitHub repo, set GITHUB_REPO_PATH below to that
REM  repo's data\dashboard_data.js path. The script will then write
REM  the refreshed file directly into your repo folder too, so all
REM  that's left is to commit and push in GitHub Desktop -- no manual
REM  copying at all.
REM ============================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "GITHUB_REPO_PATH="
REM Example: set "GITHUB_REPO_PATH=C:\Users\You\Documents\GitHub\true-north-dashboard\data\dashboard_data.js"

set "LATEST="
for /f "delims=" %%F in ('dir /b /o-d /a-d "incoming\*.xlsx" "incoming\*.csv" 2^>nul') do (
    if not defined LATEST set "LATEST=%%F"
)

if not defined LATEST (
    echo.
    echo ERROR: No .xlsx or .csv file found in the "incoming" folder.
    echo Drop this month's export there first, then run this script again.
    echo.
    pause
    exit /b 1
)

echo.
echo Using latest export: incoming\%LATEST%
echo.

set "OUTPUT_FILE=..\data\dashboard_data.js"
python update_dashboard.py --input "incoming\%LATEST%" --output "%OUTPUT_FILE%"

if %errorlevel% neq 0 (
    echo.
    echo Something went wrong -- see the message above.
    echo Common cause: the export is missing a required column.
    echo.
    pause
    exit /b 1
)

set "FINAL_PATH=%CD%\%OUTPUT_FILE%"

if defined GITHUB_REPO_PATH (
    for %%P in ("%GITHUB_REPO_PATH%") do set "GH_DIR=%%~dpP"
    if not exist "!GH_DIR!" mkdir "!GH_DIR!"
    copy /Y "%OUTPUT_FILE%" "%GITHUB_REPO_PATH%" >nul
    set "FINAL_PATH=%GITHUB_REPO_PATH%"
    echo.
    echo Also copied straight into your GitHub repo folder:
    echo   !FINAL_PATH!
)

echo.
echo ============================================================
echo  Refresh complete.
echo  File ready at:
echo    !FINAL_PATH!
if defined GITHUB_REPO_PATH (
    echo  Next step: open GitHub Desktop, commit, and push.
) else (
    echo  Next step: grab this file and replace it in your GitHub
    echo  repo ^(drag into GitHub Desktop, or drop it on github.com's
    echo  upload page^), then commit and push.
    echo  Tip: set GITHUB_REPO_PATH at the top of this script to skip
    echo  this manual copy step next time.
)
echo ============================================================
echo.

REM Reveal the file in File Explorer so it's one drag away from GitHub Desktop
explorer /select,"!FINAL_PATH!"

pause
