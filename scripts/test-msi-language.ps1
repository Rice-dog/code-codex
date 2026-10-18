[CmdletBinding()]
param([Parameter(Mandatory)][string]$MsiPath,[string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if (-not $OutputRoot) { $OutputRoot=Join-Path $repo ('artifacts\msi-language-'+[Guid]::NewGuid().ToString('N')) }
$null=New-Item -ItemType Directory -Path $OutputRoot -Force
$MsiPath=[IO.Path]::GetFullPath($MsiPath)
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class LanguageMsiFixture {
 [DllImport("msi.dll",CharSet=CharSet.Unicode)] public static extern uint MsiOpenPackageEx(string path,uint options,out uint session);
 [DllImport("msi.dll",CharSet=CharSet.Unicode)] public static extern uint MsiSetProperty(uint session,string key,string value);
 [DllImport("msi.dll",CharSet=CharSet.Unicode)] public static extern uint MsiGetProperty(uint session,string key,StringBuilder value,ref uint size);
 [DllImport("msi.dll",CharSet=CharSet.Unicode)] public static extern uint MsiDoAction(uint session,string action);
 [DllImport("msi.dll")] public static extern uint MsiCloseHandle(uint session);
 [DllImport("msi.dll")] public static extern uint MsiSetInternalUI(uint level,IntPtr window);
 [DllImport("kernel32.dll")] public static extern ushort GetUserDefaultUILanguage();
 [DllImport("msi.dll")] public static extern uint MsiGetActiveDatabase(uint session);
 [DllImport("msi.dll",CharSet=CharSet.Unicode)] public static extern uint MsiDatabaseOpenView(uint db,string sql,out uint view);
 [DllImport("msi.dll")] public static extern uint MsiViewExecute(uint view,uint record);
 [DllImport("msi.dll")] public static extern uint MsiViewFetch(uint view,out uint record);
 [DllImport("msi.dll")] public static extern uint MsiRecordReadStream(uint record,uint field,byte[] data,ref uint size);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr LoadLibrary(string file);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi)] public static extern IntPtr GetProcAddress(IntPtr library,string name);
 [DllImport("kernel32.dll")] public static extern bool FreeLibrary(IntPtr library);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] public delegate uint LanguageAction(uint session);
 public static LanguageAction Resolve(IntPtr library) { return (LanguageAction)Marshal.GetDelegateForFunctionPointer(GetProcAddress(library,"InitializeUiLanguage"),typeof(LanguageAction)); }

}
'@
function Check([bool]$ok,[string]$detail) { if (-not $ok) { throw $detail } }
function Property([uint32]$session,[string]$key) { $text=[Text.StringBuilder]::new(4096);[uint32]$size=4096;Check ([LanguageMsiFixture]::MsiGetProperty($session,$key,$text,[ref]$size) -eq 0) $key;return $text.ToString() }
$prior=[LanguageMsiFixture]::MsiSetInternalUI(2,[IntPtr]::Zero)
$results=@();$library=[IntPtr]::Zero;$languageAction=$null
try {
 foreach($case in @('system','en','zh-CN','stored-en','stored-zh','invalid')) {
  [uint32]$session=0
  try {
   # Open a non-installing MSI session. Never run InstallInitialize/ExecuteAction,
   # touch registration, shortcuts or install files, or launch the official client.
   Check ([LanguageMsiFixture]::MsiOpenPackageEx($MsiPath,1,[ref]$session) -eq 0) 'Open isolated MSI session'
   if(-not $languageAction){
    $db=[LanguageMsiFixture]::MsiGetActiveDatabase($session);[uint32]$view=0;[uint32]$record=0
    try{
     Check ([LanguageMsiFixture]::MsiDatabaseOpenView($db,"SELECT ``Data`` FROM ``Binary`` WHERE ``Name``='SettingsCleanupCustomActionBinary'",[ref]$view) -eq 0) 'Read packaged custom action'
     Check ([LanguageMsiFixture]::MsiViewExecute($view,0) -eq 0) 'Execute read-only binary query'
     Check ([LanguageMsiFixture]::MsiViewFetch($view,[ref]$record) -eq 0) 'Read custom-action record'
     $data=[byte[]]::new(1048576);[uint32]$size=$data.Length
     Check ([LanguageMsiFixture]::MsiRecordReadStream($record,1,$data,[ref]$size) -eq 0 -and $size -gt 0 -and $size -lt $data.Length) 'Bounded packaged DLL'
     $dll=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) 'PackagedLanguageAction.dll'
     [IO.File]::WriteAllBytes($dll,$data[0..($size-1)])
     $library=[LanguageMsiFixture]::LoadLibrary($dll);Check ($library -ne [IntPtr]::Zero) 'Load packaged production DLL'
     $languageAction=[LanguageMsiFixture]::Resolve($library)
    }finally{foreach($handle in @($record,$view,$db)){if($handle){[void][LanguageMsiFixture]::MsiCloseHandle($handle)}}}
   }
   if ($case -in @('en','zh-CN','invalid')) { [void][LanguageMsiFixture]::MsiSetProperty($session,'CODECODEXUILANGUAGE',$(if($case -eq 'invalid'){'fr'}else{$case})) }
   $expected=if(([LanguageMsiFixture]::GetUserDefaultUILanguage() -band 0x3ff) -eq 4){'zh-CN'}else{'en'}
   if($case.StartsWith('stored-')) {
    $expected=if($case -eq 'stored-en'){'en'}else{'zh-CN'}
    $folder=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) $case
    $null=New-Item -ItemType Directory -Path (Join-Path $folder 'data') -Force
    [IO.File]::WriteAllText((Join-Path $folder 'data\ui-language.json'),('{"schema":1,"locale":"'+$expected+'","revision":7,"source":"menu"}'))
    [void][LanguageMsiFixture]::MsiSetProperty($session,'REGISTEREDINSTALLFOLDER',$folder)
   }elseif($case -in @('en','zh-CN')){$expected=$case}
   $result=$languageAction.Invoke($session)
   if($case -eq 'invalid'){Check ($result -ne 0) 'Invalid MSI locale accepted'}else{
    Check ($result -eq 0) ('Language action failed: '+$result)
    Check ((Property $session 'CODECODEXUILANGUAGE') -eq $expected) ('Wrong locale: '+$case)
    $revision=if($case.StartsWith('stored-')){'7'}else{'0'}
    Check ((Property $session 'CODECODEXUILANGUAGEREVISION') -eq $revision) ('Wrong snapshot revision: '+$case)
    Check ((Property $session 'CCLANGFINISH') -eq $(if($expected -eq 'zh-CN'){'完成'}else{'Finish'})) ('Wrong standard dialog language: '+$case)
    Check ($languageAction.Invoke($session) -eq 0) 'Execute sequence replay'
    Check ((Property $session 'CODECODEXUILANGUAGEREVISION') -eq $revision) 'UI snapshot was lost'
   }
   $results+=@{case=$case;passed=$true;actionResult=$result;scope='Production MSI custom action; no install transaction'}
  }finally {if($session){[void][LanguageMsiFixture]::MsiCloseHandle($session)}}
 }
}finally{if($library -ne [IntPtr]::Zero){[void][LanguageMsiFixture]::FreeLibrary($library)};[void][LanguageMsiFixture]::MsiSetInternalUI($prior,[IntPtr]::Zero)}
$results|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $OutputRoot 'result.json') -Encoding UTF8
Write-Output 'Six production MSI language actions passed without installing.'
