@echo off
cd /d "%~dp0"
echo.
echo  Pizza Town - Go-Live unlock (sirf developer)
echo.
set /p CODE=Developer code likhein : 
node -e "const c=require('crypto'),D=require('better-sqlite3');if(c.createHash('sha256').update((process.argv[1]||'').trim()).digest('hex')!=='7e7d1d329a515d9f24fe2800921d22c930cfc1cc24cd75feb0c001b3885b4f46'){console.log('Code galat hai.');process.exit(1)}const db=new D('data/pizzatown.db');db.prepare(\"update settings set value='' where key='golive_done'\").run();console.log('Unlock ho gaya. Ab Admin se Go-Live dobara ho sakta hai.')" "%CODE%"
echo.
pause
