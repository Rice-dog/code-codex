$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Assert-RestartPreferencePath([string]$Path) {
    if ([IO.Path]::GetFileName($Path) -cne 'startup-recovery.json') { throw 'Invalid startup preference filename' }
    $itemPath = [IO.Path]::GetFullPath($Path)
    while ($itemPath) {
        if (Test-Path -LiteralPath $itemPath) {
            $item = Get-Item -LiteralPath $itemPath -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Redirected startup preference path refused' }
            if ($itemPath -eq $Path -and $item.PSIsContainer) { throw 'Startup preference is not a regular file' }
        }
        $itemPath = [IO.Path]::GetDirectoryName($itemPath)
    }
}

function Read-RestartPreference([string]$Path) {
    Assert-RestartPreferencePath $Path
    if (-not [IO.File]::Exists($Path)) { return $false }
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $buffer = New-Object byte[] 4097
        $count = 0
        do {
            $read = $stream.Read($buffer, $count, $buffer.Length - $count)
            $count += $read
        } while ($read -gt 0 -and $count -lt $buffer.Length)
        if ($count -gt 4096) { throw 'Startup preference exceeds size limit' }
        $raw = [Text.UTF8Encoding]::new($false, $true).GetString($buffer, 0, $count)
        # Accept only this tiny canonical schema, not duplicate or escaped keys.
        $shape = '\A\s*\{\s*(?:"schema"\s*:\s*1\s*,\s*"autoRestart"\s*:\s*(?:true|false)|"autoRestart"\s*:\s*(?:true|false)\s*,\s*"schema"\s*:\s*1)\s*\}\s*\z'
        if (-not [regex]::IsMatch($raw, $shape)) { throw 'Invalid startup preference schema' }
        $value = ConvertFrom-Json -InputObject $raw
        $names = @($value.PSObject.Properties.Name | Sort-Object)
        if (($names -join ',') -cne 'autoRestart,schema' -or
            ($value.schema -isnot [int] -and $value.schema -isnot [long]) -or
            $value.schema -ne 1 -or $value.autoRestart -isnot [bool]) {
            throw 'Invalid startup preference schema'
        }
        return $value.autoRestart
    } finally { $stream.Dispose() }
}

function Save-RestartPreference([string]$Path, [bool]$Enabled) {
    Assert-RestartPreferencePath $Path
    $parent = [IO.Path]::GetDirectoryName($Path)
    [void][IO.Directory]::CreateDirectory($parent)
    $temporary = Join-Path $parent ('.startup-recovery.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes((@{schema=1;autoRestart=$Enabled} | ConvertTo-Json -Compress))
        $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
        Assert-RestartPreferencePath $Path
        if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary, $Path, [NullString]::Value) }
        else { [IO.File]::Move($temporary, $Path) }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    }
}

function Get-RestartCandidate([string]$Image) {
    $expected = [IO.Path]::GetFullPath($Image)
    $roots = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe' OR Name='Codex.exe'" -OperationTimeoutSec 10 | Where-Object {
        $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).Equals($expected, [StringComparison]::OrdinalIgnoreCase) -and
        $_.CommandLine -notmatch '(?i)(?:^|\s)--type(?:=|\s+)' -and
        $_.CommandLine -notmatch '(?i)CodeCodexOfficialProbe-'
    })
    if ($roots.Count -eq 0) { return $null }
    if ($roots.Count -ne 1) { throw 'More than one official Codex browser process is running; no process was closed' }
    $record = $roots[0]
    if ([string]::IsNullOrWhiteSpace($record.CommandLine)) { throw 'Official process command line is unavailable' }
    if ($record.CommandLine -match '(?i)(?:^|\s)--remote-debugging-port(?:=|\s+)') {
        return [pscustomobject]@{Managed=$true;Process=$null;Pid=[int]$record.ProcessId;Created=0L}
    }
    $process = [Diagnostics.Process]::GetProcessById([int]$record.ProcessId)
    try {
        # Keep this handle open across the confirmation dialog. PID alone is not identity.
        [void]$process.Handle
        $created = ([DateTimeOffset]$process.StartTime).ToUnixTimeMilliseconds()
        if ($process.HasExited -or $created -ne ([DateTimeOffset]$record.CreationDate).ToUnixTimeMilliseconds() -or
            -not [IO.Path]::GetFullPath($process.MainModule.FileName).Equals($expected, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Official process identity changed during inspection'
        }
        $caller = [Diagnostics.Process]::GetCurrentProcess()
        try { if ($process.SessionId -ne $caller.SessionId) { throw 'Codex belongs to a different Windows session' } }
        finally { $caller.Dispose() }
        return [pscustomobject]@{Managed=$false;Process=$process;Pid=[int]$record.ProcessId;Created=$created}
    } catch { $process.Dispose(); throw }
}

function New-RestartDialog {
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Reopen Codex with Code-Codex'
    $form.ClientSize = New-Object System.Drawing.Size(580, 250)
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.TopMost = $true
    $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $form.Icon = [System.Drawing.SystemIcons]::Warning
    $warning = New-Object System.Windows.Forms.Label
    $warning.Location = New-Object System.Drawing.Point(24, 22)
    $warning.Size = New-Object System.Drawing.Size(532, 106)
    $warning.Text = $env:CLE_RESTART_WARNING
    $form.Controls.Add($warning)
    $remember = New-Object System.Windows.Forms.CheckBox
    $remember.Location = New-Object System.Drawing.Point(24, 138)
    $remember.Size = New-Object System.Drawing.Size(532, 42)
    $remember.Text = 'Automatically close and reopen Codex next time (do not ask again)'
    $remember.Checked = $false
    $form.Controls.Add($remember)
    $restart = New-Object System.Windows.Forms.Button
    $restart.Location = New-Object System.Drawing.Point(226, 198)
    $restart.Size = New-Object System.Drawing.Size(180, 34)
    $restart.Text = 'Close and restart'
    $restart.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($restart)
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Location = New-Object System.Drawing.Point(420, 198)
    $cancel.Size = New-Object System.Drawing.Size(136, 34)
    $cancel.Text = 'Cancel'
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($cancel)
    # Enter and Escape both default to cancellation; consent needs an explicit choice.
    $form.AcceptButton = $cancel
    $form.CancelButton = $cancel
    return [pscustomobject]@{Form=$form;Remember=$remember;Cancel=$cancel}
}

function Show-RestartConfirmation {
    $dialog = New-RestartDialog
    try {
        $accepted = $dialog.Form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK
        return [pscustomobject]@{Accepted=$accepted;Remember=($accepted -and $dialog.Remember.Checked)}
    } finally { $dialog.Form.Dispose() }
}

function Invoke-NativeRestartClose($Candidate, [string]$Image) {
    $helper = $env:CLE_RESTART_HELPER
    foreach ($path in @($helper, $Image)) {
        if ([string]::IsNullOrWhiteSpace($path) -or -not [IO.Path]::IsPathRooted($path) -or $path -match '["\x00-\x1f]') {
            throw 'Invalid native startup recovery path'
        }
    }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $helper
    $info.Arguments = 'startup-recovery-window --pid ' + $Candidate.Pid + ' --created-ms ' + $Candidate.Created + ' --image "' + $Image + '" --close'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $info.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $worker = [Diagnostics.Process]::Start($info)
    try {
        $stdout = $worker.StandardOutput.ReadToEndAsync()
        $stderr = $worker.StandardError.ReadToEndAsync()
        if (-not $worker.WaitForExit(45000)) {
            # Only our own helper is terminated, never the original Codex.
            $worker.Kill(); [void]$worker.WaitForExit(5000)
            throw 'Graceful shutdown helper timed out; Codex was not force-terminated or relaunched'
        }
        $reply = $stdout.GetAwaiter().GetResult()
        $failure = $stderr.GetAwaiter().GetResult()
        if ($worker.ExitCode -ne 0) {
            if ($failure.Length -gt 2048) { $failure = $failure.Substring(0, 2048) }
            throw ('Native graceful shutdown failed: ' + $failure.Trim())
        }
        if ($reply.Length -gt 131072) { throw 'Native shutdown report exceeds size limit' }
        $report = ConvertFrom-Json -InputObject $reply
        if ($report.schema -ne 1 -or $report.pid -ne $Candidate.Pid -or $report.createdMs -ne $Candidate.Created -or
            $report.readOnly -isnot [bool] -or $report.readOnly -or
            $report.force -isnot [bool] -or $report.force -or
            (-not $report.shutdownRequested -and -not $report.exited)) { throw 'Invalid native shutdown response' }
    } finally { $worker.Dispose() }
}

function Request-RestartWindowClose($Candidate, [string]$Image) {
    if ($Candidate.Process.HasExited) { return }
    $fresh = [Diagnostics.Process]::GetProcessById($Candidate.Pid)
    try {
        [void]$fresh.Handle
        if (([DateTimeOffset]$fresh.StartTime).ToUnixTimeMilliseconds() -ne $Candidate.Created -or
            -not [IO.Path]::GetFullPath($fresh.MainModule.FileName).Equals([IO.Path]::GetFullPath($Image), [StringComparison]::OrdinalIgnoreCase) -or
            $Candidate.Process.HasExited) { throw 'Official process identity changed before close' }
        Invoke-NativeRestartClose $Candidate $Image
    } finally { $fresh.Dispose() }
}

function Wait-RestartProcessExit($Candidate, [string]$Image, [TimeSpan]$Timeout = [TimeSpan]::FromSeconds(15)) {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    # Ask once. Repeated close requests could dismiss or re-trigger an app's
    # unsaved-changes prompt. The native call has its own bounded helper timeout.
    if ($clock.Elapsed -ge $Timeout) { throw 'Codex did not exit within 15 seconds; no force termination or relaunch was attempted' }
    try { Request-RestartWindowClose $Candidate $Image }
    catch { if (-not $Candidate.Process.HasExited) { throw } }
    $clock.Restart()
    while (-not $Candidate.Process.HasExited) {
        if ($clock.Elapsed -ge $Timeout) { throw 'Codex did not exit within 15 seconds; no force termination or relaunch was attempted' }
        [void]$Candidate.Process.WaitForExit(1000)
    }
}

function Invoke-RestartRecovery([string]$Image, [string]$PreferencePath) {
    $candidate = Get-RestartCandidate $Image
    if ($null -eq $candidate) { return 'ready' }
    if ($candidate.Managed) { return 'managed' }
    try {
        $automatic = Read-RestartPreference $PreferencePath
        $remember = $false
        if (-not $automatic) {
            $choice = Show-RestartConfirmation
            if (-not $choice.Accepted) { return 'cancelled' }
            $remember = $choice.Remember
        }
        # Reinspect after consent: never close a new instance or a newly managed session.
        $current = Get-RestartCandidate $Image
        try {
            if ($null -ne $current -and ($current.Managed -or $current.Pid -ne $candidate.Pid -or $current.Created -ne $candidate.Created)) {
                throw 'Codex changed while awaiting confirmation; no process was closed'
            }
            if ($null -eq $current -and -not $candidate.Process.HasExited) { throw 'Official process inspection became unavailable' }
        } finally { if ($null -ne $current -and $null -ne $current.Process) { $current.Process.Dispose() } }
        Wait-RestartProcessExit $candidate $Image
        $remaining = Get-RestartCandidate $Image
        if ($null -ne $remaining) {
            if ($null -ne $remaining.Process) { $remaining.Process.Dispose() }
            throw 'Another Codex process appeared; automatic relaunch was cancelled'
        }
        if ($remember) {
            try { Save-RestartPreference $PreferencePath $true }
            catch {
                # The app has already exited. Failure to persist an optional
                # preference must not strand the user without a new instance.
                # Return a bounded protocol token, never raw filesystem errors
                # (which can contain user paths) or a false "remembered" claim.
                return 'ready-preference-warning'
            }
        }
        return 'ready'
    } finally { $candidate.Process.Dispose() }
}

function Start-RestartRecovery {
    $mutex = [Threading.Mutex]::new($false, ('Local\CodeCodexStartupRecovery-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
    $held = $false
    try {
        try { $held = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held = $true }
        if (-not $held) {
            if ($env:CLE_RESTART_MODE -eq 'reset') { throw 'Startup recovery is busy; automatic restart permission was not cleared' }
            return 'cancelled'
        }
        if ($env:CLE_RESTART_MODE -eq 'reset') {
            Save-RestartPreference $env:CLE_RESTART_PREFERENCE $false
            return 'reset'
        }
        if ($env:CLE_RESTART_MODE -cne 'resolve') { throw 'Invalid startup recovery mode' }
        return Invoke-RestartRecovery $env:CLE_RESTART_EXECUTABLE $env:CLE_RESTART_PREFERENCE
    } finally { if ($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
}

try { [Console]::Write((Start-RestartRecovery)) }
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
