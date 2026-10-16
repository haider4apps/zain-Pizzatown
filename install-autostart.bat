@echo off
cd /d "%~dp0"
echo.
echo  Pizza Town: PC chalu hote hi khud chalne ka intezam
echo.
cscript //nologo "%~dp0install-autostart.vbs"
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PizzaTown.lnk" ( echo  Startup mein laga diya gaya. ) else ( echo  Masla aaya, shortcut nahi bana. )
echo.
echo  NOTE: agar purani kali "PizzaTown Server" window khuli hai to usay pehle band kar dein,
echo  warna dono aik saath nahi chalen ge.
echo.
echo  Ab server chala rahe hain, taskbar ke tray (ghari ke paas ^) mein Pizza Town ka icon aayega.
start "" wscript.exe "%~dp0start-hidden.vbs"
echo.
pause
