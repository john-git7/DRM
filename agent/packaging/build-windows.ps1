$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $PSScriptRoot

Write-Host "Building arqx-atlas-agent.exe with PyInstaller..."
pyinstaller "$PSScriptRoot/agent.spec" --distpath "$AgentDir/dist" --workpath "$AgentDir/build" --noconfirm

$Exe = Join-Path $AgentDir "dist/arqx-atlas-agent.exe"
if (-not (Test-Path $Exe)) { throw "PyInstaller did not produce $Exe" }
Write-Host "Built $Exe"

$isccPath = "iscc"
if (-not (Get-Command iscc -ErrorAction SilentlyContinue)) {
    if (Test-Path "$env:LocalAppData\Programs\Inno Setup 6\ISCC.exe") {
        $isccPath = "$env:LocalAppData\Programs\Inno Setup 6\ISCC.exe"
    }
}

if (Get-Command $isccPath -ErrorAction SilentlyContinue) {
    $issPath = Join-Path $PSScriptRoot "installer.iss"
    & $isccPath $issPath
    Write-Host "Built installer in $AgentDir\dist (arqx-atlas-agent-setup.exe)"
} else {
    Write-Host "Inno Setup (iscc) not found."
}
