@echo off
cd /d "%~dp0"
title PizzaTown Server
:loop
node server.js
rem exit code 3 = software update ke baad dobara chalao
if %errorlevel%==3 (
  timeout /t 2 /nobreak >nul
  goto loop
)
if %errorlevel%==2 exit /b 0
echo.
echo Server band ho gaya (code %errorlevel%). 10 second mein dobara chalega...
timeout /t 10 >nul
goto loop
