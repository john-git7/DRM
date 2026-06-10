# PyInstaller spec for the ARQX Atlas agent — produces a single self-contained
# executable that bundles agent.py, signatures.json, and the logo (no Python needed
# on the target). Build with:  pyinstaller packaging/agent.spec
#
# PyInstaller builds for the host OS only: run on Windows for the .exe, on macOS for
# the .app, on Linux for the ELF binary.

import os

block_cipher = None
AGENT_DIR = os.path.abspath(os.path.join(os.getcwd()))

a = Analysis(
    ['../tray.py'],
    pathex=[AGENT_DIR],
    binaries=[],
    datas=[('../signatures.json', '.'), ('../arqx-logo.png', '.')],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name='arqx-atlas-agent',
    debug=False, strip=False, upx=True, console=False,
    icon='arqx.ico' if os.path.exists('arqx.ico') else None,
)
