$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $repo 'installer\Storage-Layout.ps1')
$sandbox=Join-Path $repo ('artifacts\storage-upgrade-v0.4.10\fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $sandbox -Force | Out-Null
$before=$env:LOCALAPPDATA
$checks=[Collections.Generic.List[string]]::new()
function Verify([bool]$Condition,[string]$Name){if(-not $Condition){throw $Name};$checks.Add($Name)}
function Reject([scriptblock]$Action,[string]$Name){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Verify $failed $Name}
try{
    $env:LOCALAPPDATA=Join-Path $sandbox 'old user data'
    New-Item -ItemType Directory -Path $env:LOCALAPPDATA -Force | Out-Null
    $root=Join-Path $sandbox 'custom folder 中文\Code-Codex'
    $old=Join-Path $env:LOCALAPPDATA 'CodeCodex'
    New-Item -ItemType Directory -Path (Join-Path $old 'plugin-cache\plugins\appearance\fixture\1.0.0'),(Join-Path $old 'runtime-logs'),(Join-Path $old 'diagnostics') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $old 'settings.json'),'old-settings')
    [IO.File]::WriteAllText((Join-Path $old 'plugin-cache\plugins\appearance\fixture\1.0.0\plugin.js'),'verified-by-native-on-load')
    [IO.File]::WriteAllText((Join-Path $old 'plugin-cache\unexpected.exe'),'do-not-migrate')
    [IO.File]::WriteAllText((Join-Path $old 'runtime-logs\one.jsonl'),'old-run')
    [IO.File]::WriteAllText((Join-Path $old 'diagnostics\startup-one.txt'),'old-diagnostic')
    Reject { Assert-CodeCodexRoot 'C:\' } 'Drive root rejected'
    Reject { Assert-CodeCodexRoot $env:USERPROFILE } 'Profile itself rejected'
    Reject { Assert-CodeCodexRoot $env:WINDIR } 'Windows itself rejected'
    Reject { Assert-CodeCodexRoot '\\server\share\folder' } 'Network path rejected'
    Reject { Assert-CodeCodexRoot 'relative\folder' } 'Relative path rejected'
    $safe=Assert-CodeCodexRoot $root
    Verify ($safe -eq $root) 'Spaces and Unicode custom path accepted'
    Initialize-CodeCodexStorage $root
    Test-CodeCodexAtomicStorage $root
    Verify (@(Get-ChildItem -LiteralPath $root -Filter '.atomic-check-*').Count -eq 0) 'Atomic preflight replaces only its own files and cleans up'
    Add-Type @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class StorageFixtureDirectoryLock {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 public static extern SafeFileHandle CreateFile(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
}
'@
    $directoryLock=[StorageFixtureDirectoryLock]::CreateFile($root,[uint32]2147483648,1,[IntPtr]::Zero,3,0x02000000,[IntPtr]::Zero)
    if ($directoryLock.IsInvalid) { throw 'Directory lock fixture could not acquire its sandbox handle.' }
    try {
        $failure=$null
        try { Test-CodeCodexAtomicStorage $root } catch { $failure=$_ }
        Verify ($null -ne $failure -and $failure.Exception.Message.Contains('phase=rename')) 'Read-only ancestor lock is caught before installation mutation'
    } finally { $directoryLock.Dispose() }
    Test-CodeCodexAtomicStorage $root
    Verify $true 'Atomic preflight recovers once sandbox directory lock is released'
    Verify ([IO.File]::ReadAllText((Join-Path $root 'data\settings.json')) -eq 'old-settings') 'Settings copied'
    Verify (Test-Path -LiteralPath (Join-Path $root 'plugins\appearance\fixture\1.0.0\plugin.js')) 'Categorized plugins copied without double plugins folder'
    Verify (-not (Test-Path -LiteralPath (Join-Path $root 'unexpected.exe'))) 'Unknown cache executables not migrated'
    Verify (Test-Path -LiteralPath (Join-Path $root 'logs\runtime\one.jsonl')) 'Runtime logs copied'
    Verify (Test-Path -LiteralPath (Join-Path $root 'logs\diagnostics\startup-one.txt')) 'Diagnostics copied'
    Verify ([IO.File]::ReadAllText((Join-Path $old 'settings.json')) -eq 'old-settings') 'Original source retained'
    [IO.File]::WriteAllText((Join-Path $root 'data\settings.json'),'new-settings')
    Initialize-CodeCodexStorage $root
    Verify ([IO.File]::ReadAllText((Join-Path $root 'data\settings.json')) -eq 'new-settings') 'Repeated migration preserves newer destination'
    [IO.File]::WriteAllText((Join-Path $root 'storage-layout.json'),'{"schema":1,"product":"Code-Codex"}')
    $null=Assert-CodeCodexRoot $root -Owned
    Verify $true 'Product marker accepted for owned removal'
    [IO.File]::WriteAllText((Join-Path $root 'storage-layout.json'),'{"schema":2,"product":"Code-Codex"}')
    Reject {Assert-CodeCodexRoot $root -Owned} 'Unsupported storage schema is never overwritten as a legacy install'
    [IO.File]::WriteAllText((Join-Path $root 'storage-layout.json'),'{"schema":1,"product":"Code-Codex"}')
    $outside=Join-Path $sandbox 'outside';New-Item -ItemType Directory -Path $outside | Out-Null
    [IO.File]::WriteAllText((Join-Path $outside 'keep.txt'),'outside')
    $junction=Join-Path $sandbox 'linked';New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
    Reject {Assert-CodeCodexRoot (Join-Path $junction 'child')} 'Redirected storage ancestor rejected'
    Reject {Copy-CodeCodexDataTree $junction (Join-Path $root 'data\linked')} 'Migration does not follow a junction'
    # Load only removal functions, never execute the real uninstaller or touch registration.
    $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'installer\Finalize-Uninstall.ps1'),[ref]$tokens,[ref]$errors)
    Verify ($errors.Count -eq 0) 'Production finalizer syntax valid'
    foreach($name in @('Get-ExistingItem','Test-ReparsePoint','Remove-ReparsePoint','Assert-AllowedUninstallPath','Remove-SafeTree','Get-CodeCodexVersionedRootLaunchers','Test-CodeCodexApplicationFiles','Test-CodeCodexRemovalComplete','Remove-CodeCodexEmptyRoot','Remove-CodeCodexApplicationFiles')){
        $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
        . ([scriptblock]::Create($fn.Extent.Text))
    }
    $InstallFullPath=$root;$InstallPrefix=$root+'\'
    $ApplicationEntries=@('versions','integration','CodeCodex.exe','current-version','install-type')
    New-Item -ItemType Directory -Path (Join-Path $root 'versions\0.0.1') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $root 'CodeCodex.exe'),'fixture')
    [IO.File]::WriteAllText((Join-Path $root 'personal-note.txt'),'unknown-file')
    Remove-CodeCodexApplicationFiles $root
    Verify (-not (Test-CodeCodexApplicationFiles $root)) 'Normal uninstall removes application files'
    Verify (Test-Path -LiteralPath (Join-Path $root 'data\settings.json')) 'Normal uninstall retains data'
    Verify (Test-Path -LiteralPath (Join-Path $root 'plugins\appearance\fixture\1.0.0\plugin.js')) 'Normal uninstall retains plugins'
    Remove-CodeCodexApplicationFiles $root -Purge
    Verify (-not (Test-Path -LiteralPath (Join-Path $root 'data'))) 'Explicit purge removes owned data'
    Verify ([IO.File]::ReadAllText((Join-Path $root 'personal-note.txt')) -eq 'unknown-file') 'Unknown sibling files preserved even during purge'
    Verify ([IO.File]::ReadAllText((Join-Path $outside 'keep.txt')) -eq 'outside') 'Unrelated outside data preserved'
    $result=[ordered]@{checks=$checks.ToArray();passed=$checks.Count;sandbox=$sandbox;source='production functions; isolated filesystem fixture; no registration modified'}
    $result|ConvertTo-Json -Depth 5 | Set-Content (Join-Path $repo 'artifacts\storage-upgrade-v0.4.10\storage-fixture.json') -Encoding utf8
    Write-Output "Storage fixture passed: $($checks.Count) checks."
} finally {$env:LOCALAPPDATA=$before}
