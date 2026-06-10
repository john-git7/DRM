[Setup]
AppName=ARQX Atlas Agent
AppPublisher=ARQX Atlas
AppVersion=2.0.0
DefaultDirName={autopf}\ARQX Atlas Agent
OutputDir=..\dist
OutputBaseFilename=arqx-atlas-agent-setup
PrivilegesRequired=lowest

[Files]
Source: "..\dist\arqx-atlas-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userstartup}\ARQX Atlas Agent"; Filename: "{app}\arqx-atlas-agent.exe"

[Registry]
Root: HKCU; Subkey: "Software\Classes\arqx"; ValueType: string; ValueData: "URL:ARQX Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\arqx"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\arqx\shell\open\command"; ValueType: string; ValueData: """{app}\arqx-atlas-agent.exe"" ""%1"""
