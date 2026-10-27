function Read-CodeCodexStartupText([string]$Path) {
    # Let the controller atomically replace a snapshot while the UI reads it.
    $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader=[IO.StreamReader]::new($stream,[Text.Encoding]::UTF8,$true)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function New-CodeCodexStartupDialog {
param([switch]$ConsentOnly)
$script:consentOnly=$ConsentOnly
$ErrorActionPreference = 'Stop'
$script:guidanceTranslations=@{} # CODE_CODEX_GUIDANCE_TRANSLATIONS
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:form = New-Object System.Windows.Forms.Form
$script:form.Text = $env:CLE_ERROR_TITLE
$script:form.ClientSize = New-Object System.Drawing.Size(620, 480)
$script:form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$script:form.MaximizeBox = $false
$script:form.MinimizeBox = $false
$script:form.ShowInTaskbar = $true
$script:form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$script:form.TopMost = $true
$script:form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$script:form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$script:form.Icon = [System.Drawing.SystemIcons]::Error

$script:icon = New-Object System.Windows.Forms.PictureBox
$script:icon.Location = New-Object System.Drawing.Point(22, 22)
$script:icon.Size = New-Object System.Drawing.Size(32, 32)
$script:icon.Image = [System.Drawing.SystemIcons]::Error.ToBitmap()
$script:icon.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::StretchImage
$script:form.Controls.Add($script:icon)

$script:summary = New-Object System.Windows.Forms.Label
$script:summary.Location = New-Object System.Drawing.Point(70, 18)
$script:summary.Size = New-Object System.Drawing.Size(525, 44)
$script:summary.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 13)
$script:summary.Text = $env:CLE_ERROR_SUMMARY
$script:form.Controls.Add($script:summary)

$script:metadata = New-Object System.Windows.Forms.Label
$script:metadata.Location = New-Object System.Drawing.Point(22, 72)
$script:metadata.Size = New-Object System.Drawing.Size(573, 24)
$script:metadata.ForeColor = [System.Drawing.Color]::DimGray
$script:metadata.Text = ('{0}: {1}    {2}: {3}' -f $env:CLE_ERROR_STAGE_LABEL, $env:CLE_ERROR_STAGE, $env:CLE_ERROR_CODE_LABEL, $env:CLE_ERROR_CODE)
$script:form.Controls.Add($script:metadata)

$script:reasonTitle = New-Object System.Windows.Forms.Label
$script:reasonTitle.Location = New-Object System.Drawing.Point(22, 108)
$script:reasonTitle.Size = New-Object System.Drawing.Size(573, 20)
$script:reasonTitle.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9)
$script:reasonTitle.Text = 'Specific reason'
$script:form.Controls.Add($script:reasonTitle)

$script:reason = New-Object System.Windows.Forms.TextBox
$script:reason.Location = New-Object System.Drawing.Point(22, 132)
$script:reason.Size = New-Object System.Drawing.Size(573, 115)
$script:reason.Multiline = $true
$script:reason.ReadOnly = $true
$script:reason.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$script:reason.BackColor = [System.Drawing.SystemColors]::Window
$script:reason.Text = $env:CLE_ERROR_REASON -replace "(?<!`r)`n", "`r`n"
$script:form.Controls.Add($script:reason)

$script:actionTitle = New-Object System.Windows.Forms.Label
$script:actionTitle.Location = New-Object System.Drawing.Point(22, 254)
$script:actionTitle.Size = New-Object System.Drawing.Size(573, 20)
$script:actionTitle.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9)
$script:actionTitle.Text = 'Suggested action'
$script:form.Controls.Add($script:actionTitle)

$script:action = New-Object System.Windows.Forms.Label
$script:action.Location = New-Object System.Drawing.Point(22, 278)
$script:action.Size = New-Object System.Drawing.Size(573, 52)
$script:action.Text = $env:CLE_ERROR_GUIDANCE
$script:form.Controls.Add($script:action)

$script:report = New-Object System.Windows.Forms.Label
$script:report.Location = New-Object System.Drawing.Point(22, 390)
$script:report.Size = New-Object System.Drawing.Size(573, 36)
$script:report.ForeColor = [System.Drawing.Color]::DimGray
$script:report.AutoEllipsis = $true
$script:report.Text = if ([string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT)) {
    'The diagnostic report could not be saved.'
} else {
    $env:CLE_ERROR_REPORT_LABEL + ': ' + $env:CLE_ERROR_REPORT
}
$script:form.Controls.Add($script:report)

$script:copy = New-Object System.Windows.Forms.Button
$script:copy.Location = New-Object System.Drawing.Point(22, 434)
$script:copy.Size = New-Object System.Drawing.Size(118, 34)
$script:copy.Text = 'Copy details'
$script:copy.Add_Click({
    $details = $script:copyDetails
    try {
        if (-not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_LIVE_STATE) -and [IO.File]::Exists($env:CLE_ERROR_LIVE_STATE)) {
            $current = ConvertFrom-Json -InputObject (Read-CodeCodexStartupText $env:CLE_ERROR_LIVE_STATE)
            $details = $current.details
        } elseif (-not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT) -and
        [IO.File]::Exists($env:CLE_ERROR_REPORT)) {
            $details = Read-CodeCodexStartupText $env:CLE_ERROR_REPORT
        }
    } catch {}
    [System.Windows.Forms.Clipboard]::SetText($details)
})
$script:form.Controls.Add($script:copy)

$script:open = New-Object System.Windows.Forms.Button
$script:open.Location = New-Object System.Drawing.Point(150, 434)
$script:open.Size = New-Object System.Drawing.Size(118, 34)
$script:open.Text = 'Open report'
$script:open.Enabled = -not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT)
$script:open.Add_Click({
    if (-not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_REPORT)) {
        $explorer = Join-Path $env:SystemRoot 'explorer.exe'
        & $explorer ('/select,"{0}"' -f $env:CLE_ERROR_REPORT)
    }
})
$script:form.Controls.Add($script:open)

$script:close = New-Object System.Windows.Forms.Button
$script:close.Location = New-Object System.Drawing.Point(477, 434)
$script:close.Size = New-Object System.Drawing.Size(118, 34)
$script:close.Text = 'Close'
$script:close.DialogResult = [System.Windows.Forms.DialogResult]::OK
$script:close.Add_Click({ $script:form.Close() })
$script:form.Controls.Add($script:close)
$script:form.AcceptButton = $script:close
$script:form.CancelButton = $script:close

$script:remember = New-Object System.Windows.Forms.CheckBox
$script:remember.Location = New-Object System.Drawing.Point(22, 336)
$script:remember.Size = New-Object System.Drawing.Size(573, 42)
$script:remember.Text = 'Automatically close and reopen Codex next time (do not ask again)'
$script:remember.Checked = $false
$script:remember.Visible = $false
$script:form.Controls.Add($script:remember)
$script:restart = New-Object System.Windows.Forms.Button
$script:restart.Location = New-Object System.Drawing.Point(279, 434)
$script:restart.Size = New-Object System.Drawing.Size(190, 34)
$script:restart.Text = 'Close and restart'
$script:restart.Visible = $false
$script:restart.Enabled = $false
$script:form.Controls.Add($script:restart)
$script:recoveryBusy = $false
$script:recoveryRequestId = ''
$script:recoveryDecisionSent = $false
$script:recoveryReadFailed = $false
$script:recoveryReadAttempts = 0
$script:dialogHostRunning = $false
if (-not $script:consentOnly -and $env:CLE_RECOVERY_UI_DIRECTORY -and [IO.File]::Exists((Join-Path $env:CLE_RECOVERY_UI_DIRECTORY 'recovery.json'))) {
    $script:form.Opacity=0
}
function script:Show-CodeCodexStartupFailure {
    $script:recoveryBusy=$false
    $script:close.Text = 'Close'
    $script:close.Enabled=$true
    $script:restart.Enabled=$false
    $script:form.Opacity=1
    if (($script:dialogHostRunning -or $script:form.IsHandleCreated) -and -not $script:form.Visible) { $script:form.Show(); $script:form.Activate() }
}

function script:Send-CodeCodexRecoveryDecision([string]$Action, [bool]$Remember) {
    if ($script:consentOnly) { return }
    if ($script:recoveryDecisionSent -or [string]::IsNullOrWhiteSpace($script:recoveryRequestId)) { return }
    $directory = $env:CLE_RECOVERY_UI_DIRECTORY
    if ([string]::IsNullOrWhiteSpace($directory) -or -not [IO.Directory]::Exists($directory)) { throw 'Startup recovery channel is unavailable' }
    $info = Get-Item -LiteralPath $directory -Force
    if (($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Redirected startup recovery channel refused' }
    $value = @{schema=1;requestId=$script:recoveryRequestId;action=$Action;remember=$Remember} | ConvertTo-Json -Compress
    $temporary = Join-Path $directory ([Guid]::NewGuid().ToString('N')+'.tmp')
    try {
        [IO.File]::WriteAllText($temporary,$value,[Text.UTF8Encoding]::new($false))
        [IO.File]::Move($temporary,(Join-Path $directory 'action.json'))
        $script:recoveryDecisionSent = $true
    } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}
$script:restart.Add_Click({
    if ($script:consentOnly) { $script:form.DialogResult=[System.Windows.Forms.DialogResult]::OK; $script:form.Close(); return }
    try {
        Send-CodeCodexRecoveryDecision 'restart' $script:remember.Checked
        $script:restart.Enabled=$false; $script:remember.Enabled=$false; $script:recoveryBusy=$true; $script:close.Enabled=$false
        $script:form.Hide()
    } catch {
        $script:reason.Text='CC-START-RECOVERY-UI-001: The recovery decision could not be delivered. No new close request was authorized. '+$_.Exception.Message
        $script:recoveryBusy=$false; $script:close.Enabled=$true
    }
})
$script:form.Add_FormClosing({
    param($sender,$event)
    if ($script:recoveryBusy) { $event.Cancel=$true; return }
    if (-not $script:consentOnly -and -not $script:recoveryDecisionSent -and $script:recoveryRequestId) {
        try { Send-CodeCodexRecoveryDecision 'cancel' $false } catch { $script:reason.Text=$_.Exception.Message }
    }
})
if ($script:consentOnly) {
    $script:restart.Visible=$true; $script:restart.Enabled=$true; $script:remember.Visible=$true
    $script:close.Text = 'Cancel'; $script:close.DialogResult=[System.Windows.Forms.DialogResult]::Cancel
}

function script:Set-CodeCodexSuggestedAction([string]$Guidance) {
    # Only this ordinary UI field is translated. The diagnostic/report retains
    # its original English guidance and technical reason for troubleshooting.
    if ($script:guidanceTranslations.ContainsKey($Guidance)) {
        $script:action.Text=$script:guidanceTranslations[$Guidance]
    } else { $script:action.Text=$Guidance }
}
Set-CodeCodexSuggestedAction $env:CLE_ERROR_GUIDANCE

$script:timer = New-Object System.Windows.Forms.Timer
$script:timer.Interval = 150
$script:lastLive = ''
$script:copyDetails = $env:CLE_ERROR_DETAILS
function script:Update-CodeCodexStartupDialog {
    try {
        if ($script:recoveryReadFailed) { return }
        if (-not $script:consentOnly -and -not [string]::IsNullOrWhiteSpace($env:CLE_RECOVERY_UI_DIRECTORY)) {
            $recoveryFile=Join-Path $env:CLE_RECOVERY_UI_DIRECTORY 'recovery.json'
            if ([IO.File]::Exists($recoveryFile)) {
                if ((Get-Item -LiteralPath $recoveryFile -Force).Length -gt 65536) { throw 'Startup recovery state exceeds the size limit' }
                $recovery=ConvertFrom-Json -InputObject (Read-CodeCodexStartupText $recoveryFile)
                if ($recovery.schema -ne 1 -or [string]::IsNullOrWhiteSpace($recovery.requestId) -or
                    $recovery.phase -notin @('checking','awaiting-consent','closing','verifying-exit','old-exited','relaunching','verifying','ready','failed','cancelled')) { throw 'Invalid startup recovery state schema' }
                if ($recovery.schema -eq 1) {
                    # Read-only presentation: only the core owns readiness/failure.
                    # A slow but live launch must not be failed by a second UI clock.
                    $script:recoveryRequestId=$recovery.requestId
                    $phase=$recovery.phase
                    $allowed=$phase -ceq 'awaiting-consent'
                    $script:recoveryBusy=$phase -in @('checking','closing','verifying-exit','old-exited','relaunching','verifying')
                    $script:recoveryBusy=$script:recoveryBusy -or ($allowed -and $script:recoveryDecisionSent)
                    $script:close.Enabled=-not $script:recoveryBusy
                    $script:restart.Visible=$allowed -or $script:recoveryDecisionSent
                    $script:restart.Enabled=$allowed -and -not $script:recoveryDecisionSent
                    $script:remember.Visible=$allowed; $script:remember.Enabled=$allowed
                    $script:summary.Text=$recovery.diagnostic.summary
                    $script:metadata.Text=('Stage: {0}    Support code: {1}' -f $recovery.diagnostic.stage,$recovery.diagnostic.code)
                    $currentReason=($recovery.diagnostic.reason -split '(?m)\r?\n\r?\nStartup trace:',2)[0]
                    $displayReason='Original conflict: '+$recovery.original.code+"`r`n"+$recovery.original.reason
                    if($currentReason -cne $recovery.original.reason){$displayReason += "`r`n`r`n"+$currentReason}
                    if($script:reason.Text -cne $displayReason){$script:reason.Text=$displayReason}
                    Set-CodeCodexSuggestedAction $recovery.diagnostic.guidance
                    $script:copyDetails='Original conflict: '+$recovery.original.code+"`r`n"+$recovery.original.reason+"`r`n`r`n"+$recovery.diagnostic.reason+"`r`n`r`nRecovery timeline:`r`n"+($recovery.history -join "`r`n")
                    if ($allowed -and -not $script:recoveryDecisionSent) {
                        $script:form.Opacity=1
                        if (($script:dialogHostRunning -or $script:form.IsHandleCreated) -and -not $script:form.Visible) { $script:form.Show() }
                    } elseif ($phase -in @('checking','closing','verifying-exit','old-exited','relaunching','verifying') -or ($allowed -and $script:recoveryDecisionSent)) {
                        $script:form.Hide(); $script:form.Opacity=0
                    }
                    if ($allowed) { $script:close.Text = 'Cancel' }
                    if ($phase -eq 'failed') { $script:close.Text = 'Close'; Show-CodeCodexStartupFailure }
                    if ($phase -in @('ready','cancelled')) { $script:recoveryBusy=$false; $script:recoveryDecisionSent=$true; $script:form.Close(); return }
                }
            } elseif ($script:recoveryRequestId) { throw 'Startup recovery state disappeared before a verified result' }
        }
        if (-not $script:consentOnly -and -not [string]::IsNullOrWhiteSpace($env:CLE_ERROR_LIVE_STATE) -and [IO.File]::Exists($env:CLE_ERROR_LIVE_STATE)) {
            $raw = Read-CodeCodexStartupText $env:CLE_ERROR_LIVE_STATE
            if ($raw -ne $script:lastLive) {
                $state = ConvertFrom-Json -InputObject $raw
                $script:copyDetails = $state.details
                if ([string]::IsNullOrWhiteSpace($script:recoveryRequestId)) {
                    $script:reason.Text = $state.reason -replace "(?<!`r)`n", "`r`n"
                    Set-CodeCodexSuggestedAction $state.guidance
                }
                $script:lastLive = $raw
            }
        }
        if ($script:recoveryBusy -and $env:CLE_ERROR_OWNER_PID) {
            if (-not (Get-Process -Id ([int]$env:CLE_ERROR_OWNER_PID) -ErrorAction SilentlyContinue)) {
                $script:recoveryReadFailed=$true
                $script:reason.Text += "`r`nCC-START-RECOVERY-CONTROLLER-001: Startup controller exited without a verified result. No further close or retry will be requested."
                Show-CodeCodexStartupFailure
            }
        }
        $script:recoveryReadAttempts=0
    } catch {
        $exception=$_.Exception
        while ($exception.InnerException) { $exception=$exception.InnerException }
        if ($exception -is [IO.IOException] -and ($exception.HResult -band 65535) -in @(2,3,32,33) -and $script:recoveryReadAttempts -lt 3) {
            $script:recoveryReadAttempts++; return
        }
        $script:recoveryReadFailed=$true
        $script:reason.Text += "`r`nCC-START-RECOVERY-UI-002: Startup state could not be read. "+$_.Exception.Message
        Show-CodeCodexStartupFailure
    }
}

$script:timer.Add_Tick({ Update-CodeCodexStartupDialog })
$script:form.Add_FormClosed({ $script:timer.Stop() })
$script:form.ActiveControl=$script:close
Update-CodeCodexStartupDialog
$script:timer.Start()
return [pscustomobject]@{Form=$script:form;Timer=$script:timer;Remember=$script:remember;Restart=$script:restart;Cancel=$script:close;Reason=$script:reason;Summary=$script:summary}

}

function Start-CodeCodexStartupDialog {
    $dialog=New-CodeCodexStartupDialog
    try {
        if ($dialog.Form.IsDisposed) { return }
        $context=[System.Windows.Forms.ApplicationContext]::new($dialog.Form)
        try {
            $script:dialogHostRunning=$true
            # Application.Run(Form) unconditionally shows a hidden checking
            # window. A context lets state control every visible transition.
            if ($dialog.Form.Opacity -gt 0) { $dialog.Form.Show() }
            [System.Windows.Forms.Application]::Run($context)
        } finally { $script:dialogHostRunning=$false; $context.Dispose() }
    } finally { $dialog.Timer.Dispose(); $dialog.Form.Dispose() }
}
