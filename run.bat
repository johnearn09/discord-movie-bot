@echo off
:: Change directory to the folder where this batch file is located
cd /d "%~dp0"

echo Running Discord Movie Feed Automation (Single Run)...
node src\index.js

:: If run manually (not by task scheduler), keep window open on error
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Script exited with code %errorlevel%
    pause
)
