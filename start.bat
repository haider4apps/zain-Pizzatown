@echo off
cd /d "%~dp0"
rem Git/Node abhi install hue hon to PATH mein shamil karo
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd"
where node >nul 2>nul || ( echo Node.js install nahi hai. Pehle setup.bat chalayen. & pause & exit /b 1 )
if not exist node_modules call npm install --omit=dev
start "PizzaTown Server" /min cmd /c "run-server.bat"
timeout /t 3 /nobreak >nul
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
start "" "%CHROME%" --kiosk-printing --user-data-dir="%~dp0chrome-profile" --app=http://localhost:3000
