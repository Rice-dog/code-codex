$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
. (Join-Path $repo 'installer/Storage-Layout.ps1')
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'installer/Install-CodeCodex.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Generated installer syntax invalid.' }
foreach ($name in @('Get-ExistingItem','Test-ReparsePoint','Assert-RegularFile','Get-Sha256Hash','Copy-AtomicFile','Write-AtomicText','Update-CodeCodexSameVersionPayload','Restore-CodeCodexSameVersionPayload')) {
    $nodes=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true))
    if ($nodes.Count -ne 1) { throw "Missing production function: $name" }
    . ([scriptblock]::Create($nodes[0].Extent.Text))
}
$out=Join-Path $repo ('artifacts/svi-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $out | Out-Null
$checks=[Collections.Generic.List[string]]::new()
function Check([bool]$value,[string]$label) { if (-not $value) { throw $label }; $checks.Add($label) }
function Invoke-InstallFileOperation($operation,$target,[scriptblock]$action) {
    if ($script:FailSecond -and $operation -eq 'Replacing support file' -and (Split-Path -Leaf $target) -ceq 'CodeCodex.exe') { throw 'Injected second executable replacement failure.' }
    & $action
}
function New-Fixture {
    $taskRoot=Join-Path $out ([Guid]::NewGuid().ToString('N').Substring(0,8))
    $folder=Join-Path $taskRoot 'versions/0.5.89';$source=Join-Path $taskRoot 'source'
    New-Item -ItemType Directory -Path $folder,$source | Out-Null
    [IO.File]::WriteAllText((Join-Path $taskRoot 'storage-layout.json'),'{"schema":1,"product":"Code-Codex"}')
    foreach ($name in @('code-codex.exe','CodeCodex.exe')) {
        [IO.File]::WriteAllText((Join-Path $folder $name),'old '+$name)
        [IO.File]::WriteAllText((Join-Path $source $name),'new '+$name)
    }
    $script:SameVersionPayload=$null;$script:FailSecond=$false
    return @{root=$taskRoot;folder=$folder;binary=(Join-Path $source 'code-codex.exe');launcher=(Join-Path $source 'CodeCodex.exe')}
}
function Replace-Fixture($f) { Update-CodeCodexSameVersionPayload $f.root '0.5.89' $f.binary $f.launcher }
function Reject([scriptblock]$action,[string]$pattern,[string]$label) { $failed=$false;try { & $action } catch { if ($_.Exception.Message -notmatch $pattern) { throw };$failed=$true };Check $failed $label }
$f=New-Fixture
Copy-Item -LiteralPath (Join-Path $f.folder 'code-codex.exe') -Destination $f.binary -Force
Copy-Item -LiteralPath (Join-Path $f.folder 'CodeCodex.exe') -Destination $f.launcher -Force
Replace-Fixture $f
Check ($script:SameVersionPayload.outcome -eq 'same-bytes' -and -not (Test-Path (Join-Path $f.root 'logs/payload-backups'))) 'Identical build is a no-op without a backup or executable rewrite'
$f=New-Fixture;Replace-Fixture $f
Check ($script:SameVersionPayload.outcome -eq 'replaced' -and (Get-Sha256Hash $f.binary) -eq (Get-Sha256Hash (Join-Path $f.folder 'code-codex.exe')) -and (Get-Sha256Hash $f.launcher) -eq (Get-Sha256Hash (Join-Path $f.folder 'CodeCodex.exe'))) 'Different same-version build atomically replaces and verifies the pair'
$record=$script:SameVersionPayload
Check (@($record.items | Where-Object { (Get-Sha256Hash $_.backup) -ne $_.oldSha256 }).Count -eq 0 -and (Test-Path $record.journal)) 'Complete previous pair and old/new SHA journal are retained before replacement'
Restore-CodeCodexSameVersionPayload
Check (@($record.items | Where-Object { (Get-Sha256Hash $_.target) -ne $_.oldSha256 }).Count -eq 0) 'Later precommit failure restores both previous executable bytes'
$f=New-Fixture;$script:FailSecond=$true
Reject { Replace-Fixture $f } 'Injected second' 'A second-file replacement failure remains a failure'
$script:FailSecond=$false;Restore-CodeCodexSameVersionPayload
Check (@($script:SameVersionPayload.items | Where-Object { (Get-Sha256Hash $_.target) -ne $_.oldSha256 }).Count -eq 0) 'A partial pair failure rolls the first replacement back'
$f=New-Fixture;Replace-Fixture $f
[IO.File]::WriteAllText((Join-Path $f.folder 'code-codex.exe'),'foreign bytes')
Reject { Restore-CodeCodexSameVersionPayload } 'ROLLBACK-CONFLICT' 'Rollback refuses a target changed by another writer'
Check ([IO.File]::ReadAllText((Join-Path $f.folder 'code-codex.exe')) -eq 'foreign bytes') 'Conflicting bytes remain intact'
$f=New-Fixture;Replace-Fixture $f
[IO.File]::WriteAllText($script:SameVersionPayload.items[0].backup,'corrupt backup')
Reject { Restore-CodeCodexSameVersionPayload } 'ROLLBACK-CONFLICT' 'Rollback refuses a corrupt previous-build backup'
$f=New-Fixture
Remove-Item -LiteralPath (Join-Path $f.root 'storage-layout.json')
Reject { Replace-Fixture $f } 'ownership' 'A foreign unowned root is refused before writes'
$f=New-Fixture
Reject { Update-CodeCodexSameVersionPayload $f.root '../0.5.89' $f.binary $f.launcher } 'PAYLOAD-VERSION' 'Malformed version cannot escape the managed version directory'
$f=New-Fixture
Remove-Item -LiteralPath (Join-Path $f.folder 'CodeCodex.exe')
Reject { Replace-Fixture $f } 'regular file' 'An incomplete existing pair is rejected before either file changes'
Check ([IO.File]::ReadAllText((Join-Path $f.folder 'code-codex.exe')) -like 'old *') 'Early validation failure leaves the first executable untouched'
$f=New-Fixture;$outside=Join-Path $out 'outside';New-Item -ItemType Directory -Path $outside | Out-Null
$link=Join-Path $f.root 'logs';New-Item -ItemType Junction -Path $link -Target $outside | Out-Null
Reject { Replace-Fixture $f } 'ancestor' 'Redirected backup ancestors are refused'
Check (@(Get-ChildItem -LiteralPath $outside -Force).Count -eq 0) 'No files are written through the redirected backup root'
$linkItem=Get-Item -LiteralPath $link -Force;$linkItem.Delete()
# Exercise replacement while Windows holds an executable image mapping.
$f=New-Fixture
Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32/ping.exe') -Destination (Join-Path $f.folder 'code-codex.exe') -Force
Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32/ping.exe') -Destination $f.binary -Force
$stream=[IO.File]::Open($f.binary,[IO.FileMode]::Append);try{$stream.WriteByte(0)}finally{$stream.Dispose()}
$process=Start-Process -FilePath (Join-Path $f.folder 'code-codex.exe') -ArgumentList @('-t','127.0.0.1') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $f.root 'ping.log') -RedirectStandardError (Join-Path $f.root 'ping-error.log') -PassThru
try {
    Start-Sleep -Milliseconds 200
    Check (-not $process.HasExited) 'The isolated old executable is running before same-version replacement'
    Replace-Fixture $f
    Check (-not $process.HasExited -and (Get-Sha256Hash $f.binary) -eq (Get-Sha256Hash (Join-Path $f.folder 'code-codex.exe'))) 'Replacing the mapped old image preserves the running process and commits new disk bytes'
    Restore-CodeCodexSameVersionPayload
    Check (-not $process.HasExited -and (Get-Sha256Hash $script:SameVersionPayload.items[0].target) -eq $script:SameVersionPayload.items[0].oldSha256) 'Rollback of the mapped image restores the old bytes without terminating the process'
} finally { if (-not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction Stop };$process.Dispose() }
$result=@{passed=$true;checks=@($checks);scope='Production generated PowerShell functions in isolated owned directories; controlled file failure; no real installation, process termination or user-data changes.'}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding UTF8
$result | ConvertTo-Json -Depth 5
