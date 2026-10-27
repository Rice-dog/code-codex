$ErrorActionPreference = "Stop"
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) "installer\Uninstall-CodeCodex.ps1"
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $scriptPath, [ref]$tokens, [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
    throw "Uninstall-CodeCodex.ps1 has PowerShell syntax errors."
}

# Load only the pure identity checks. Running the installer script itself would
# remove the local installation, so these tests never execute its main body.
$functionNames = @("Test-SamePath", "Test-SameProcessIdentity", "Test-CodeCodexParentEdge", "Get-CodeCodexRemovalProtection", "Get-CodeCodexOwnedDescendants")
foreach ($definition in $ast.FindAll({
    param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]
}, $true)) {
    if ($definition.Name -in $functionNames) {
        Invoke-Expression $definition.Extent.Text
    }
}

$started = [DateTime]::Parse("2026-09-27T12:00:00")
$expected = [pscustomobject]@{
    ProcessId = [uint32]42
    Name = "code-codex.exe"
    ExecutablePath = "C:\Users\tester\AppData\Local\Programs\Code-Codex\versions\0.3.19\code-codex.exe"
    CreationDate = $started
}
$cases = @(
    @("same process", [pscustomobject]@{
        ProcessId = [uint32]42
        Name = "CODE-CODEX.EXE"
        ExecutablePath = $expected.ExecutablePath.ToUpperInvariant()
        CreationDate = $started
    }, $true),
    @("already exited", $null, $false),
    @("PID reused", [pscustomobject]@{
        ProcessId = [uint32]42
        Name = "explorer.exe"
        ExecutablePath = "C:\Windows\explorer.exe"
        CreationDate = $started.AddSeconds(1)
    }, $false),
    @("path unavailable during exit", [pscustomobject]@{
        ProcessId = [uint32]42
        Name = "code-codex.exe"
        ExecutablePath = $null
        CreationDate = $started
    }, $false),
    @("new process at the same path", [pscustomobject]@{
        ProcessId = [uint32]42
        Name = "code-codex.exe"
        ExecutablePath = $expected.ExecutablePath
        CreationDate = $started.AddSeconds(1)
    }, $false)
)

foreach ($case in $cases) {
    $actual = Test-SameProcessIdentity $expected $case[1]
    if ($actual -ne $case[2]) {
        throw "$($case[0]): expected $($case[2]), got $actual"
    }
}
Write-Output "Uninstall process identity checks passed ($($cases.Count) cases)."

function Record([uint32]$Id, [uint32]$Parent, [string]$Name, [int]$Seconds) {
    [pscustomobject]@{ ProcessId=$Id; ParentProcessId=$Parent; Name=$Name; CreationDate=$started.AddSeconds($Seconds); ExecutablePath=(Join-Path 'C:\fixture' $Name) }
}
$snapshot = @(
    (Record 10 0 'CodeCodex.exe' 0),
    (Record 20 10 'code-codex.exe' 1),
    (Record 30 20 'Uninstall-CodeCodex.exe' 2),
    (Record 40 30 'Uninstall-CodeCodex.exe' 3),
    (Record 50 40 'powershell.exe' 4),
    (Record 60 40 'powershell.exe' 5),
    (Record 70 20 'ChatGPT.exe' 2),
    (Record 80 70 'renderer.exe' 3),
    (Record 90 0 'ChatGPT.exe' 1),
    (Record 100 50 'powershell.exe' 6)
)
$roots = @($snapshot | Where-Object { $_.ProcessId -in @(10,20) })
function Selection([object[]]$Rows=$snapshot, [uint32]$Worker=50) {
    $protection = Get-CodeCodexRemovalProtection $Rows $Worker
    $selected = @(Get-CodeCodexOwnedDescendants $Rows $roots $protection | ForEach-Object ProcessId)
    [pscustomobject]@{Protected=$protection;Selected=$selected}
}
$selection=Selection
foreach($id in @(30,40,50,60,100)) { if(-not $selection.Protected.ContainsKey([uint32]$id) -or $id -in $selection.Selected){throw "Removal branch was selected for termination: $id"} }
foreach($id in @(70,80)) { if($id -notin $selection.Selected){throw "Owned application child was not selected: $id"} }
if(90 -in $selection.Selected -or $selection.Protected.ContainsKey([uint32]20)){throw 'Unrelated session or application root was misclassified'}
# The installed staging parent can exit before the snapshot. The temporary
# wizard must still protect its worker and sibling UI without that old PID.
$missing=Selection @($snapshot | Where-Object ProcessId -ne 30)
foreach($id in @(40,50,60,100)){if(-not $missing.Protected.ContainsKey([uint32]$id)){throw 'Exited staging parent broke wizard protection'}}
$direct=Selection @($snapshot | Where-Object { $_.ProcessId -notin @(30,40) })
if(-not $direct.Protected.ContainsKey([uint32]50) -or -not $direct.Protected.ContainsKey([uint32]100)){throw 'Direct PowerShell worker was not protected'}
$reused=@($snapshot | Where-Object ProcessId -ne 30)+@(Record 30 20 'Uninstall-CodeCodex.exe' 20)
$selection=Selection $reused
if($selection.Protected.ContainsKey([uint32]30) -or $selection.Protected.ContainsKey([uint32]20)){throw 'Reused parent PID was accepted'}
$falseChild=@($snapshot)+(Record 110 20 'other.exe' -1)
if(110 -in (Selection $falseChild).Selected){throw 'Reused application-parent PID linked an older unrelated process'}
foreach($invalid in @(@{Rows=@($snapshot | Where-Object ProcessId -ne 50)},@{Rows=@($snapshot)+@($snapshot[4])})) {
    $rejected=$false;$reason='';try { Get-CodeCodexRemovalProtection $invalid.Rows 50 | Out-Null }catch{$reason=$_.Exception.Message;$rejected=$reason -match 'CC-UNINSTALL-PROCESS-001'}
    if(-not $rejected){throw "Invalid worker snapshot did not fail before shutdown: $reason"}
}
$unknown=@($snapshot | ForEach-Object {$_ | Select-Object *}); ($unknown | Where-Object ProcessId -eq 50).CreationDate=$null
$rejected=$false;try { Get-CodeCodexRemovalProtection $unknown 50 | Out-Null }catch{$rejected=$true}
if(-not $rejected){throw 'Unknown worker creation time was accepted'}
Write-Output 'Removal topology checks passed: menu/staging/worker/UI, direct and exited-parent launch, PID reuse, unrelated session and fail-closed snapshots.'
