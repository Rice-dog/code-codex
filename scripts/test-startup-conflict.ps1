[CmdletBinding()]
param([switch]$RequireNative)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$nativeBinary = Join-Path $root 'target\release\code-codex.exe'
if ($env:CLE_RESTART_HELPER) { $nativeBinary = $env:CLE_RESTART_HELPER }
$nativeAvailable = Test-Path -LiteralPath $nativeBinary -PathType Leaf
if ($nativeAvailable) { $env:CLE_RESTART_HELPER = (Resolve-Path -LiteralPath $nativeBinary).Path }
if ($RequireNative -and -not $nativeAvailable) { throw 'Native release binary is required; build it before running integration tests' }
$shared=Join-Path $root 'crates/launcher/src/startup_dialog.ps1'
. ([scriptblock]::Create([IO.File]::ReadAllText($shared)))
$source = Join-Path $root 'crates\launcher\src\startup_conflict.ps1'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors.Message -join '; ') }
# Import production functions, but never execute the real entry point or inspect Codex.
foreach ($definition in $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]}, $false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
$checks = 0
function Verify([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:checks++
}
function Reject([scriptblock]$Action, [string]$Message) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Verify $rejected $Message
}
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('CodeCodex-StartupConflict-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
try {
    $preference = Join-Path (Join-Path $fixture 'Chinese-path-中文 with spaces') 'startup-recovery.json'
    Verify (-not (Read-RestartPreference $preference)) 'Missing preference must ask'
    Verify (-not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($preference))) 'Reading must not create directories'
    Save-RestartPreference $preference $true
    Verify (Read-RestartPreference $preference) 'Consent roundtrip with Unicode and spaces'
    Save-RestartPreference $preference $false
    Verify (-not (Read-RestartPreference $preference)) 'Consent can be revoked atomically'
    $parent = [IO.Path]::GetDirectoryName($preference)
    Verify (@(Get-ChildItem -LiteralPath $parent -Force).Count -eq 1) 'No orphan preference candidate'
    foreach ($bad in @('{}','{"schema":1,"autoRestart":"true"}','{"schema":"1","autoRestart":true}','{"schema":true,"autoRestart":true}','{"schema":2,"autoRestart":true}','{"schema":1,"autoRestart":false,"autoRestart":true}','{"schema":1,"autoRestart":false,"auto\u0052estart":true}','{"schema":1,"autoRestart":true,"extra":1}',('x' * 4097))) {
        [IO.File]::WriteAllText($preference, $bad, [Text.UTF8Encoding]::new($false))
        Reject { Read-RestartPreference $preference } 'Malformed consent must not authorize a restart'
        Verify ([IO.File]::ReadAllText($preference) -ceq $bad) 'Corrupt consent must be preserved'
    }
    Save-RestartPreference $preference $false
    Reject { Save-RestartPreference (Join-Path $fixture 'settings.json') $true } 'Cannot write workspace settings'

    $env:CLE_RESTART_WARNING = 'Closing Codex may interrupt running tasks and lose unsaved changes.'
    $dialog = New-RestartDialog
    try {
        Verify (-not $dialog.Remember.Checked) 'Remember checkbox starts unchecked'
        Verify ($dialog.Form.AcceptButton -eq $dialog.Cancel) 'Enter defaults to cancellation'
        Verify ($dialog.Form.CancelButton -eq $dialog.Cancel) 'Escape cancels'
        Verify ($dialog.Cancel.DialogResult -eq [Windows.Forms.DialogResult]::Cancel) 'Cancel does not grant permission'
        Verify (@($dialog.Form.Controls | Where-Object { $_.Text.StartsWith($env:CLE_RESTART_WARNING) }).Count -eq 0) 'User-removed duplicate warning paragraph stays absent while consent controls remain'
        Verify ($env:CLE_ERROR_GUIDANCE -eq 'Close Codex, then start it through Code-Codex, or click Close and restart below.') 'Suggested action offers manual launch and the restart button'
    } finally { $dialog.Form.Dispose() }

    # Exercise the actual identity inspector against this disposable test process only.
    $own = [Diagnostics.Process]::GetCurrentProcess()
    $image = $own.MainModule.FileName
    $script:records = @([pscustomobject]@{ExecutablePath=$image;CommandLine='fixture';ProcessId=$own.Id;CreationDate=$own.StartTime})
    $script:windowFixture=$null
    function Get-CimInstance {
        param($ClassName,$Filter,$OperationTimeoutSec)
        if($null -ne $script:windowFixture -and $script:windowFixture.HasExited){return @()}
        return $script:records
    }
    $candidate = Get-RestartCandidate $image
    try { Verify ($candidate.Pid -eq $own.Id -and -not $candidate.Managed) 'Exact image and creation time inspector' }
    finally { $candidate.Process.Dispose() }
    $script:records[0].CreationDate = $own.StartTime.AddSeconds(-10)
    Reject { Get-RestartCandidate $image } 'Reject reused or changed process generation'
    $script:records[0].CommandLine = 'fixture --remote-debugging-port=55555'
    Verify ((Get-RestartCandidate $image).Managed) 'Debug-managed session must not be closed'
    $script:records[0].CommandLine = 'fixture --type=renderer'
    Verify ($null -eq (Get-RestartCandidate $image)) 'Do not select renderer children'
    $script:records[0].CommandLine = 'fixture CodeCodexOfficialProbe-123'
    Verify ($null -eq (Get-RestartCandidate $image)) 'Do not select diagnostic probe processes'
    $script:records[0].CommandLine = 'fixture'
    $script:records = @($script:records[0],$script:records[0])
    Reject { Get-RestartCandidate $image } 'Do not close ambiguous browser processes'
    $own.Dispose()

    # Real graceful-close integration against an off-screen, disposable WinForms
    # process. Only discovery and consent are mocked; the production identity,
    # handle retention, native exit and bounded wait functions run unchanged.
    if ($nativeAvailable) {
    $readyPath=Join-Path $fixture 'window-ready'
    $windowScript=Join-Path $PSScriptRoot 'fixtures\startup-conflict-window.ps1'
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$image
    $info.Arguments='-NoLogo -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File "'+$windowScript+'"'
    $info.UseShellExecute=$false
    $info.CreateNoWindow=$true
    $info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    $info.EnvironmentVariables['CLE_RESTART_WINDOW_READY']=$readyPath
    $script:windowFixture=[Diagnostics.Process]::Start($info)
    try {
        $deadline=[DateTime]::UtcNow.AddSeconds(15)
        while(-not [IO.File]::Exists($readyPath) -and [DateTime]::UtcNow -lt $deadline -and -not $script:windowFixture.HasExited){Start-Sleep -Milliseconds 100}
        Verify ([IO.File]::Exists($readyPath)) 'Disposable window becomes ready'
        $script:records=@([pscustomobject]@{ExecutablePath=$image;CommandLine='fixture';ProcessId=$script:windowFixture.Id;CreationDate=$script:windowFixture.StartTime})
        $captured=Get-RestartCandidate $image
        try { Reject { Wait-RestartProcessExit $captured $image ([TimeSpan]::Zero) } 'Production timeout stops before closing any window' }
        finally { $captured.Process.Dispose() }
        Verify (-not $script:windowFixture.HasExited) 'Timeout leaves the existing process alive'
        function Show-RestartConfirmation { return [pscustomobject]@{Accepted=$true;Remember=$false} }
        Save-RestartPreference $preference $false
        Verify ((Invoke-RestartRecovery $image $preference) -eq 'ready') 'Real graceful-close recovery completes'
        Verify ($script:windowFixture.HasExited -and $script:windowFixture.ExitCode -eq 0) 'Disposable process exits normally without force termination'
    } finally {
        if(-not $script:windowFixture.HasExited){$script:windowFixture.Kill();[void]$script:windowFixture.WaitForExit(5000)}
        $script:windowFixture.Dispose()
        $script:windowFixture=$null
    }
    } else { Write-Host 'Native window integration skipped: build the release first' }

    function New-FakeCandidate([int]$ProcessId=41, [long]$Created=100, [bool]$Managed=$false) {
        $process = [pscustomobject]@{HasExited=$false;Disposed=$false}
        $process | Add-Member ScriptMethod Dispose { $this.Disposed=$true }
        return [pscustomobject]@{Pid=$ProcessId;Created=$Created;Managed=$Managed;Process=$process}
    }
    function Prepare-Scenario([bool]$Automatic, [bool]$Accept, [bool]$Remember) {
        Save-RestartPreference $preference $Automatic
        $script:queue = New-Object Collections.Queue
        $script:first = New-FakeCandidate
        $script:queue.Enqueue($script:first)
        $script:queue.Enqueue((New-FakeCandidate))
        $script:queue.Enqueue($null)
        $script:choice = [pscustomobject]@{Accepted=$Accept;Remember=$Remember}
        $script:promptCount=0
        $script:closeCount=0
        $script:timeout=$false
    }
    function Get-RestartCandidate { param($Image) return $script:queue.Dequeue() }
    function Show-RestartConfirmation { $script:promptCount++; return $script:choice }
    function Wait-RestartProcessExit {
        param($Candidate,$Image)
        $script:closeCount++
        if($script:timeout){throw 'fixture graceful-close timeout'}
        $Candidate.Process.HasExited=$true
    }
    Prepare-Scenario $false $false $true
    Verify ((Invoke-RestartRecovery $image $preference) -eq 'cancelled') 'Cancel is a normal outcome'
    Verify ($script:closeCount -eq 0 -and -not (Read-RestartPreference $preference)) 'Cancel never closes or remembers'
    Verify $script:first.Process.Disposed 'Retained identity released on cancellation'
    Prepare-Scenario $false $true $false
    Verify ((Invoke-RestartRecovery $image $preference) -eq 'ready') 'One-time confirmation permits graceful replacement'
    Verify ($script:promptCount -eq 1 -and $script:closeCount -eq 1) 'One prompt and one graceful close'
    Verify (-not (Read-RestartPreference $preference)) 'One-time confirmation does not persist consent'
    Prepare-Scenario $false $true $true
    Verify ((Invoke-RestartRecovery $image $preference) -eq 'ready') 'Remembered confirmation succeeds'
    Verify (Read-RestartPreference $preference) 'Explicit remember persists after successful close'

    # Real filesystem failure: a readable file locked against replace/delete.
    # The inspected process is already gone when saving the optional consent
    # fails. This must remain an eligible launch, never a second close attempt.
    Prepare-Scenario $false $true $true
    $beforeSave = [IO.File]::ReadAllText($preference)
    $lockedPreference = [IO.File]::Open($preference, 'Open', 'Read', 'Read')
    try {
        Verify ((Invoke-RestartRecovery $image $preference) -eq 'ready-preference-warning') 'Locked preference does not strand the user after close'
        Verify ($script:first.Process.HasExited -and $script:closeCount -eq 1) 'Preference failure does not retry closing the app'
        Verify ($script:queue.Count -eq 0) 'A fresh no-process check still precedes the optional save'
        Verify ([IO.File]::ReadAllText($preference) -ceq $beforeSave) 'Failed persistence preserves prior consent bytes'
        Verify (-not (Read-RestartPreference $preference)) 'Persistence failure does not infer automatic consent'
        Verify (@(Get-ChildItem -LiteralPath $parent -Force).Count -eq 1) 'Failed save cleans its temporary file'
    } finally { $lockedPreference.Dispose() }
    Prepare-Scenario $false $true $false
    $lockedPreference = [IO.File]::Open($preference, 'Open', 'Read', 'Read')
    try {
        Verify ((Invoke-RestartRecovery $image $preference) -eq 'ready') 'One-time restart never needs to persist consent'
    } finally { $lockedPreference.Dispose() }
    Prepare-Scenario $false $false $true
    $lockedPreference = [IO.File]::Open($preference, 'Open', 'Read', 'Read')
    try {
        Verify ((Invoke-RestartRecovery $image $preference) -eq 'cancelled') 'Cancel is unaffected by unwritable consent'
        Verify ($script:closeCount -eq 0) 'Cancel never closes an app when persistence is unavailable'
    } finally { $lockedPreference.Dispose() }

    Prepare-Scenario $false $true $true
    $lockedPreference = [IO.File]::Open($preference, 'Open', 'ReadWrite', 'None')
    try {
        Reject { Invoke-RestartRecovery $image $preference } 'Unreadable consent must still fail before close'
        Verify ($script:closeCount -eq 0 -and $script:promptCount -eq 0) 'Read failures never become a save-warning launch'
        Verify $script:first.Process.Disposed 'Read-failure path releases the retained identity'
    } finally { $lockedPreference.Dispose() }
    Prepare-Scenario $false $true $true
    [IO.File]::WriteAllText($preference, '{"schema":2,"autoRestart":true}')
    Reject { Invoke-RestartRecovery $image $preference } 'Malformed consent is not treated as an optional save failure'
    Verify ($script:closeCount -eq 0 -and $script:promptCount -eq 0) 'Malformed consent never closes or implicitly grants permission'

    # An error can also report an uncertain commit. Do not promise "not saved"
    # or undo consent the user explicitly gave. The next run re-reads the file.
    Prepare-Scenario $false $true $true
    $script:realPreferenceSave = ${function:Save-RestartPreference}
    $script:saveAttempts = 0
    function Save-RestartPreference {
        param([string]$Path, [bool]$Enabled)
        $script:saveAttempts++
        & $script:realPreferenceSave $Path $Enabled
        throw 'fixture reports an error after committing the explicit choice'
    }
    try {
        Verify ((Invoke-RestartRecovery $image $preference) -eq 'ready-preference-warning') 'Uncertain persistence still permits this launch'
        Verify ($script:saveAttempts -eq 1 -and $script:closeCount -eq 1) 'No write or close retries after a persistence warning'
        Verify (Read-RestartPreference $preference) 'Explicit consent is re-read rather than guessed from an IO error'
    } finally { Set-Item -Path Function:Save-RestartPreference -Value $script:realPreferenceSave }
    Prepare-Scenario $true $false $false
    Verify ((Invoke-RestartRecovery $image $preference) -eq 'ready') 'Stored consent permits automatic recovery'
    Verify ($script:promptCount -eq 0 -and $script:closeCount -eq 1) 'Stored consent needs no repeat confirmation'
    Prepare-Scenario $false $true $true
    $script:timeout=$true
    Reject { Invoke-RestartRecovery $image $preference } 'Timeout must prevent relaunch'
    Verify (-not (Read-RestartPreference $preference)) 'Failed close does not save new automatic consent'
    Prepare-Scenario $false $true $true
    [void]$script:queue.Dequeue()
    $script:queue.Clear()
    $script:queue.Enqueue($script:first)
    $script:queue.Enqueue((New-FakeCandidate 42))
    Reject { Invoke-RestartRecovery $image $preference } 'Do not close a replacement process after confirmation'
    Verify ($script:closeCount -eq 0) 'Changed identity never receives a close request'
    Prepare-Scenario $true $true $true
    $script:queue.Clear()
    $script:queue.Enqueue((New-FakeCandidate 41 100 $true))
    Verify ((Invoke-RestartRecovery $image $preference) -eq 'managed') 'Existing managed session is left alone'
    Verify ($script:promptCount -eq 0 -and $script:closeCount -eq 0) 'Managed session never prompts or closes'
    Prepare-Scenario $false $true $true
    $script:queue.Clear()
    $script:queue.Enqueue($script:first)
    $script:queue.Enqueue((New-FakeCandidate))
    $script:queue.Enqueue((New-FakeCandidate 42))
    Reject { Invoke-RestartRecovery $image $preference } 'New process during exit prevents relaunch'
    Verify (-not (Read-RestartPreference $preference)) 'No remembered consent on raced restart'
    $env:CLE_RESTART_MODE='reset'
    $env:CLE_RESTART_PREFERENCE=$preference
    Save-RestartPreference $preference $true
    $lockedPreference = [IO.File]::Open($preference, 'Open', 'Read', 'Read')
    try {
        Reject { Start-RestartRecovery } 'Revoking consent must still fail if persistence fails'
        Verify (Read-RestartPreference $preference) 'A failed revoke never claims the old permission was cleared'
    } finally { $lockedPreference.Dispose() }
    Verify ((Start-RestartRecovery) -eq 'reset') 'Actual reset entry point succeeds'
    Verify (-not (Read-RestartPreference $preference)) 'Reset revokes stored automatic authorization'
    # Exercise the exact bootstrap used by the Rust launcher, with a Unicode
    # payload longer than Windows would allow as a full encoded command.
    $nativeSource=[IO.File]::ReadAllText((Join-Path $root 'crates\launcher\src\startup_conflict.rs'))
    $readerMatch=[regex]::Match($nativeSource,'const SCRIPT_READER: &str = r#"([^"]*)"#;')
    Verify $readerMatch.Success 'Native bootstrap is available'
    $bootstrap=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($readerMatch.Groups[1].Value))
    Verify ($bootstrap.Length -lt 1024) 'Bootstrap is safely below the command-line limit'
    $transport=New-Object Diagnostics.ProcessStartInfo
    $transport.FileName=$image
    $transport.Arguments='-NoLogo -NoProfile -NonInteractive -STA -EncodedCommand '+$bootstrap
    $transport.UseShellExecute=$false
    $transport.CreateNoWindow=$true
    $transport.RedirectStandardInput=$true
    $transport.RedirectStandardOutput=$true
    $transport.RedirectStandardError=$true
    # .NET Framework creates redirected stdin using Console.InputEncoding.
    # Match the raw UTF-8/no-BOM production writer even on UTF-8 CI consoles.
    $transport.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $transport.EnvironmentVariables['CLE_RESTART_MODE']='reset'
    $transport.EnvironmentVariables['CLE_RESTART_PREFERENCE']=$preference
    $priorInputEncoding=[Console]::InputEncoding
    try {
        [Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
        $worker=[Diagnostics.Process]::Start($transport)
    } finally { [Console]::InputEncoding=$priorInputEncoding }
    try {
        $unicode=[string][char]0x4e2d+[char]0x6587
        # Simulate module-import progress before the source itself runs. The
        # encoded bootstrap must suppress it, rather than leak CLIXML to stderr.
        $payload="Write-Progress -Activity 'Recovery transport fixture' -Status 'Module import' -PercentComplete 10;`n"+[IO.File]::ReadAllText($source)+"`n#"+('x'*20000)+"`n[Console]::Write('|"+$unicode+"')"
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes($payload)
        $worker.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)
        $worker.StandardInput.Close()
        $reply=$worker.StandardOutput.ReadToEnd()
        $errors=$worker.StandardError.ReadToEnd()
        Verify ($worker.WaitForExit(10000)) 'Bootstrap worker exits'
        Verify ($worker.ExitCode -eq 0) ('Bootstrap worker succeeds: '+$errors)
        Verify (-not $errors.Contains('CLIXML')) ('Progress cannot contaminate native diagnostics with CLIXML; synthetic worker stderr: '+$errors)
        Verify ($reply -ceq ('reset|'+[char]0x4e2d+[char]0x6587)) 'Unicode and long script transport roundtrip'
    } finally {
        if(-not $worker.HasExited){$worker.Kill();[void]$worker.WaitForExit(5000)}
        $worker.Dispose()
    }
    $mutex=[Threading.Mutex]::new($false,('Local\CodeCodexStartupRecovery-'+[Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
    $locked=$false
    try {
        $locked=$mutex.WaitOne(0)
        Verify $locked 'Concurrent reset fixture holds the recovery lock'
        Save-RestartPreference $preference $true
        $worker=[Diagnostics.Process]::Start($transport)
        try {
            $bytes=[Text.UTF8Encoding]::new($false).GetBytes([IO.File]::ReadAllText($source))
            $worker.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)
            $worker.StandardInput.Close()
            $reply=$worker.StandardOutput.ReadToEnd()
            $errors=$worker.StandardError.ReadToEnd()
            Verify ($worker.WaitForExit(10000) -and $worker.ExitCode -eq 1) 'Busy reset reports failure, not false success'
            Verify ($errors.Contains('permission was not cleared') -and $reply.Length -eq 0) 'Busy reset preserves the original failure reason'
            Verify (Read-RestartPreference $preference) 'Busy reset leaves consent unchanged'
        } finally {
            if(-not $worker.HasExited){$worker.Kill();[void]$worker.WaitForExit(5000)}
            $worker.Dispose()
        }
    } finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
    "Startup conflict: $checks checks passed (real fixture close and mocked policy; no Codex process closed)"
} finally {
    if ([IO.Path]::GetDirectoryName($fixture) -ne [IO.Path]::GetTempPath().TrimEnd('\') -or
        [IO.Path]::GetFileName($fixture) -notmatch '^CodeCodex-StartupConflict-[a-f0-9]{32}$') { throw 'Unsafe fixture cleanup path' }
    [IO.Directory]::Delete($fixture, $true)
}
