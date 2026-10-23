[CmdletBinding()]
param([string]$BinaryPath)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $BinaryPath) { $BinaryPath = Join-Path $repo 'target\release\code-codex.exe' }
$binary = (Resolve-Path -LiteralPath $BinaryPath).Path
$scriptPath = Join-Path $PSScriptRoot 'fixtures\startup-conflict-window.ps1'
$shell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$root = Join-Path ([IO.Path]::GetTempPath()) ('CodeCodex-NativeWindows-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$processes = New-Object Collections.ArrayList
$checks = 0
function Check([bool]$Pass, [string]$Message) {
    if (-not $Pass) { throw $Message }
    $script:checks++
}
function New-Fixture([string]$Mode) {
    $ready = Join-Path $root ([Guid]::NewGuid().ToString('N'))
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $shell
    $info.Arguments = '-NoLogo -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File "' + $scriptPath + '"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.EnvironmentVariables['CLE_RESTART_WINDOW_READY'] = $ready
    $info.EnvironmentVariables['CLE_RESTART_WINDOW_MODE'] = $Mode
    $process = [Diagnostics.Process]::Start($info)
    [void]$processes.Add($process)
    $until = [DateTime]::UtcNow.AddSeconds(20)
    while (-not [IO.File]::Exists($ready) -and -not $process.HasExited -and [DateTime]::UtcNow -lt $until) { Start-Sleep -Milliseconds 100 }
    Check ([IO.File]::Exists($ready)) ('Fixture ready: ' + $Mode)
    return $process
}
function Invoke-Worker($Target, [bool]$Close, [long]$Offset = 0, [string]$Image = $shell) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $binary
    $created = ([DateTimeOffset]$Target.StartTime).ToUnixTimeMilliseconds() + $Offset
    $info.Arguments = 'startup-recovery-window --pid ' + $Target.Id + ' --created-ms ' + $created + ' --image "' + $Image + '"'
    if ($Close) { $info.Arguments += ' --close' }
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $worker = [Diagnostics.Process]::Start($info)
    try {
        $out = $worker.StandardOutput.ReadToEndAsync()
        $err = $worker.StandardError.ReadToEndAsync()
        Check ($worker.WaitForExit(45000)) 'Native operation is bounded'
        return [pscustomobject]@{Code=$worker.ExitCode;Out=$out.GetAwaiter().GetResult();Err=$err.GetAwaiter().GetResult()}
    } finally {
        if (-not $worker.HasExited) { $worker.Kill(); [void]$worker.WaitForExit(5000) }
        $worker.Dispose()
    }
}
try {
    $bystander = New-Fixture 'normal'
    foreach ($mode in @('normal','multi','hidden')) {
        $target = New-Fixture $mode
        $reply = Invoke-Worker $target $false
        Check ($reply.Code -eq 0) ('Read-only native inspection: ' + $reply.Err)
        $inventory = ConvertFrom-Json -InputObject $reply.Out
        Check ($inventory.readOnly -and -not $inventory.shutdownRequested -and -not $inventory.force) 'Inspection cannot close a window'
        Check (@($inventory.windows).Count -gt 0) 'Native enumeration finds owned windows'
        Check (-not $target.HasExited -and -not $bystander.HasExited) 'Inspection preserves both processes'
        if ($mode -eq 'multi') { Check (@($inventory.windows | Where-Object { $_.visible }).Count -ge 2) 'Multiple top-level windows found' }
        if ($mode -eq 'hidden') { $target.Refresh(); Check ($target.MainWindowHandle -eq [IntPtr]::Zero) 'Regression fixture has no .NET main window' }
        $wrong = Invoke-Worker $target $true 1000
        Check ($wrong.Code -ne 0 -and $wrong.Err.Contains('creation time changed')) 'Changed process generation refuses close'
        $wrong = Invoke-Worker $target $true 0 $binary
        Check ($wrong.Code -ne 0 -and $wrong.Err.Contains('image changed')) 'Mismatched executable refuses close'
        Check (-not $target.HasExited) 'Failed identity checks preserve process'
        $reply = Invoke-Worker $target $true
        Check ($reply.Code -eq 0) ('Graceful close ' + $mode + ': ' + $reply.Err)
        $report = ConvertFrom-Json -InputObject $reply.Out
        Check ($report.shutdownRequested -and -not $report.force) 'Only non-forcing shutdown requested'
        Check ($target.WaitForExit(15000)) ('Fixture exits gracefully: ' + $mode)
        Check (-not $bystander.HasExited) 'Unrelated process remains alive'
    }
    $target = New-Fixture 'disabled'
    $reply = Invoke-Worker $target $true
    Check ($reply.Code -ne 0 -and $reply.Err.Contains('modal dialog')) 'Disabled/modal window is not bypassed'
    Check (-not $target.HasExited) 'Modal fixture remains alive'
    $target = New-Fixture 'veto'
    $reply = Invoke-Worker $target $true
    Check ($reply.Code -ne 0) 'Application refusal prevents successful restart'
    Check (-not $target.HasExited -and -not $bystander.HasExited) 'Veto is respected without force-kill'
    Write-Host ('Native window recovery: ' + $checks + ' checks passed; no real Codex process was closed')
} finally {
    # Only the disposable fixture processes created by this script are cleaned up.
    foreach ($process in $processes) {
        if (-not $process.HasExited) { $process.Kill(); [void]$process.WaitForExit(5000) }
        $process.Dispose()
    }
    if ([IO.Path]::GetDirectoryName($root) -ne [IO.Path]::GetTempPath().TrimEnd('\') -or
        [IO.Path]::GetFileName($root) -notmatch '^CodeCodex-NativeWindows-[a-f0-9]{32}$') { throw 'Unsafe fixture cleanup path' }
    [IO.Directory]::Delete($root, $true)
}
