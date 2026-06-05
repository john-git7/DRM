@echo off
rem ARQX Atlas Agent — per-user installer (no admin rights required).
rem Copies the portable bundle to %LOCALAPPDATA%\ARQX Atlas Agent, adds a Startup
rem shortcut so it launches at login, and starts it now.
setlocal EnableExtensions
set "APP=ARQX Atlas Agent"
set "DEST=%LOCALAPPDATA%\%APP%"
set "SRC=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Installing %APP% to "%DEST%" ...
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%" 2>nul
xcopy /e /i /y /q "%SRC%python" "%DEST%\python" >nul
xcopy /e /i /y /q "%SRC%app"    "%DEST%\app"    >nul
copy /y "%SRC%launch-tray.vbs" "%DEST%\" >nul
copy /y "%SRC%run-agent.bat"   "%DEST%\" >nul
copy /y "%SRC%uninstall.bat"   "%DEST%\" >nul

echo Registering autostart (Startup shortcut) ...
set "MK=%TEMP%\arqx_mkshortcut.vbs"
> "%MK%" echo Set s=CreateObject("WScript.Shell")
>>"%MK%" echo Set lnk=s.CreateShortcut("%STARTUP%\%APP%.lnk")
>>"%MK%" echo lnk.TargetPath="%SystemRoot%\System32\wscript.exe"
>>"%MK%" echo lnk.Arguments=Chr(34) ^& "%DEST%\launch-tray.vbs" ^& Chr(34)
>>"%MK%" echo lnk.WorkingDirectory="%DEST%"
>>"%MK%" echo lnk.Description="%APP%"
>>"%MK%" echo lnk.Save
cscript //nologo "%MK%" >nul
del "%MK%" >nul 2>&1

echo Starting %APP% ...
start "" "%SystemRoot%\System32\wscript.exe" "%DEST%\launch-tray.vbs"

echo.
echo Installed. The agent is running on http://127.0.0.1:7891 and starts at login.
echo To remove it later, run: "%DEST%\uninstall.bat"
pause
endlocal
