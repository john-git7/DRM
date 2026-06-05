@echo off
rem ARQX Atlas Agent — per-user uninstaller. Stops the agent, removes the Startup
rem shortcut, and deletes the install folder.
setlocal EnableExtensions
set "APP=ARQX Atlas Agent"
set "DEST=%LOCALAPPDATA%\%APP%"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Stopping %APP% ...
rem The tray runs under pythonw.exe; this stops it (and any other pythonw apps).
taskkill /f /im pythonw.exe >nul 2>&1
taskkill /f /im python.exe  >nul 2>&1

echo Removing autostart shortcut ...
if exist "%STARTUP%\%APP%.lnk" del /f /q "%STARTUP%\%APP%.lnk"

echo Removing files ...
rem cd out of the folder first (this script lives inside it) so it can be deleted.
cd /d "%TEMP%"
if exist "%DEST%" rmdir /s /q "%DEST%"

echo Removed %APP%.
pause
endlocal
