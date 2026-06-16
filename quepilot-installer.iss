#define MyAppName "Quepilot Server"
#define MyAppVersion "1.0.2"
#define MyAppPublisher "Quepilot"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=output
OutputBaseFilename=Quepilot_Setup_{#MyAppVersion}
SetupIconFile=icon.ico
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\icon.ico

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 바로가기 생성"; GroupDescription: "추가 옵션:"
Name: "autostart"; Description: "Windows 시작 시 자동 실행"; GroupDescription: "추가 옵션:"

[Files]
Source: "node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "app\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Quepilot 서버 시작"; Filename: "{app}\start-server.bat"; IconFilename: "{app}\icon.ico"
Name: "{group}\Quepilot 서버 중지"; Filename: "{app}\stop-server.bat"; IconFilename: "{app}\icon.ico"
Name: "{group}\Quepilot 제거"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Quepilot Server"; Filename: "{app}\start-server.bat"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Registry]
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "QuepilotServer"; ValueData: "wscript.exe ""{app}\run-hidden.vbs"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Quepilot HTTP"" dir=in action=allow protocol=tcp localport=8888"; Flags: runhidden waituntilterminated
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Quepilot Discovery"" dir=in action=allow protocol=udp localport=9999"; Flags: runhidden waituntilterminated
Filename: "{app}\start-server.bat"; Flags: nowait postinstall skipifsilent; Description: "서버 바로 시작"

[UninstallRun]
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Quepilot HTTP"""; Flags: runhidden waituntilterminated; RunOnceId: "DelFirewallHTTP"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Quepilot Discovery"""; Flags: runhidden waituntilterminated; RunOnceId: "DelFirewallUDP"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\server\data"
Type: filesandordirs; Name: "{app}\server\node_modules"
Type: files; Name: "{app}\run-hidden.vbs"
Type: files; Name: "{app}\start-server.bat"
Type: files; Name: "{app}\stop-server.bat"
Type: dirifempty; Name: "{app}\server"
Type: dirifempty; Name: "{app}\node"
Type: dirifempty; Name: "{app}"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  AppDataDir, PidFile: String;
  PidContent: AnsiString;
begin
  if CurUninstallStep = usUninstall then
  begin
    AppDataDir := ExpandConstant('{%APPDATA}\QuepilotServer');
    PidFile := AppDataDir + '\db\server.pid';

    if FileExists(PidFile) then
    begin
      if LoadStringFromFile(PidFile, PidContent) then
      begin
        Log('PID 발견: ' + String(PidContent));
        Exec('taskkill', '/f /pid ' + Trim(String(PidContent)), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      end;
    end;

    Exec('taskkill', '/f /im node.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(3000);

    if DirExists(AppDataDir) then
    begin
      Exec('cmd', '/c rd /s /q "' + AppDataDir + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  StartBat, StopBat, RunVbs: String;
begin
  if CurStep = ssPostInstall then
  begin
    // run-hidden.vbs — Node를 직접 실행 (트레이 아이콘이 보이도록)
    RunVbs := ExpandConstant('{app}\run-hidden.vbs');
    SaveStringToFile(RunVbs,
      'Set WshShell = CreateObject("WScript.Shell")' + #13#10 +
      'Set fso = CreateObject("Scripting.FileSystemObject")' + #13#10 +
      'appDir = fso.GetParentFolderName(WScript.ScriptFullName)' + #13#10 +
      'serverDir = appDir & "\server"' + #13#10 +
      'nodeExe = appDir & "\node\node.exe"' + #13#10 +
      'serverJs = serverDir & "\main-server.js"' + #13#10 +
      'WshShell.CurrentDirectory = serverDir' + #13#10 +
      'WshShell.Run Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & serverJs & Chr(34), 0, False' + #13#10,
      False);

    // start-server.bat — PID 경로를 db 폴더로 통일
    StartBat := ExpandConstant('{app}\start-server.bat');
    SaveStringToFile(StartBat,
      '@echo off' + #13#10 +
      'chcp 65001 >nul' + #13#10 +
      'echo Quepilot Server 시작 중...' + #13#10 +
      '' + #13#10 +
      'set "pidFile=%APPDATA%\QuepilotServer\db\server.pid"' + #13#10 +
      'if exist "%pidFile%" (' + #13#10 +
      '    echo 서버가 이미 실행 중입니다.' + #13#10 +
      '    timeout /t 2' + #13#10 +
      '    exit /b 0' + #13#10 +
      ')' + #13#10 +
      '' + #13#10 +
      'wscript.exe "%~dp0run-hidden.vbs"' + #13#10 +
      'echo 서버가 시작되었습니다.' + #13#10 +
      'timeout /t 3' + #13#10,
      False);

    // stop-server.bat — PID 경로 동일
    StopBat := ExpandConstant('{app}\stop-server.bat');
    SaveStringToFile(StopBat,
      '@echo off' + #13#10 +
      'chcp 65001 >nul' + #13#10 +
      'echo Quepilot Server 중지 중...' + #13#10 +
      '' + #13#10 +
      'set "PID_FILE=%APPDATA%\QuepilotServer\db\server.pid"' + #13#10 +
      '' + #13#10 +
      'if not exist "%PID_FILE%" (' + #13#10 +
      '    echo PID 파일을 찾을 수 없습니다.' + #13#10 +
      '    echo node.exe 프로세스를 직접 종료합니다...' + #13#10 +
      '    taskkill /f /im node.exe >nul 2>nul' + #13#10 +
      '    echo 서버가 중지되었습니다.' + #13#10 +
      '    timeout /t 2' + #13#10 +
      '    exit /b 0' + #13#10 +
      ')' + #13#10 +
      '' + #13#10 +
      'set /p PID=<"%PID_FILE%"' + #13#10 +
      'echo PID %PID% 프로세스를 종료합니다...' + #13#10 +
      'taskkill /f /pid %PID% >nul 2>nul' + #13#10 +
      'if %ERRORLEVEL% EQU 0 (' + #13#10 +
      '    echo 서버가 중지되었습니다.' + #13#10 +
      ') else (' + #13#10 +
      '    echo PID %PID% 프로세스를 찾을 수 없습니다. node.exe를 종료합니다...' + #13#10 +
      '    taskkill /f /im node.exe >nul 2>nul' + #13#10 +
      ')' + #13#10 +
      'del "%PID_FILE%" >nul 2>nul' + #13#10 +
      'echo 서버가 중지되었습니다.' + #13#10 +
      'timeout /t 2' + #13#10,
      False);
  end;
end;
