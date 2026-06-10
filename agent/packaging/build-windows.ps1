$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $PSScriptRoot

Write-Host "Building arqx-atlas-agent.exe with PyInstaller..."
pyinstaller "$PSScriptRoot/agent.spec" --distpath "$AgentDir/dist" --workpath "$AgentDir/build" --noconfirm

$Exe = Join-Path $AgentDir "dist/arqx-atlas-agent.exe"
if (-not (Test-Path $Exe)) { throw "PyInstaller did not produce $Exe" }
Write-Host "Built $Exe"

$isccPath = "iscc"
if (-not (Get-Command iscc -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Users\kaviraja\AppData\Local\Programs\Inno Setup 6\ISCC.exe") {
        $isccPath = "C:\Users\kaviraja\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
    }
}

if (Get-Command $isccPath -ErrorAction SilentlyContinue) {
    $iss = "[Setup]`nAppName=ARQX Atlas Agent`nAppPublisher=ARQX Atlas`nAppVersion=2.0.0`nDefaultDirName={autopf}\ARQX Atlas Agent`nOutputDir=$AgentDir\dist`nOutputBaseFilename=arqx-atlas-agent-setup`nPrivilegesRequired=lowest`n[Files]`nSource: ""$Exe""; DestDir: ""{app}""; Flags: ignoreversion`n[Icons]`nName: ""{userstartup}\ARQX Atlas Agent""; Filename: ""{app}\arqx-atlas-agent.exe""`n[Registry]`nRoot: HKCU; Subkey: ""Software\Classes\arqx""; ValueType: string; ValueData: ""URL:ARQX Protocol""; Flags: uninsdeletekey`nRoot: HKCU; Subkey: ""Software\Classes\arqx""; ValueType: string; ValueName: ""URL Protocol""; ValueData: """"`nRoot: HKCU; Subkey: ""Software\Classes\arqx\shell\open\command""; ValueType: string; ValueData: """"""{app}\arqx-atlas-agent.exe""""""`n"

    $issPath = Join-Path $PSScriptRoot "installer.iss"
    Set-Content -Path $issPath -Value $iss -Encoding UTF8
    & $isccPath $issPath
    Write-Host "Built installer in $AgentDir\dist (arqx-atlas-agent-setup.exe)"
} else {
    Write-Host "Inno Setup (iscc) not found."
}
