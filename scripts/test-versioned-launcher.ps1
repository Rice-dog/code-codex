[CmdletBinding()]
param([string]$OutputRoot)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $OutputRoot) { $OutputRoot = Join-Path $repo 'artifacts/plugin-installer-v0.4.62/launcher-fixtures' }
. (Join-Path $repo 'installer/Storage-Layout.ps1')
$source = [IO.File]::ReadAllText((Join-Path $repo 'installer/Finalize-Uninstall.ps1'))
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Finalizer syntax invalid'}
$required=@('Get-CodeCodexVersionedRootLaunchers','Test-CodeCodexApplicationFiles','Test-CodeCodexRemovalComplete','Remove-CodeCodexEmptyRoot','Remove-CodeCodexApplicationFiles','Remove-SafeTree','Assert-AllowedUninstallPath','Test-ReparsePoint','Get-ExistingItem','Remove-ReparsePoint')
foreach($name in $required){
 $node=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$true)|Where-Object Name -eq $name
 if(@($node).Count -ne 1){throw "Missing/duplicate function $name"}
 . ([scriptblock]::Create($node.Extent.Text))
}
foreach($variable in @('$GeneratedIconEntries','$ApplicationEntries')) {
 $assignment=$ast.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq $variable},$true)
 if(@($assignment).Count -ne 1){throw ('Missing application whitelist: '+$variable)}
 . ([scriptblock]::Create($assignment.Extent.Text))
}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo 'artifacts'))+'\'
if(-not $OutputRoot.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture output must stay under artifacts'}
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$checks=New-Object 'Collections.Generic.List[string]'
function Verify([bool]$Value,[string]$Label){if(-not $Value){throw ($Label+'; fixtureRoot='+$root+'; files='+((Get-ChildItem -LiteralPath $root -Force -Name -ErrorAction SilentlyContinue)-join ','))};$checks.Add($Label)}
foreach($purge in @($false,$true)){
 $root=Join-Path $OutputRoot (([Guid]::NewGuid().ToString('N'))+'-Code-Codex')
 New-Item -ItemType Directory -Path $root,(Join-Path $root 'data'),(Join-Path $root 'plugins') -Force | Out-Null
 [IO.File]::WriteAllText((Join-Path $root 'storage-layout.json'),'{"schema":1,"product":"Code-Codex"}')
 foreach($name in @('CodeCodex.exe','CodeCodex-0.4.62.exe','CodeCodex-0.4.63.exe','CodeCodex-00.4.62.exe','my-app.exe','data/keep.txt','plugins/keep.js')){[IO.File]::WriteAllText((Join-Path $root $name),'fixture')}
 $InstallFullPath=$root
 $InstallPrefix=$root+'\'
 $found=@(Get-CodeCodexVersionedRootLaunchers $root)
 Verify ($found.Count -eq 2) 'Strict version filenames detected; malformed and unrelated filenames excluded'
 Verify (Test-CodeCodexApplicationFiles $root) 'Application files detected before removal'
 Remove-CodeCodexApplicationFiles $root -Purge:$purge
 Verify (-not (Test-CodeCodexApplicationFiles $root)) 'Known legacy and versioned launchers removed'
 Verify ((Test-Path (Join-Path $root 'CodeCodex-00.4.62.exe')) -and (Test-Path (Join-Path $root 'my-app.exe'))) 'Unknown files preserved'
 Verify ((Test-Path (Join-Path $root 'data/keep.txt')) -eq (-not $purge)) 'Data follows preserve/purge selection'
 Verify ((Test-Path (Join-Path $root 'plugins/keep.js')) -eq (-not $purge)) 'Plugins follow preserve/purge selection'
}
foreach($file in @('installer/Install-CodeCodex.ps1','scripts/build-msi.ps1','scripts/package.ps1')){
 $tokens=$null;$errors=$null
 [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $repo $file),[ref]$tokens,[ref]$errors)
 Verify ($errors.Count -eq 0) "PowerShell syntax: $file"
}
$wxs=[xml][IO.File]::ReadAllText((Join-Path $repo 'installer/Package.wxs'))
$rootFile=$wxs.SelectSingleNode('//*[local-name()="File" and @Id="RootLauncherExecutable"]')
Verify ($rootFile.Name -eq 'CodeCodex-$(var.ProductVersion).exe') 'MSI root launcher has versioned filename'
Verify ($rootFile.ParentNode.Id -eq 'RootLauncherPayload') 'MSI launcher uses independent component'
$registry=$rootFile.ParentNode.SelectSingleNode('*[local-name()="RegistryValue" and @KeyPath="yes"]')
Verify ($registry -and $registry.Root -eq 'HKCU') 'MSI per-user launcher component has HKCU registry key path'
$result=@{checks=$checks.Count;passed=$true;details=@($checks)}
$result|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $OutputRoot 'result.json') -Encoding UTF8
Write-Output "$($checks.Count) versioned launcher checks passed"
