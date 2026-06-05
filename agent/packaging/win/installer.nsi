; ARQX Atlas Agent — NSIS installer script (builds a Windows setup.exe).
; Cross-built from Linux with makensis. Wraps the embeddable-Python bundle.
; Invoked by packaging/build-win-installer.sh with:
;   makensis -DBUNDLE=<bundle dir> -DVERSION=<x.y.z> -DOUTFILE=<out.exe> installer.nsi
; Per-user install (no admin), autostarts the silent tray at login.

Unicode true
Name "ARQX Atlas Agent"

!ifndef VERSION
  !define VERSION "2.0.0"
!endif
!ifndef OUTFILE
  !define OUTFILE "arqx-atlas-agent-${VERSION}-setup.exe"
!endif
!ifndef BUNDLE
  !error "Pass -DBUNDLE=<path to the win bundle dir>"
!endif
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ARQXAtlasAgent"

OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\ARQX Atlas Agent"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show
BrandingText "ARQX Atlas ${VERSION}"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "ARQX Atlas Agent" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "${BUNDLE}/launch-tray.vbs"
  File "${BUNDLE}/run-agent.bat"
  SetOutPath "$INSTDIR\app"
  File /r "${BUNDLE}/app/*"
  SetOutPath "$INSTDIR\python"
  File /r "${BUNDLE}/python/*"

  ; Start at login via the silent VBS launcher.
  CreateShortcut "$SMSTARTUP\ARQX Atlas Agent.lnk" "$SYSDIR\wscript.exe" \
    '"$INSTDIR\launch-tray.vbs"' "$SYSDIR\wscript.exe" 0 SW_SHOWNORMAL "" "ARQX Atlas Agent"

  ; Per-user uninstall registration (Add/Remove Programs).
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "ARQX Atlas Agent"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "ARQX Atlas"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  ; Launch immediately (hidden).
  Exec '"$SYSDIR\wscript.exe" "$INSTDIR\launch-tray.vbs"'
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /f /im pythonw.exe'
  Delete "$SMSTARTUP\ARQX Atlas Agent.lnk"
  RMDir /r "$INSTDIR\python"
  RMDir /r "$INSTDIR\app"
  Delete "$INSTDIR\launch-tray.vbs"
  Delete "$INSTDIR\run-agent.bat"
  Delete "$INSTDIR\uninstall.exe"
  DeleteRegKey HKCU "${UNINSTKEY}"
  RMDir "$INSTDIR"
SectionEnd
