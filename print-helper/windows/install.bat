@echo off
setlocal
title Moe's POS - Printer Helper Setup
echo.
echo  ==== Moe's Hot Chicken - Printer Helper Setup ====
echo.
set "DEST=%LOCALAPPDATA%\MoesPrintHelper"
set "PRINTER=Black Copper"
set "SHARE=BlackCopper"

rem 1) Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js not found - installing Node.js LTS ...
  where winget >nul 2>nul
  if not errorlevel 1 (
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
  ) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi'; $f=\"$env:TEMP\node-lts.msi\"; Invoke-WebRequest $u -OutFile $f; Start-Process msiexec.exe -Wait -ArgumentList '/i',$f,'/qn'"
  )
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
where node >nul 2>nul || (echo  Could not install Node.js. Install it from https://nodejs.org then run this again. & pause & exit /b 1)
echo  Node.js OK.

rem 2) Copy the helper
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0server.cjs" "%DEST%\server.cjs" >nul || (echo  server.cjs missing next to this file. & pause & exit /b 1)
copy /y "%~dp0start-helper.vbs" "%DEST%\start-helper.vbs" >nul
echo  Helper copied to %DEST%

rem 3) Share the USB printer so the helper can send raw receipts to it (needs Admin once)
powershell -NoProfile -Command "try{ Set-Printer -Name '%PRINTER%' -Shared $true -ShareName '%SHARE%' -ErrorAction Stop; 'Printer shared as %SHARE%' }catch{ 'NOTE: could not share printer \"%PRINTER%\" automatically. Right-click install.bat > Run as administrator, or share it manually (see guide).' }"

rem 4) Start on login
copy /y "%DEST%\start-helper.vbs" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Moes Print Helper.vbs" >nul
echo  Will start automatically when you log in.

rem 5) Start now
wscript "%DEST%\start-helper.vbs"
timeout /t 3 >nul
powershell -NoProfile -Command "try{ (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9123/health).Content }catch{ 'Helper did not answer yet - restart the PC and try again.' }"
echo.
echo  Done. Open the POS, go to Settings and press "Test print".
pause
