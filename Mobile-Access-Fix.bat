@echo off
net session >nul 2>&1
if errorlevel 1 (
  echo Admin ijazat maangi ja rahi hai... "Yes" dabayen.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall delete rule name="PizzaTown 3000" >nul 2>nul
netsh advfirewall firewall add rule name="PizzaTown 3000" dir=in action=allow protocol=TCP localport=3000 profile=any
powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object {$_.NetworkCategory -eq 'Public'} | Set-NetConnectionProfile -NetworkCategory Private" >nul 2>nul
echo.
echo Ho gaya. Ab mobile par PC ke WiFi address (ipconfig mein IPv4) ke saath :3000 likh kar kholen.
pause
