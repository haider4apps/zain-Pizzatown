@echo off
cd /d "%~dp0"
set "PATH=%PATH%;%ProgramFiles%\Git\cmd"
git config --global --add safe.directory "*"
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git config core.autocrlf false
git fetch origin
git branch --set-upstream-to=origin/main main
git status -sb
echo.
echo Ho gaya. Ab Admin se "Check for update" dabayen.
pause
