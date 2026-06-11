@echo off
cd /d "d:\DRM\agent"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\packaging\build-windows.ps1"
if errorlevel 1 (
   echo Build failed.
   exit /b 1
)
copy /Y "d:\DRM\agent\dist\arqx-atlas-agent.exe" "%LOCALAPPDATA%\Programs\ARQX Atlas Agent\arqx-atlas-agent.exe"
copy /Y "d:\DRM\agent\dist\arqx-atlas-agent-setup.exe" "d:\DRM\client\public\downloads\arqx-atlas-agent-setup.exe"
echo Done.
