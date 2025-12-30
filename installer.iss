; Quantum Scheduler Inno Setup Script

#define MyAppName "Quantum Scheduler"
#define MyAppVersion "8.27"
#define MyAppPublisher "Quantum Team"
#define MyAppURL "http://localhost:8088"
#define MyAppExeName "QuantumScheduler.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={src}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=
OutputDir=dist
OutputBaseFilename=QuantumScheduler_Setup
SetupIconFile=icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "윈도우 시작 시 자동 실행"; GroupDescription: "추가 옵션:"

[Files]
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "list\*"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
Filename: "http://localhost:8088"; Description: "브라우저에서 열기"; Flags: shellexec postinstall skipifsilent unchecked

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: startup

[UninstallDelete]
Type: files; Name: "{app}\server\schedule.json.bak"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  FirewallCmd: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Create data directory
    ForceDirectories(ExpandConstant('{app}\server\list'));
    
    // Add Windows Firewall rule for port 8088
    FirewallCmd := 'netsh advfirewall firewall add rule name="Quantum Scheduler" ' +
                   'dir=in action=allow protocol=TCP localport=8088 ' +
                   'program="' + ExpandConstant('{app}\{#MyAppExeName}') + '" ' +
                   'enable=yes description="Quantum Scheduler 네트워크 접속 허용"';
    
    if Exec('cmd.exe', '/c ' + FirewallCmd, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      if ResultCode = 0 then
        Log('Firewall rule added successfully')
      else
        Log('Failed to add firewall rule: ' + IntToStr(ResultCode));
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
  MsgResult: Integer;
  ResultCode: Integer;
  FirewallCmd: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    DataDir := ExpandConstant('{app}\server\list');
    if DirExists(DataDir) then
    begin
      MsgResult := MsgBox('프로젝트 데이터를 보존하시겠습니까?' + #13#10 + 
                          'Do you want to keep your project data?' + #13#10 + #13#10 +
                          DataDir, mbConfirmation, MB_YESNO);
      if MsgResult = IDNO then
      begin
        DelTree(DataDir, True, True, True);
      end;
    end;
    
    // Remove firewall rule
    FirewallCmd := 'netsh advfirewall firewall delete rule name="Quantum Scheduler"';
    Exec('cmd.exe', '/c ' + FirewallCmd, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
