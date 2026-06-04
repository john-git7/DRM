# Build the ARQX Atlas agent for Windows.
# Produces a standalone .exe (PyInstaller) and, if Inno Setup is installed, an installer .exe.
# Run from the agent/ directory in PowerShell:  ./packaging/build-windows.ps1
#
# Prerequisites:
#   pip install pyinstaller
#   (optional, for the installer) Inno Setup  -> iscc.exe on PATH
#                                 or WiX Toolset -> candle/light for an .msi

$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $PSScriptRoot

Write-Host "Building arqx-atlas-agent.exe with PyInstaller..."
pyinstaller "$PSScriptRoot/agent.spec" --distpath "$AgentDir/dist" --workpath "$AgentDir/build" --noconfirm

$Exe = Join-Path $AgentDir "dist/arqx-atlas-agent.exe"
if (-not (Test-Path $Exe)) { throw "PyInstaller did not produce $Exe" }
Write-Host "Built $Exe"

# Optional MSI/EXE installer via Inno Setup (writes packaging/installer.iss on the fly).
if (Get-Command iscc -ErrorAction SilentlyContinue) {
    $iss = @"
[Setup]
AppName=ARQX Atlas Agent
AppPublisher=ARQX Atlas
AppVersion=2.0.0
DefaultDirName={autopf}\ARQX Atlas Agent
OutputDir=$AgentDir\dist
OutputBaseFilename=arqx-atlas-agent-setup
PrivilegesRequired=lowest
[Files]
Source: "$Exe"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{userstartup}\ARQX Atlas Agent"; Filename: "{app}\arqx-atlas-agent.exe"
"@
    $issPath = Join-Path $PSScriptRoot "installer.iss"
    Set-Content -Path $issPath -Value $iss -Encoding UTF8
    iscc $issPath
    Write-Host "Built installer in $AgentDir\dist (arqx-atlas-agent-setup.exe)"
} else {
    Write-Host "Inno Setup (iscc) not found — skipping installer. Distribute the .exe, or install Inno Setup / WiX for an .msi."
}
