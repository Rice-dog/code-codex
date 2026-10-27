[CmdletBinding()]
param([string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(-not $OutputRoot){$OutputRoot=Join-Path $repo ('artifacts/menu-uninstall-'+[guid]::NewGuid().ToString('N'))}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\')+'\'
if(-not $OutputRoot.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $OutputRoot)){throw 'Use a new fixture folder inside repository artifacts.'}
New-Item -ItemType Directory -Path $OutputRoot | Out-Null
$actor=Join-Path $OutputRoot 'Actor.exe'
# Real disposable processes recreate core -> wizard -> UI + removal worker.
# They have no access to the actual application profile or system settings.
Add-Type -OutputAssembly $actor -OutputType ConsoleApplication -TypeDefinition @'
using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
public static class RemovalActor {
    static Process Start(string file,string args) {
        var s=new ProcessStartInfo(file,args);s.UseShellExecute=false;s.CreateNoWindow=true;s.WorkingDirectory=Path.GetTempPath();return Process.Start(s);
    }
    public static void Main(string[] args) {
        if(args[0]=="shortcut")return;
        var dir=Environment.GetEnvironmentVariable("CC_FIXTURE_DIR");
        if(args[0]=="core") {
            Start(Path.Combine(dir,"application-child.exe"),"idle");
            Start(Path.Combine(dir,"Uninstall-CodeCodex.exe"),"wizard");
            Thread.Sleep(60000);return;
        }
        if(args[0]=="wizard") {
            var ui=Start(Path.Combine(dir,"wizard-ui.exe"),"idle");
            File.WriteAllText(Path.Combine(dir,"ui.pid"),ui.Id.ToString());
            File.WriteAllText(Path.Combine(dir,"wizard.pid"),Process.GetCurrentProcess().Id.ToString());
            var child=Start(Environment.GetEnvironmentVariable("CC_FIXTURE_PS"),"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+Path.Combine(dir,"Uninstall-CodeCodex.ps1")+"\" -InstallRoot \""+Path.Combine(dir,"Code-Codex")+"\" -SharedProgress "+Environment.GetEnvironmentVariable("CC_FIXTURE_MODE"));
            child.WaitForExit();
            // This records completion transport, not a physical Finish-window test.
            File.WriteAllText(Path.Combine(dir,"completion.json"),"{\"exitCode\":"+child.ExitCode+",\"uiAlive\":"+(!ui.HasExited).ToString().ToLowerInvariant()+"}");
            if(!ui.HasExited)ui.Kill();return;
        }
        Thread.Sleep(60000);
    }
}
'@
$caller=[IO.File]::ReadAllText((Join-Path $repo 'installer/Uninstall-CodeCodex.ps1'))
$finalizer=[IO.File]::ReadAllText((Join-Path $repo 'installer/Finalize-Uninstall.ps1'))
# Isolate only HKCU operations. Keep real production process scanning/shutdown,
# desktop ownership checks, shared caller/finalizer protocol and file removal.
$isolation=@'
function New-Item { [CmdletBinding()]param($Path,[switch]$Force) if($Path -notlike 'HKCU:*'){throw 'Unexpected fixture New-Item'} }
function New-ItemProperty { [CmdletBinding()]param($Path,$Name,$PropertyType,$Value,[switch]$Force) if($Path -notlike 'HKCU:*'){throw 'Unexpected fixture registry write'} }
function Remove-ItemProperty { [CmdletBinding()]param($Path,$LiteralPath,$Name) if(($Path+$LiteralPath) -notlike 'HKCU:*'){throw 'Unexpected registry removal'} }
function Test-Path { [CmdletBinding()]param($LiteralPath,$Path,$PathType) if(($Path+$LiteralPath) -like 'HKCU:*'){return $false}; Microsoft.PowerShell.Management\Test-Path @PSBoundParameters }
function Remove-Item { [CmdletBinding()]param($LiteralPath,[switch]$Force,[switch]$Recurse) if($LiteralPath -like 'HKCU:*'){return}; Microsoft.PowerShell.Management\Remove-Item @PSBoundParameters }
'@
if(-not $caller.Contains('$installItem = Get-ExistingItem $InstallFullPath') -or -not $finalizer.Contains('$exitCode = 0')){throw 'Production isolation boundary changed'}
$results=@()
foreach($mode in @('keep','purge')) {
    $dir=Join-Path $OutputRoot $mode;$root=Join-Path $dir 'Code-Codex';$desktop=Join-Path $dir 'desktop'
    New-Item -ItemType Directory -Force "$root/versions/fixture","$root/data","$root/plugins",$desktop | Out-Null
    Copy-Item -LiteralPath $actor -Destination "$root/versions/fixture/code-codex.exe"
    foreach($name in @('Uninstall-CodeCodex.exe','application-child.exe','wizard-ui.exe')){Copy-Item -LiteralPath $actor -Destination (Join-Path $dir $name)}
    # Only the shortcut tool exit is mocked; the actual owned .lnk deletion runs.
    $shortcutSource='public static class ShortcutFixture { public static void Main(string[] args) {} }'
    Add-Type -OutputAssembly "$root/CodeCodex.Shortcut.exe" -OutputType ConsoleApplication -TypeDefinition $shortcutSource
    [IO.File]::WriteAllText("$root/storage-layout.json",'{"schema":1,"product":"Code-Codex"}')
    [IO.File]::WriteAllText("$root/data/media",'retained user fixture')
    [IO.File]::WriteAllText("$root/Codex-Official.ico",'managed icon fixture')
    [IO.File]::WriteAllText("$dir/outside",'untouched')
    $shell=New-Object -ComObject WScript.Shell;$link=$shell.CreateShortcut("$desktop/Code-Codex.lnk")
    $link.TargetPath="$root/CodeCodex.exe";$link.Description='Managed by Code-Codex (code-codex/v1)';$link.Save()
    [IO.File]::WriteAllText("$dir/Uninstall-CodeCodex.ps1",$caller.Replace('$installItem = Get-ExistingItem $InstallFullPath',($isolation+"`n"+'$installItem = Get-ExistingItem $InstallFullPath')),[Text.UTF8Encoding]::new($true))
    [IO.File]::WriteAllText("$dir/Finalize-Uninstall.ps1",$finalizer.Replace('$exitCode = 0',($isolation+"`n"+'$exitCode = 0')),[Text.UTF8Encoding]::new($true))
    [IO.File]::WriteAllText("$dir/progress",'0|progress|0|')
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName="$root/versions/fixture/code-codex.exe";$info.Arguments='core';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WorkingDirectory=$OutputRoot
    foreach($pair in @(@('CC_FIXTURE_DIR',$dir),@('CC_FIXTURE_PS',"$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe"),@('CC_FIXTURE_MODE',$(if($mode -eq 'purge'){'-PurgeSettings'}else{'-KeepSettings'})),@('CLE_PROGRESS_STATE_PATH',"$dir/progress"),@('LOCALAPPDATA',"$dir/profile"),@('CODE_CODEX_DESKTOP',$desktop))) {$info.EnvironmentVariables[$pair[0]]=$pair[1]}
    $core=[Diagnostics.Process]::Start($info)
    try {
        $deadline=[DateTime]::UtcNow.AddSeconds(45)
        while(-not (Test-Path "$dir/completion.json") -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 100}
        if(-not (Test-Path "$dir/completion.json")){throw "Removal chain died or timed out: $mode"}
        $done=Get-Content "$dir/completion.json" -Raw | ConvertFrom-Json
        if($done.exitCode -ne 0 -or -not $done.uiAlive){throw "Removal did not preserve wizard/UI through completion: $mode"}
        $core.Refresh();if(-not $core.HasExited){throw 'Owned core was not stopped'}
        if((Test-Path "$root/versions") -or (Test-Path "$root/Codex-Official.ico") -or (Test-Path "$desktop/Code-Codex.lnk")){throw 'Owned files or shortcut left behind'}
        if($mode -eq 'keep' -and [IO.File]::ReadAllText("$root/data/media") -ne 'retained user fixture'){throw 'Keep settings lost media'}
        if($mode -eq 'purge' -and (Test-Path $root)){throw 'Purge left owned fixture root'}
        if([IO.File]::ReadAllText("$dir/outside") -ne 'untouched'){throw 'Outside sentinel changed'}
        $results+=@{mode=$mode;passed=$true;realProcessTree=$true;realCallerAndFinalizer=$true;wizardTransportAlive=$true;physicalFinishWindow=$false;registryAndShortcutTool='isolated';ownedDesktopShortcutRemoved=$true}
    } finally {
        # Terminate only exact disposable executables under the checked fixture.
        $prefix=$dir.TrimEnd('\')+'\'
        foreach($p in @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) })) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}
$results | ConvertTo-Json -Depth 6 | Set-Content "$OutputRoot/results.json" -Encoding UTF8
Write-Output "Menu uninstall lifecycle: keep and purge passed; real core/wizard/worker/UI processes, owned shortcut and files removed; external profile and registry isolated. Evidence: $OutputRoot"
