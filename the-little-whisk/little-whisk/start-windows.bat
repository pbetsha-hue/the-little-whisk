@echo off
title The Little Whisk
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet.
  echo   Download the LTS version from https://nodejs.org , install it,
  echo   then double-click this file again.
  echo.
  pause
  exit /b
)

if not exist "data\little-whisk.db" (
  echo Setting up the shop for the first time...
  node --disable-warning=ExperimentalWarning src\seed.js
)

start "" http://localhost:3000
echo.
echo   The Little Whisk is running.
echo   Shop:  http://localhost:3000
echo   Admin: http://localhost:3000/admin
echo.
echo   Keep this window open while the shop is running.
echo   Close it to stop the shop.
echo.
node --disable-warning=ExperimentalWarning src\server.js
pause
