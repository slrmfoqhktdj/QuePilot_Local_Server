#define MyAppName "Quepilot 데스크탑 앱"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Quepilot"

[Setup]
AppId={{C5D6E7F8-A9B0-1C2D-E3F4-5061728394A5}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=output
OutputBaseFilename=Quepilot_Desktop_Setup_{#MyAppVersion}
SetupIconFile=icon.ico
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\que_pilot_admin_01.exe
CloseApplications=yes

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 바로가기 생성"; GroupDescription: "추가 옵션:"

[Files]
Source: "admin\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Quepilot 데스크탑 앱"; Filename: "{app}\que_pilot_admin_01.exe"; IconFilename: "{app}\icon.ico"
Name: "{group}\Quepilot 제거"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Quepilot 데스크탑 앱"; Filename: "{app}\que_pilot_admin_01.exe"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\que_pilot_admin_01.exe"; Flags: nowait postinstall skipifsilent; Description: "데스크탑 앱 바로 시작"

[UninstallRun]
Filename: "taskkill"; Parameters: "/f /im que_pilot_admin_01.exe"; Flags: runhidden waituntilterminated; RunOnceId: "KillAdminApp"

[UninstallDelete]
Type: dirifempty; Name: "{app}"

[Code]
const
  HWND_TOPMOST = -1;
  SWP_NOMOVE = 2;
  SWP_NOSIZE = 1;
  SWP_NOACTIVATE = $10;
  SWP_SHOWWINDOW = $40;

function SetWindowPos(hWnd: HWND; hWndInsertAfter: HWND; X: Integer; Y: Integer;
  cx: Integer; cy: Integer; uFlags: UINT): BOOL;
  external 'SetWindowPos@user32.dll stdcall';

// 설치 마법사가 다른 창에 가려지지 않도록 항상 최상위로
procedure InitializeWizard;
begin
  SetWindowPos(WizardForm.Handle, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE or SWP_NOSIZE or SWP_NOACTIVATE or SWP_SHOWWINDOW);
end;
