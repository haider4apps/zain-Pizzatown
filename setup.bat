@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo   Pizza Town - Setup (sirf aik baar)
echo   Git + Node.js install aur GitHub se link
echo ==========================================
echo.

where winget >nul 2>nul
if errorlevel 1 (
  echo winget nahi mila. Windows 10/11 ka "App Installer" update karein, ya Git aur Node.js khud install karein:
  echo   https://git-scm.com/download/win   aur   https://nodejs.org
  pause & exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo [1/4] Git install ho raha hai...
  winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
) else ( echo [1/4] Git pehle se hai. )

where node >nul 2>nul
if errorlevel 1 (
  echo [2/4] Node.js install ho raha hai...
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
) else ( echo [2/4] Node.js pehle se hai. )

rem is session ke PATH mein naye programs shamil karo
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd"
where git >nul 2>nul || ( echo Git ab bhi nahi mila. PC restart kar ke setup.bat dobara chalayen. & pause & exit /b 1 )
where node >nul 2>nul || ( echo Node ab bhi nahi mila. PC restart kar ke setup.bat dobara chalayen. & pause & exit /b 1 )

echo [3/4] GitHub se link ho raha hai... (pehli baar GitHub login ki window khul sakti hai - login kar dein)
if not exist ".git" git init -b main
git remote remove origin >nul 2>nul
git remote add origin https://github.com/haider4apps/zain-pizzatown.git
git fetch origin
if errorlevel 1 ( echo GitHub se connect nahi hua. Internet / login check karein. & pause & exit /b 1 )
rem data\ backups\ node_modules\ chrome-profile\ .gitignore mein hain, un par asar nahi parta
git checkout -f -B main origin/main
git branch --set-upstream-to=origin/main main

echo [4/4] Packages install ho rahe hain...
call npm install --omit=dev

echo.
echo Setup mukammal! Ab start.bat chalayen.
pause
