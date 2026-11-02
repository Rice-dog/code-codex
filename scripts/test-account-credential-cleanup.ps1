[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$fixture=[IO.Path]::GetFullPath((Join-Path $repo ('artifacts/account-credentials-'+[guid]::NewGuid().ToString('N'))))
$boundary=[IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\')+'\'
if(-not $fixture.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe fixture path.'}
$null=New-Item -ItemType Directory -Path $fixture
function Assert-CodeCodexRoot([string]$Root,[switch]$Owned){
    $full=[IO.Path]::GetFullPath($Root)
    if(-not $full.StartsWith($fixture+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Outside fixture root.'}
    return $full
}
$source=Join-Path $repo 'installer/src/remove/safety.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Production removal source did not parse.'}
$definition=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Remove-CodeCodexAccountCredentials'},$false)
if($definition.Count -ne 1){throw 'Missing production cleanup function.'}
Invoke-Expression $definition[0].Extent.Text
$rootA=Join-Path $fixture 'owned';$rootB=Join-Path $fixture 'outside'
$owner=('a'*64);$connection=('b'*32)
$homeA=Join-Path $rootA "data/accounts/$owner/$connection"
$homeB=Join-Path $rootB "data/accounts/$owner/$connection"
$null=New-Item -ItemType Directory -Path $homeA,$homeB -Force
Remove-CodeCodexAccountCredentials $rootA # Compiles the actual helper; absent entries are valid.
$targetA=[CodeCodexAccountCredentialCleanup]::Target($homeA,$rootA)
$targetB=[CodeCodexAccountCredentialCleanup]::Target($homeB,$rootB)
$sealedA='secrets|'+$targetA.Substring(4,16)+'.codex'
Add-Type @'
using System.Runtime.InteropServices;
public static class CodeCodexCredentialFixture {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 private struct Credential {
  public uint flags,kind;
  public string target,comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME written;
  public uint size;public System.IntPtr blob;
  public uint persist,count;public System.IntPtr attributes;
  public string alias,user;
 }
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 private static extern bool CredWriteW(ref Credential value,uint flags);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 private static extern bool CredDeleteW(string target,uint kind,uint flags);
 public static int Delete(string target){return CredDeleteW(target,1,0)?0:Marshal.GetLastWin32Error();}
 public static int Create(string target){
  const string text="CodeCodexSyntheticFixture";
  var blob=Marshal.StringToCoTaskMemUni(text);
  try{var value=new Credential{kind=1,target=target,comment="Disposable Code-Codex test",size=(uint)(text.Length*2),blob=blob,persist=2,user=text};return CredWriteW(ref value,0)?0:Marshal.GetLastWin32Error();}
  finally{Marshal.ZeroFreeCoTaskMemUnicode(blob);}
 }
}
'@
if($targetA -eq $targetB){throw 'Synthetic target derivation collided.'}
try {
    if([CodeCodexCredentialFixture]::Create($targetA) -ne 0){throw 'Creating the synthetic owned credential failed.'}
    if([CodeCodexCredentialFixture]::Create($targetB) -ne 0){throw 'Creating the synthetic outside credential failed.'}
    if([CodeCodexCredentialFixture]::Create($sealedA) -ne 0){throw 'Creating the synthetic sealed-store credential failed.'}
    Remove-CodeCodexAccountCredentials $rootA
    if([CodeCodexCredentialFixture]::Delete($targetA) -ne 1168){throw 'Owned credential was not deleted.'}
    if([CodeCodexCredentialFixture]::Delete($sealedA) -ne 1168){throw 'Owned sealed-store credential was not deleted.'}
    $outsideCode=[CodeCodexCredentialFixture]::Delete($targetB);if($outsideCode -ne 0){throw ('Outside credential deletion observation: '+$outsideCode)}
    $rejected=$false
    try {[CodeCodexAccountCredentialCleanup]::Target($homeB,$rootA) | Out-Null} catch {$rejected=$true}
    if(-not $rejected){throw 'Outside account home was accepted.'}
    @{passed=$true;productionFunction=$true;realWindowsCredentialApi=$true;syntheticCredentialsOnly=$true;ownedDeleted=$true;outsidePreserved=$true;outsidePathRejected=$true;noCredentialRead=$true} | ConvertTo-Json -Compress
} finally {
    $null=[CodeCodexCredentialFixture]::Delete($targetA)
    $null=[CodeCodexCredentialFixture]::Delete($targetB)
    $null=[CodeCodexCredentialFixture]::Delete($sealedA)
    if([IO.Path]::GetFullPath($fixture).StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $fixture -Recurse -Force}
}
