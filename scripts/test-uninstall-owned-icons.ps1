[CmdletBinding()]
param([string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(-not $OutputRoot){$OutputRoot=Join-Path $repo 'artifacts\uninstall-owned-icons'}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot);New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$allowed=[IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\')+'\'
if(-not $OutputRoot.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture root must stay in repository artifacts.'}
. (Join-Path $repo 'installer\Storage-Layout.ps1')
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'installer\Finalize-Uninstall.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Invalid finalizer syntax'}
$GeneratedIconEntries=@()
foreach($name in @('GeneratedIconEntries','ApplicationEntries')){
 $node=$ast.Find({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq ('$'+$name)},$true)
 if($node){. ([scriptblock]::Create($node.Extent.Text))}
}
foreach($name in @('Get-ExistingItem','Test-ReparsePoint','Remove-ReparsePoint','Assert-AllowedUninstallPath','Remove-SafeTree','Get-CodeCodexVersionedRootLaunchers','Test-CodeCodexApplicationFiles','Test-CodeCodexRemovalComplete','Remove-CodeCodexEmptyRoot','Remove-CodeCodexApplicationFiles','Remove-CodeCodexGeneratedIcons')){
 $node=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 if($node){. ([scriptblock]::Create($node.Extent.Text))}
}
Add-Type -AssemblyName System.Drawing
$gui=[IO.File]::ReadAllText((Join-Path $repo 'crates\launcher\src\gui_support.rs'))
$raw=[regex]::Match($gui,'(?s)const PROGRESS_DIALOG_SCRIPT: &str = r#"(.*?)"#;').Groups[1].Value
$guiAst=[Management.Automation.Language.Parser]::ParseInput($raw,[ref]$tokens,[ref]$errors)
$fn=$guiAst.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Test-SetupFolder'},$true);. ([scriptblock]::Create($fn.Extent.Text))
function Write-UiEvent {param($Action,$Outcome,$Details)}
function FixtureRoot($name){
 $root=[IO.Path]::GetFullPath((Join-Path $OutputRoot ($name+"\中文 user's Code-Codex")))
 if(-not $root.StartsWith($OutputRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe fixture target'}
 New-Item -ItemType Directory -Path $root -Force | Out-Null
 [IO.File]::WriteAllText((Join-Path $root 'storage-layout.json'),'{"schema":1,"product":"Code-Codex"}')
 foreach($n in @('Codex.ico','Codex-Official.ico','CodeCodex-0.4.75.exe','CodeCodex.Brand.png')){[IO.File]::WriteAllText((Join-Path $root $n),'managed fixture')}
 foreach($n in @('data','plugins','logs','temp','backups','versions','integration')){New-Item -ItemType Directory -Path (Join-Path $root $n) -Force|Out-Null;[IO.File]::WriteAllText((Join-Path $root ($n+'\fixture')),'retained fixture')}
 return $root
}
function SelectRoot($root){$script:InstallFullPath=$root;$script:InstallPrefix=$root+'\'}
function ValidReinstall($root){$script:setupExisting=$false;$script:pathBox=[pscustomobject]@{Text=$root};$script:pathHint=[pscustomobject]@{Text='';ForeColor=$null};return (Test-SetupFolder) -eq $root}
$report=[ordered]@{checks=@();passed=$false;source='Actual production finalizer and setup-folder functions, Windows PowerShell5.1; isolated filesystem, no live registry/shortcut/uninstall transaction.'}
function Check($name,$ok){if(-not $ok){throw $name};$report.checks+=@($name)}
try{
 $root=FixtureRoot 'purge';SelectRoot $root;Remove-CodeCodexApplicationFiles $root -Purge
 $report.purgeRemaining=@(Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue|ForEach-Object Name)
 Check 'Purge removes generated current and legacy icons and leaves no owned root' (-not(Test-Path -LiteralPath $root))
 Check 'Actual installer folder validation accepts the same purged path' (ValidReinstall $root)
 $root=FixtureRoot 'keep';SelectRoot $root;Remove-CodeCodexApplicationFiles $root
 Check 'Keep mode removes both managed icon filenames and program versions' ((-not(Test-Path (Join-Path $root 'Codex-Official.ico')))-and(-not(Test-Path (Join-Path $root 'Codex.ico')))-and(-not(Test-Path (Join-Path $root 'versions'))))
 Check 'Keep mode preserves settings/media/cache scopes and ownership marker' ((Test-Path (Join-Path $root 'storage-layout.json'))-and([IO.File]::ReadAllText((Join-Path $root 'data\fixture')) -eq 'retained fixture')-and([IO.File]::ReadAllText((Join-Path $root 'plugins\fixture')) -eq 'retained fixture'))
 Check 'Actual installer accepts the retained data folder' (ValidReinstall $root)
 $root=FixtureRoot 'readonly';SelectRoot $root;(Get-Item -LiteralPath (Join-Path $root 'Codex-Official.ico')).IsReadOnly=$true;Remove-CodeCodexApplicationFiles $root -Purge
 Check 'Readonly managed icon does not survive purge' (-not(Test-Path -LiteralPath $root))
 $root=FixtureRoot 'unknown';SelectRoot $root;[IO.File]::WriteAllText((Join-Path $root 'personal-note.txt'),'user content');Remove-CodeCodexApplicationFiles $root -Purge
 Check 'Unknown user files are preserved instead of broad recursive root deletion' ([IO.File]::ReadAllText((Join-Path $root 'personal-note.txt')) -eq 'user content')
 Check 'Unknown nonempty folder still fails installer validation' (-not(ValidReinstall $root))
 $root=FixtureRoot 'locked';SelectRoot $root;$lock=[IO.File]::Open((Join-Path $root 'Codex-Official.ico'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$failed=$false
 try{try{Remove-CodeCodexApplicationFiles $root -Purge}catch{$failed=$true}}finally{$lock.Dispose()}
 Check 'Locked icon reports failure and retains ownership for retry' ($failed-and(Test-Path (Join-Path $root 'storage-layout.json')))
 Remove-CodeCodexApplicationFiles $root -Purge;Check 'Retry after releasing lock finishes complete removal' (-not(Test-Path -LiteralPath $root))
 $root=FixtureRoot 'redirected';SelectRoot $root;$outside=Join-Path $OutputRoot 'outside';New-Item -ItemType Directory -Force -Path $outside|Out-Null;[IO.File]::WriteAllText((Join-Path $outside 'keep.txt'),'outside');Remove-Item -LiteralPath (Join-Path $root 'Codex-Official.ico');New-Item -ItemType Junction -Path (Join-Path $root 'Codex-Official.ico') -Target $outside|Out-Null;Remove-CodeCodexApplicationFiles $root -Purge
 Check 'Generated-icon junction removal never follows outside content' ((-not(Test-Path -LiteralPath $root))-and([IO.File]::ReadAllText((Join-Path $outside 'keep.txt')) -eq 'outside'))
 $root=[IO.Path]::GetFullPath((Join-Path $OutputRoot 'msi-generated-only'));New-Item -ItemType Directory -Path $root -Force|Out-Null;SelectRoot $root
 foreach($n in @('Codex.ico','Codex-Official.ico')){[IO.File]::WriteAllText((Join-Path $root $n),'generated')}
 Remove-CodeCodexGeneratedIcons $root
 Check 'MSI success cleanup removes runtime generated icons not owned by MSI file table' (@(Get-ChildItem -LiteralPath $root -Force).Count -eq 0)
 Check 'Reinstall accepts the emptied MSI folder' (ValidReinstall $root)
 $msi=$ast.FindAll({param($n)$n -is [Management.Automation.Language.IfStatementAst] -and $n.Clauses[0].Item1.Extent.Text -match 'IsNullOrWhiteSpace.*MsiProductCode'},$true)|Where-Object {$_.Extent.Text -match 'Start-Process'}|Select-Object -First 1
 Check 'Production MSI branch invokes generated icon cleanup after successful package removal' ($msi.Extent.Text -match 'Remove-CodeCodexGeneratedIcons \$InstallFullPath')
 $report.passed=$true
}catch{$report.error=$_.ToString();throw}finally{$report|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $OutputRoot 'result.json') -Encoding UTF8}
Write-Output "Owned icon cleanup: $($report.checks.Count) checks passed."
