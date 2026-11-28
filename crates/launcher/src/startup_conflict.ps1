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
    $managed = $record.CommandLine -match '(?i)(?:^|\s)--remote-debugging-port(?:=|\s+)'
    if ($managed -and $env:CLE_UPDATE_RESTART_ALLOWED -ne '1') {
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
        return [pscustomobject]@{Managed=$managed;Process=$process;Pid=[int]$record.ProcessId;Created=$created}
    } catch { $process.Dispose(); throw }
}

function New-RestartDialog {
    if (-not (Get-Command New-CodeCodexStartupDialog -ErrorAction SilentlyContinue)) {
        # The native embedded worker prepends the shared factory. Source tests
        # import it explicitly rather than execute a writable temporary script.
        throw 'The shared startup diagnostic factory is unavailable'
    }
    $env:CLE_ERROR_SUMMARY='Codex Desktop is already running without Code-Codex'
    $env:CLE_ERROR_STAGE='Checking the Codex process'
    $env:CLE_ERROR_CODE='CC-START-STATE-001'
    $env:CLE_ERROR_REASON='An official Codex instance is already running. No process was closed.'
    $env:CLE_ERROR_GUIDANCE='Close Codex, then start it through Code-Codex, or click Close and restart below.'
    $dialog=New-CodeCodexStartupDialog -ConsentOnly
    return $dialog
}

function Assert-RestartUiPath([string]$Path) {
    $current=[IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item=Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Redirected startup UI channel refused' }
        }
        $current=[IO.Path]::GetDirectoryName($current)
    }
}

function Publish-RestartUiPhase([string]$Phase, [string]$Stage, [string]$Reason) {
    if ([string]::IsNullOrWhiteSpace($env:CLE_RECOVERY_UI_DIRECTORY)) { return }
    $path=Join-Path $env:CLE_RECOVERY_UI_DIRECTORY 'recovery.json'
    Assert-RestartUiPath $path
    $state=ConvertFrom-Json -InputObject (Read-CodeCodexStartupText $path)
    if ($state.schema -ne 1 -or [string]::IsNullOrWhiteSpace($state.requestId)) { throw 'Invalid startup UI channel state' }
    $state.phase=$Phase; $state.diagnostic.stage=$Stage; $state.diagnostic.reason=$Reason
    if ($Phase -eq 'awaiting-consent') { $state.diagnostic.guidance='Close Codex, then start it through Code-Codex, or click Close and restart below.' }
    $state.history=@($state.history)+@($Stage+': '+$Reason)
    if ($state.history.Count -gt 64) { throw 'Startup recovery stage budget exceeded' }
    if ($Phase -eq 'old-exited') {
        $state.oldExited=$true
        $state.relaunchStartedMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    $temporary=Join-Path $env:CLE_RECOVERY_UI_DIRECTORY ([Guid]::NewGuid().ToString('N')+'.tmp')
    try {
        [IO.File]::WriteAllText($temporary,($state|ConvertTo-Json -Depth 12 -Compress),[Text.UTF8Encoding]::new($false))
        [IO.File]::Replace($temporary,$path,[NullString]::Value)
    } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}

function Wait-RestartUiDecision {
    Publish-RestartUiPhase 'awaiting-consent' 'Checking the Codex process' 'The original conflict is confirmed. Choose Close and restart, or Cancel to preserve the current instance.'
    $root=$env:CLE_RECOVERY_UI_DIRECTORY
    $state=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $root 'recovery.json')))
    $path=Join-Path $root 'action.json'
    $deadline=[DateTime]::UtcNow.AddMinutes(10)
    $owner=$null
    try {
        if ($env:CLE_RECOVERY_UI_OWNER_PID) { $owner=[Diagnostics.Process]::GetProcessById([int]$env:CLE_RECOVERY_UI_OWNER_PID);[void]$owner.Handle }
        while (-not [IO.File]::Exists($path)) {
            if (($null -ne $owner -and $owner.HasExited) -or [DateTime]::UtcNow -ge $deadline) {
                Publish-RestartUiPhase 'cancelled' 'Recovery cancelled' 'The confirmation window owner exited or consent timed out. No close request was sent.'
                return [pscustomobject]@{Accepted=$false;Remember=$false}
            }
            Start-Sleep -Milliseconds 100
        }
        Assert-RestartUiPath $path
        $item=Get-Item -LiteralPath $path -Force
        if ($item.PSIsContainer -or $item.Length -gt 4096) { throw 'Invalid startup recovery decision size or type' }
        $raw=[IO.File]::ReadAllText($path)
        # Require a tiny unambiguous object before parsing; duplicate keys and
        # non-boolean values cannot grant permission.
        if ([regex]::Matches($raw,'"requestId"\s*:').Count -ne 1 -or [regex]::Matches($raw,'"action"\s*:').Count -ne 1 -or
            [regex]::Matches($raw,'"remember"\s*:').Count -ne 1 -or [regex]::Matches($raw,'"schema"\s*:').Count -ne 1) { throw 'Invalid startup recovery decision keys' }
        $decision=ConvertFrom-Json -InputObject $raw
        if ((@($decision.PSObject.Properties.Name|Sort-Object) -join ',') -cne 'action,remember,requestId,schema' -or
            $decision.schema -isnot [int] -or $decision.schema -ne 1 -or $decision.requestId -cne $state.requestId -or
            $decision.remember -isnot [bool] -or $decision.action -cnotin @('restart','cancel')) { throw 'Invalid or stale startup recovery decision' }
        if ($decision.action -eq 'cancel') {
            Publish-RestartUiPhase 'cancelled' 'Recovery cancelled' 'The current Codex instance was preserved. No close request was sent.'
        }
        return [pscustomobject]@{Accepted=($decision.action -ceq 'restart');Remember=($decision.action -ceq 'restart' -and $decision.remember)}
    } finally { if ($null -ne $owner) { $owner.Dispose() } }
}

function Show-RestartConfirmation {
    if (-not [string]::IsNullOrWhiteSpace($env:CLE_RECOVERY_UI_DIRECTORY)) { return Wait-RestartUiDecision }
    $dialog = New-RestartDialog
    try {
        $accepted = $dialog.Form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK
        return [pscustomobject]@{Accepted=$accepted;Remember=($accepted -and $dialog.Remember.Checked)}
    } finally { $dialog.Timer.Dispose(); $dialog.Form.Dispose() }
}

function Invoke-OfficialRestartQuitMenu($Candidate, $Windows) {
    if ($Candidate.Process.HasExited) { return }
    if (@($Windows | Where-Object {$_.visible -and -not $_.enabled}).Count) { throw 'Codex has an active modal dialog; no further shutdown was requested' }
    $Candidate.Process.Refresh()
    $handle = $Candidate.Process.MainWindowHandle
    $eligible = @($Windows | Where-Object {$_.handle -eq $handle.ToInt64() -and $_.visible -and $_.enabled -and -not $_.owned -and $_.class -ceq 'Chrome_WidgetWin_1'})
    if ($handle -eq [IntPtr]::Zero -or $eligible.Count -ne 1) { throw 'No verified Codex main window for the native Quit menu' }
    Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
    $target = [Windows.Automation.AutomationElement]::FromHandle($handle)
    if (-not $target -or $target.Current.ProcessId -ne $Candidate.Pid) { throw 'Codex window ownership changed before Quit' }
    if (-not ('CodeCodexOfficialQuitMenu' -as [type])) {
        $references = @([Windows.Automation.AutomationElement].Assembly.Location, [Windows.Automation.AutomationIdentifier].Assembly.Location)
        Add-Type -ReferencedAssemblies $references -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

public static class CodeCodexOfficialQuitMenu {
    [DllImport("user32.dll")]
    private static extern bool IsWindowEnabled(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);

    private static readonly Condition FileMenu = new PropertyCondition(AutomationElement.AutomationIdProperty, "application-menu-trigger-file-menu");
    private static readonly Condition Menu = new PropertyCondition(AutomationElement.AutomationIdProperty, "application-menu-content");
    private static readonly Condition MenuItem = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuItem);

    private static void CheckWindow(IntPtr handle, int pid) {
        uint owner;
        if (GetWindowThreadProcessId(handle, out owner) == 0 || owner != (uint)pid || !IsWindowEnabled(handle))
            throw new InvalidOperationException("The official Codex window is no longer eligible for Quit.");
    }

    private static AutomationElement ReadyMenu(AutomationElement window, int pid, Condition condition, string description) {
        var candidates = window.FindAll(TreeScope.Descendants, condition);
        if (candidates.Count > 1)
            throw new InvalidOperationException("The official " + description + " is ambiguous.");
        if (candidates.Count == 0) return null;
        var candidate = candidates[0];
        if (candidate.Current.ProcessId != pid)
            throw new InvalidOperationException("The official " + description + " ownership changed.");
        return candidate.Current.IsEnabled ? candidate : null;
    }

    private static bool WaitForChange(AutoResetEvent changed, Stopwatch clock) {
        var remaining = TimeSpan.FromSeconds(2) - clock.Elapsed;
        if (remaining <= TimeSpan.Zero) return false;
        // Re-read once at the deadline if the accessibility provider did not emit an event.
        changed.WaitOne(remaining);
        return true;
    }

    public static void Invoke(AutomationElement window, IntPtr handle, int pid) {
        using (var changed = new AutoResetEvent(false)) {
            Action signal = () => {
                try { changed.Set(); } catch (ObjectDisposedException) {}
            };
            StructureChangedEventHandler notify = (sender, args) => signal();
            AutomationPropertyChangedEventHandler enabled = (sender, args) => signal();
            Automation.AddStructureChangedEventHandler(window, TreeScope.Subtree, notify);
            bool enabledSubscribed = false;
            ExpandCollapsePattern expand = null;
            bool opened = false;
            bool invoked = false;
            try {
                Automation.AddAutomationPropertyChangedEventHandler(window, TreeScope.Subtree, enabled, AutomationElement.IsEnabledProperty);
                enabledSubscribed = true;
                var clock = Stopwatch.StartNew();
                AutomationElement file;
                while (true) {
                    CheckWindow(handle, pid);
                    file = ReadyMenu(window, pid, FileMenu, "File menu");
                    if (file != null) break;
                    if (!WaitForChange(changed, clock))
                        throw new InvalidOperationException("The official File menu did not become available.");
                }
                expand = (ExpandCollapsePattern)file.GetCurrentPattern(ExpandCollapsePattern.Pattern);
                if (expand.Current.ExpandCollapseState != ExpandCollapseState.Expanded) {
                    CheckWindow(handle, pid);
                    expand.Expand();
                    opened = true;
                }
                clock.Restart();
                while (true) {
                    CheckWindow(handle, pid);
                    var menu = expand.Current.ExpandCollapseState == ExpandCollapseState.Expanded
                        ? ReadyMenu(window, pid, Menu, "File menu contents") : null;
                    if (menu != null) {
                        AutomationElement quit = null;
                        foreach (AutomationElement item in menu.FindAll(TreeScope.Children, MenuItem)) {
                            if (!item.Current.Name.EndsWith(" Ctrl+Q", StringComparison.Ordinal)
                                || item.Current.ProcessId != pid || !item.Current.IsEnabled) continue;
                            if (quit != null) throw new InvalidOperationException("The official Quit item is ambiguous.");
                            quit = item;
                        }
                        if (quit != null) {
                            CheckWindow(handle, pid);
                            ((InvokePattern)quit.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
                            invoked = true;
                            return;
                        }
                    }
                    if (!WaitForChange(changed, clock))
                        throw new InvalidOperationException("The official File menu did not expose its Quit item.");
                }
            } finally {
                Automation.RemoveStructureChangedEventHandler(window, notify);
                if (enabledSubscribed) Automation.RemoveAutomationPropertyChangedEventHandler(window, enabled);
                if (opened && !invoked) {
                    try {
                        if (expand.Current.ExpandCollapseState == ExpandCollapseState.Expanded) expand.Collapse();
                    } catch (ElementNotAvailableException) {}
                }
            }
        }
    }
}
"@
    }
    [CodeCodexOfficialQuitMenu]::Invoke($target, $handle, $Candidate.Pid)
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
    if ($env:CLE_UPDATE_RESTART_ALLOWED -eq '1') { $info.Arguments += ' --after-official-update' }
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
            $report.force -isnot [bool] -or $report.force) { throw 'Invalid native shutdown response' }
        if ($env:CLE_UPDATE_RESTART_ALLOWED -eq '1' -and $report.PSObject.Properties['failureCode'] -and
            $report.failureCode -eq 351 -and -not $report.shutdownRequested -and -not $report.exited) {
            Publish-RestartUiPhase 'closing' 'Requesting Codex Quit' 'Restart Manager returned Windows error 351. Invoking the verified official File menu Quit command without sending keyboard input.'
            Invoke-OfficialRestartQuitMenu $Candidate $report.windows
            $script:officialUpdateQuitRequested=$true
            return
        }
        if (-not $report.shutdownRequested -and -not $report.exited) { throw 'Invalid native shutdown response' }
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
    $updateRecovery = $env:CLE_UPDATE_RESTART_ALLOWED -eq '1'
    $script:officialUpdateQuitRequested=$false
    if ($candidate.Managed -and -not $updateRecovery) { return 'managed' }
    try {
        $automatic = ($env:CLE_UPDATE_RESTART_ALLOWED -eq '1') -or (Read-RestartPreference $PreferencePath)
        $remember = $false
        if (-not $automatic) {
            $choice = Show-RestartConfirmation
            if (-not $choice.Accepted) { return 'cancelled' }
            $remember = $choice.Remember
        }
        # Reinspect after consent: never close a new instance or a newly managed session.
        $current = Get-RestartCandidate $Image
        try {
            if ($null -ne $current -and (($current.Managed -and -not $updateRecovery) -or $current.Pid -ne $candidate.Pid -or $current.Created -ne $candidate.Created)) {
                throw 'Codex changed while awaiting confirmation; no process was closed'
            }
            if ($null -eq $current -and -not $candidate.Process.HasExited) { throw 'Official process inspection became unavailable' }
        } finally { if ($null -ne $current -and $null -ne $current.Process) { $current.Process.Dispose() } }
        Publish-RestartUiPhase 'closing' 'Closing the original instance' 'Requesting graceful exit of the retained, identity-checked instance once. No forced termination is used.'
        Wait-RestartProcessExit $candidate $Image
        try { Publish-RestartUiPhase 'old-exited' 'Original instance exited' 'The original instance exited. The replacement has not yet been started or verified.' }
        catch { [Console]::Error.WriteLine('CC-START-RECOVERY-UI-003: The old instance exited; progress persistence failed. Continuing replacement startup without repeating the close request.') }
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
        if ($script:officialUpdateQuitRequested) { return 'ready-official-menu' }
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
