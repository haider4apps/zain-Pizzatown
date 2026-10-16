@echo off
cd /d "%~dp0"
echo.
echo  Pizza Town - Admin PIN dobara set karein
echo  (Sirf malik ye karein. Chahein to is file ko baad mein delete kar dein.)
echo.
set /p NEWPIN=Naya PIN likhein (kam az kam 4 number) : 
node -e "const D=require('better-sqlite3');const p=(process.argv[1]||'').trim();if(p.length<4){console.log('PIN chhota hai, dobara chalayein');process.exit(1)}const db=new D('data/pizzatown.db');db.prepare(\"insert into settings(key,value) values('admin_pin',?) on conflict(key) do update set value=excluded.value\").run(p);console.log('Ho gaya. Naya PIN set ho gaya.')" "%NEWPIN%"
echo.
pause
