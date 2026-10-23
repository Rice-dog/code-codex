# Read-only: this wrapper never supplies --close to the native worker.
[CmdletBinding()]
param([string]$BinaryPath)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $BinaryPath) { $BinaryPath = Join-Path $repo 'target\release\code-codex.exe' }
$binary = (Resolve-Path -LiteralPath $BinaryPath).Path
$records = @(Get-CimInstance Win32_Process -Filter "Name='Codex.exe' OR Name='ChatGPT.exe'" -OperationTimeoutSec 10 | Where-Object {
    $_.ExecutablePath -and $_.CommandLine -and $_.CommandLine -notmatch '(?i)(?:^|\s)--type(?:=|\s+)'
})
$results = @($records | ForEach-Object {
    $process = [Diagnostics.Process]::GetProcessById([int]$_.ProcessId)
    try {
        $created = ([DateTimeOffset]$process.StartTime).ToUnixTimeMilliseconds()
        $report = & $binary startup-recovery-window --pid $_.ProcessId --created-ms $created --image $_.ExecutablePath
        if ($LASTEXITCODE) { throw 'Read-only native window inspection failed' }
        [pscustomobject]@{name=$_.Name;mainWindow=$process.MainWindowHandle.ToInt64();debugManaged=($_.CommandLine -match '--remote-debugging-port');native=($report | ConvertFrom-Json)}
    } finally { $process.Dispose() }
})
[pscustomobject]@{readOnly=$true;processes=$results} | ConvertTo-Json -Depth 8
