# ARQX Atlas agent — Windows install (run as Administrator).
# Installs the Go .exe and registers it to auto-start at user logon via Task
# Scheduler (a logon task runs in the user session, so per-user detection works;
# a plain console .exe is not Service-Control-aware, so a logon task is more robust
# than sc.exe create). Run from the folder containing arqx-agent-windows-amd64.exe.
$ErrorActionPreference = "Stop"
$Name = "ArqxAtlasAgent"
$Dir  = Join-Path $env:ProgramFiles "ARQX Atlas Agent"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Copy-Item (Join-Path $here "arqx-agent-windows-amd64.exe") (Join-Path $Dir "arqx-agent.exe") -Force
Copy-Item (Join-Path $here "..\signatures.json") $Dir -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $here "..\arqx-logo.png")  $Dir -Force -ErrorAction SilentlyContinue

$exe = Join-Path $Dir "arqx-agent.exe"
$action  = New-ScheduledTaskAction -Execute $exe
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Force -RunLevel Highest -Description "DRMShield endpoint protection agent (ARQX Atlas)"
Start-ScheduledTask -TaskName $Name
Write-Host "Installed. ARQX Atlas agent starts at logon and is running now (http://127.0.0.1:7891)."
Write-Host "Uninstall: Unregister-ScheduledTask -TaskName $Name -Confirm:`$false ; Remove-Item -Recurse '$Dir'"
