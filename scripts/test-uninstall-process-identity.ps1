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
$functionNames = @("Test-SamePath", "Test-SameProcessIdentity")
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
