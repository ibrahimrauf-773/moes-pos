@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Moes Print Helper.vbs" 2>nul
taskkill /f /fi "WINDOWTITLE eq Moe*" >nul 2>nul
wmic process where "commandline like '%%MoesPrintHelper%%server.cjs%%'" delete >nul 2>nul
rmdir /s /q "%LOCALAPPDATA%\MoesPrintHelper" 2>nul
echo Print helper removed. & pause
