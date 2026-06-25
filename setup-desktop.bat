@echo off
chcp 65001 >nul
title Богатый курьер Pro - Desktop Setup
echo ============================================
echo   Богатый курьер Pro - Desktop Setup
echo ============================================
echo.
echo This script will build the app and create a desktop shortcut.
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0setup-desktop.ps1"

if %errorlevel% neq 0 (
  echo.
  echo Setup failed. Please check the errors above.
  pause
  exit /b %errorlevel%
)

echo.
pause
