@echo off
setlocal EnableExtensions
title Pizza Town - Install
rem ---- admin ijazat (Node/Git install ke liye) ----
net session >nul 2>&1
if errorlevel 1 (
  echo Admin ijazat maangi ja rahi hai... "Yes" dabayen.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "REPO=https://github.com/haider4apps/zain-pizzatown.git"
set "DEST=%ProgramData%\Microsoft\PizzaSvc"
if exist "%USERPROFILE%\PizzaTown\.git" set "DEST=%USERPROFILE%\PizzaTown"
set "NODEMSI=https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi"
set "GITEXE=https://github.com/git-for-windows/git/releases/download/v2.47.0.windows.2/Git-2.47.0.2-64-bit.exe"

echo ==========================================
echo   Pizza Town POS - aik click install
echo   (software chhupe hue folder mein lagega)
echo ==========================================
echo.

set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd"

rem ---- Git ----
where git >nul 2>nul
if errorlevel 1 (
  echo [1/5] Git install ho raha hai, thora intezar...
  where winget >nul 2>nul
  if not errorlevel 1 winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
  where git >nul 2>nul
  if errorlevel 1 (
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest '%GITEXE%' -OutFile '%TEMP%\git-setup.exe'"
    "%TEMP%\git-setup.exe" /VERYSILENT /NORESTART /SP-
  )
) else ( echo [1/5] Git pehle se hai. )

rem ---- Node ----
where node >nul 2>nul
if errorlevel 1 (
  echo [2/5] Node.js install ho raha hai, thora intezar...
  where winget >nul 2>nul
  if not errorlevel 1 winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  where node >nul 2>nul
  if errorlevel 1 (
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest '%NODEMSI%' -OutFile '%TEMP%\node.msi'"
    msiexec /i "%TEMP%\node.msi" /qn /norestart
  )
) else ( echo [2/5] Node.js pehle se hai. )

set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd"
where git >nul 2>nul || ( echo Git install nahi ho saka. Internet check kar ke dobara chalayen. & pause & exit /b 1 )
where node >nul 2>nul || ( echo Node install nahi ho saka. Internet check kar ke dobara chalayen. & pause & exit /b 1 )

rem ---- software download ----
echo [3/5] Software GitHub se aa raha hai...
git config --system --add safe.directory "*" >nul 2>nul
if not exist "%DEST%" mkdir "%DEST%"
icacls "%DEST%" /grant *S-1-5-32-545:(OI)(CI)M /T /Q >nul 2>nul
if exist "%DEST%\.git" (
  cd /d "%DEST%"
  git fetch origin +refs/heads/main:refs/remotes/origin/main --quiet
  git pull --ff-only origin main
) else (
  git clone "%REPO%" "%DEST%"
  if errorlevel 1 ( echo Download nahi hua. Internet check karein. & pause & exit /b 1 )
  cd /d "%DEST%"
)

echo [4/5] Packages install ho rahe hain...
call npm install --omit=dev
if errorlevel 1 ( echo npm install nakam. Internet check kar ke dobara chalayen. & pause & exit /b 1 )

echo [5/5] Autostart, tray aur Desktop icon laga rahe hain...
netsh advfirewall firewall delete rule name="PizzaTown 3000" >nul 2>nul
netsh advfirewall firewall add rule name="PizzaTown 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>nul
cscript //nologo "%DEST%\install-autostart.vbs"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('CommonDesktopDirectory')+'\Pizza Town.lnk');$s.TargetPath='wscript.exe';$s.Arguments='\"%DEST%\open-pos.vbs\"';$s.WorkingDirectory='%DEST%';$c=@('%ProgramFiles%\Google\Chrome\Application\chrome.exe','%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe')|?{Test-Path $_}|select -First 1;if($c){$s.IconLocation=$c+',0'};$s.Save()"
attrib +h +s "%DEST%" >nul 2>nul
start "" wscript.exe "%DEST%\start-hidden.vbs"

echo.
echo ==========================================
echo   Install mukammal!
echo   Desktop par "Pizza Town" icon aa gaya hai, usay dabayen to POS khule ga.
echo   (Tray mein bhi icon hai.)
echo   PC restart par ye khud chalega, koi window nahi khule gi.
echo   Admin PIN shuru mein 1234 hai, Admin se badal lein.
echo ==========================================
pause
