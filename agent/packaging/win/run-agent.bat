@echo off
rem ARQX Atlas Agent — run the headless detector with a console (for debugging).
rem The tray (launch-tray.vbs) is the normal entry point; this just shows logs.
cd /d "%~dp0"
"%~dp0python\python.exe" "%~dp0app\agent.py"
