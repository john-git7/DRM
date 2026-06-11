@echo off
taskkill /F /IM arqx-atlas-agent.exe /T
copy /Y "d:\DRM\agent\dist\arqx-atlas-agent.exe" "%LOCALAPPDATA%\Programs\ARQX Atlas Agent\arqx-atlas-agent.exe"
start "" "%LOCALAPPDATA%\Programs\ARQX Atlas Agent\arqx-atlas-agent.exe"
