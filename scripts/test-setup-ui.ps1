[CmdletBinding()]
param([string]$OutputRoot, [ValidateSet('en','zh-CN')][string]$Language='en', [switch]$Uninstall, [string[]]$OnlyCases)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$fixtureVersion = (Get-Content (Join-Path $repo 'packages\explorer-ui\package.json') -Raw | ConvertFrom-Json).version
if (-not $OutputRoot) { $OutputRoot = Join-Path $repo ('artifacts\setup-ui-'+[Guid]::NewGuid().ToString('N')) }
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$source = Get-Content (Join-Path $repo 'crates\launcher\src\gui_support.rs') -Raw -Encoding UTF8
$match = [regex]::Match($source, '(?s)const PROGRESS_DIALOG_SCRIPT: &str = r#"(.*?)"#;')
if (-not $match.Success) { throw 'Production progress script not found' }
$contract = Get-Content (Join-Path $repo 'installer\Storage-Layout.ps1') -Raw
# Only the installation locator is isolated; all root validation and form events are production code.
$contract += "`nfunction Get-CodeCodexRegisteredRoot { return `$env:TEST_SETUP_ROOT }`n"
$checks = @'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class FixtureCapture {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out RECT rect);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] static extern IntPtr SendMessageW(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
 public static void SimulateDpiMessage(IntPtr handle, int dpi) {
    RECT rect; GetWindowRect(handle, out rect);
    IntPtr memory = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(RECT)));
    try { Marshal.StructureToPtr(rect, memory, false); SendMessageW(handle, 0x02E0, new IntPtr(dpi | (dpi << 16)), memory); }
    finally { Marshal.FreeHGlobal(memory); }
 }
}
"@
$script:testStep = 0
$script:testWaitTicks = 0
Write-UiMarker $env:CLE_PROGRESS_HEARTBEAT_PATH 'first'
Write-UiMarker $env:CLE_PROGRESS_HEARTBEAT_PATH 'second'
if ([IO.File]::ReadAllText($env:CLE_PROGRESS_HEARTBEAT_PATH) -ne 'second') { throw 'Marker replacement failed' }
$script:testTimer = New-Object System.Windows.Forms.Timer
$script:testTimer.Interval = 250
function Assert-Test($ok, $message) { if (-not $ok) { throw $message } }
$script:languageVisibilityViolations = [System.Collections.Generic.List[string]]::new()
if ($script:setupWizard) {
    $observeLanguage = {
        foreach ($field in @($languageLabel,$languageChoice)) {
            # Logical bounds avoid comparing controls midway through independent
            # physical DPI rescaling; a header position is never legitimate.
            if ($field.Visible -and ($script:setupPage -ne 'welcome' -or $script:uiBounds[$field][1] -lt 136)) {
                $script:languageVisibilityViolations.Add(('page='+$script:setupPage+' top='+$field.Top))
            }
        }
    }
    $languageLabel.Add_VisibleChanged($observeLanguage)
    $languageLabel.Add_LocationChanged($observeLanguage)
    $languageChoice.Add_VisibleChanged($observeLanguage)
    $languageChoice.Add_LocationChanged($observeLanguage)
}
function Assert-LanguageVisibility {
    if (-not $script:setupWizard) { return }
    $welcome = $script:setupPage -eq 'welcome'
    Assert-Test ($languageLabel.Visible -eq $welcome -and $languageChoice.Visible -eq $welcome -and $languageChoice.TabStop -eq $welcome) 'Language field must only be visible and tabbable on Welcome'
    Assert-Test ($script:languageVisibilityViolations.Count -eq 0) ('Transient language field in header or another page: '+($script:languageVisibilityViolations -join '; '))
}
function Assert-TextFits {
    foreach ($label in @($status,$detail,$brandName,$brandTagline,$pathHint)) {
        if (-not $label.Visible) { continue }
        $measured = [System.Windows.Forms.TextRenderer]::MeasureText($label.Text, $label.Font, [System.Drawing.Size]::new($label.Width,10000), ([System.Windows.Forms.TextFormatFlags]::WordBreak -bor [System.Windows.Forms.TextFormatFlags]::NoPadding))
        Assert-Test ($measured.Height -le $label.Height) ('Clipped text: '+$label.Text+' measured='+$measured.Height+' box='+$label.Height+' font='+$label.Font.Size+' dpi='+$form.LayoutDpi)
    }
}
function Save-Frame([string]$name) {
    Assert-LanguageVisibility
    $bitmap = [System.Drawing.Bitmap]::new($form.Width, $form.Height)
    try { $form.DrawToBitmap($bitmap, [System.Drawing.Rectangle]::new(0,0,$form.Width,$form.Height)); $bitmap.Save((Join-Path $env:TEST_OUTPUT ($name+'.png'))) } finally { $bitmap.Dispose() }
    # Capture the visible fixture window too, including native text and current
    # Windows scaling (DrawToBitmap alone does not prove on-screen rendering).
    $form.Refresh()
    $oldDpi = [FixtureCapture]::SetThreadDpiAwarenessContext([IntPtr](-3))
    try {
        $bounds = [FixtureCapture+RECT]::new()
        [void][FixtureCapture]::GetWindowRect($form.Handle, [ref]$bounds)
        $size = [System.Drawing.Size]::new($bounds.Right-$bounds.Left,$bounds.Bottom-$bounds.Top)
        $screen = [System.Drawing.Bitmap]::new($size.Width, $size.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($screen)
        try { $graphics.CopyFromScreen([System.Drawing.Point]::new($bounds.Left,$bounds.Top), [System.Drawing.Point]::Empty, $size); $screen.Save((Join-Path $env:TEST_OUTPUT ($name+'-screen.png'))) } finally { $graphics.Dispose(); $screen.Dispose() }
    } finally { [void][FixtureCapture]::SetThreadDpiAwarenessContext($oldDpi) }
}
$script:testTimer.Add_Tick({
    try {
        $script:testStep++
        $case = $env:TEST_CASE
        $decision = $env:CLE_SETUP_DECISION_PATH
        if ($script:testStep -eq 1) {
            $actualDpi = [CodeCodexDpiForm]::GetDpiForWindow($form.Handle)
            $awareness = [CodeCodexDpiForm]::GetAwarenessFromDpiAwarenessContext([CodeCodexDpiForm]::GetWindowDpiAwarenessContext($form.Handle))
            Assert-Test ($awareness -eq 2 -and $actualDpi -eq $form.LayoutDpi) 'Window is not natively per-monitor DPI aware'
            @{dpi=$actualDpi;awareness=$awareness;clientWidth=$form.ClientSize.Width;clientHeight=$form.ClientSize.Height} | ConvertTo-Json | Set-Content (Join-Path $env:TEST_OUTPUT 'dpi.json')
            if ($case.StartsWith('uninstall-')) {
                Assert-Test ($script:setupPage -eq 'uninstall-confirm' -and $script:setupPending -and $removeSettings.Visible -and -not $languageChoice.Visible -and -not $licenseBox.Visible -and -not $pathPanel.Visible -and -not $back.Visible) 'Uninstall confirmation template is wrong'
                Assert-Test ($removeSettings.Checked -eq ($case -eq 'uninstall-purge') -and -not (Test-Path -LiteralPath $decision)) 'Uninstall options or preconfirmation writes are wrong'
                foreach ($dpi in @(96,120,144,192)) {
                    [FixtureCapture]::SimulateDpiMessage($form.Handle,$dpi)
                    Assert-TextFits
                    Assert-Test ($form.ClientSize.Width -eq [int](720*$dpi/96.0) -and [Math]::Abs($form.Height-$form.Width*0.6) -le 1 -and $removeSettings.Bottom -le $actions.Top) 'Uninstall DPI geometry overlaps'
                }
                [FixtureCapture]::SimulateDpiMessage($form.Handle,$actualDpi)
                Save-Frame 'uninstall-confirm'
                if ($case -eq 'uninstall-cancel') { $cancel.PerformClick(); return }
                if ($case -eq 'uninstall-close') { $form.Close(); return }
                if ($case -eq 'uninstall-response-failure') {
                    New-Item -ItemType Directory -Path ($decision+'.tmp') | Out-Null
                    $install.PerformClick()
                    Assert-Test ($script:setupPending -and $script:setupPage -eq 'uninstall-confirm' -and -not (Test-Path -LiteralPath $decision)) 'Failed confirmation started removal'
                    Save-Frame 'uninstall-response-failure'; $cancel.PerformClick(); return
                }
                $install.PerformClick()
                $selection = Get-Content -LiteralPath $decision -Raw | ConvertFrom-Json
                Assert-Test ($selection.purgeSettings -eq ($case -eq 'uninstall-purge') -and -not $script:setupPending -and $bar.Visible -and -not $removeSettings.Visible -and -not $actions.Visible) 'Uninstall did not commit options and switch to progress'
                Save-Frame 'uninstall-progress'
                $message = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("Removing application files`nDeleting the installed Code-Codex versions and support files."))
                [IO.File]::WriteAllText($env:CLE_PROGRESS_STATE_PATH, ('2|progress|65|'+$message))
                return
            }
            if ($case -eq 'custom') {
                $matrix = @()
                foreach ($dpi in @(96,120,144,192)) {
                    # Synthetic WM_DPICHANGED exercises the production relayout and
                    # font code, not a claim of moving between real monitors.
                    [FixtureCapture]::SimulateDpiMessage($form.Handle,$dpi)
                    Assert-Test ($form.LayoutDpi -eq $dpi -and $form.ClientSize.Width -eq [int](720*$dpi/96.0) -and [Math]::Abs($form.Height-$form.Width*0.6) -le 1) 'DPI change double-scaled geometry'
                    Assert-Test ($form.Font.Size -eq [single](9*$dpi/72.0)) 'Body font did not follow DPI'
                    foreach ($page in @('welcome','license','folder','finish')) {
                        Show-SetupPage $page
                        if ($page -eq 'folder') { $custom.Checked = $true }
                        Assert-TextFits
                        if ($page -eq 'welcome') {
                            Assert-Test ($stepCaption.Text -eq '') 'Welcome repeats the stage caption'
                            Assert-Test ($languageLabel.Left -eq $detail.Left -and $languageChoice.Left -eq $detail.Left -and $detail.Bottom -lt $languageLabel.Top -and $languageLabel.Bottom -lt $languageChoice.Top -and $languageChoice.Bottom -lt $actions.Top) 'Welcome language field is not aligned below the introduction'
                        }
                        Assert-Test ($brandPanel.Right -le $status.Left -and $pathPanel.Bottom -le $actions.Top -and $install.Right -le $actions.Width) 'DPI geometry overlaps'
                        Save-Frame ($page+'-synthetic-'+$dpi)
                    }
                    $matrix += @{dpi=$dpi;passed=$true;kind='synthetic WM_DPICHANGED geometry and text metrics'}
                }
                [FixtureCapture]::SimulateDpiMessage($form.Handle,$actualDpi)
                $custom.Checked = $false
                $script:allowClose = $false
                Show-SetupPage 'welcome'
                $matrix | ConvertTo-Json | Set-Content (Join-Path $env:TEST_OUTPUT 'dpi-matrix.json')
            }
            Assert-Test ([IO.File]::ReadAllText($env:CLE_PROGRESS_READY_PATH) -eq 'ready') 'Shown readiness absent'
            if ($case -eq 'automatic-progress') {
                Assert-Test ($bar.Visible -and $form.ClientSize.Width -eq [int](460*$form.LayoutDpi/96.0) -and -not $script:setupPending) 'Automatic progress UI changed'
                [IO.File]::WriteAllText($env:CLE_PROGRESS_STATE_PATH, '1|close|0|')
            } elseif ($case -in @('automatic-update','automatic-update-report')) {
                Assert-Test ($script:setupPage -eq 'installing' -and $bar.Visible -and -not $script:setupPending -and -not $actions.Visible -and -not $form.ControlBox) 'Updater did not start directly on Installing'
                Assert-Test ([Math]::Abs($form.Height-$form.Width*0.6) -le 1) 'Updater outer ratio wrong'
                Save-Frame 'update-start'
            } else {
                Assert-Test ($form.ClientSize.Width -eq [int](720*$form.LayoutDpi/96.0) -and [Math]::Abs($form.Height-$form.Width*0.6) -le 1 -and $install.Text -eq (ConvertTo-CodeCodexUiText 'Next') -and $script:setupPage -eq 'welcome' -and -not $bar.Visible) 'First screen is not Welcome'
                Assert-Test ($form.AcceptButton -eq $install -and $form.CancelButton -eq $cancel) 'Keyboard actions missing'
                @{visible=$languageChoice.Visible;locale=$script:CodeCodexUiLocale;expected=$env:CLE_UI_LANGUAGE;firstItem=$languageChoice.Items[0];selected=$languageChoice.SelectedItem} | ConvertTo-Json | Set-Content (Join-Path $env:TEST_OUTPUT 'language-choice.json') -Encoding UTF8
                Assert-Test ($languageChoice.Visible -and $script:CodeCodexUiLocale -eq $env:CLE_UI_LANGUAGE -and $languageChoice.Items[0] -eq '中文（简体）') 'Language selector missing or incorrect'
                Assert-Test ($brandIcon.Image -ne $null) 'Brand icon missing'
                Assert-Test ($brandPanel.BackgroundImage -ne $null -and $brandIcon.Parent -eq $brandPanel -and $brandPanel.Right -le $status.Left) 'Brand image layout invalid'
                Save-Frame 'welcome'
                $observedTitle=@{heading=$status.Text;window=$form.Text;locale=$script:CodeCodexUiLocale}
                $observedTitle | ConvertTo-Json | Set-Content (Join-Path $env:TEST_OUTPUT 'welcome-title.json') -Encoding UTF8
                $expectedHeading=if($script:CodeCodexUiLocale -eq 'zh-CN'){"欢迎使用`nCode-Codex 安装"}else{"Welcome to`nCode-Codex Setup"}
                $expectedWindow=if($script:CodeCodexUiLocale -eq 'zh-CN'){'Code-Codex 安装'}else{'Code-Codex Setup'}
                Assert-Test ($status.Text -eq $expectedHeading -and $form.Text -eq ($expectedWindow+' v'+$env:CLE_PROGRESS_VERSION)) 'Welcome heading or product/window title is incorrect'

                if ($case -eq 'welcome-cancel') { $cancel.PerformClick(); return }
                $install.PerformClick()
                Assert-Test ($script:setupPage -eq 'license' -and -not $install.Enabled -and $licenseBox.Text -match 'MIT License') 'License acceptance gate absent'
                Assert-Test ($licenseBox.Text.Contains("`r`n") -and $licenseBox.SelectionStart -eq 0) 'License line breaks or initial position invalid'
                Assert-Test ($detail.Bottom -lt $licenseBox.Top -and $licenseBox.Bottom -le $agreement.Top) 'License viewer overlaps adjacent text'
                $install.PerformClick()
                Assert-Test ($script:setupPage -eq 'license' -and -not (Test-Path -LiteralPath $decision)) 'Unaccepted license bypassed'
                Save-Frame 'license'
                if ($case -eq 'license-cancel') { $cancel.PerformClick(); return }
                $agreement.Checked = $true
                $install.PerformClick()
                Assert-Test ($script:setupPage -eq 'folder' -and $install.Text -eq (ConvertTo-CodeCodexUiText 'Install') -and -not (Test-Path -LiteralPath $decision)) 'Folder navigation wrote a decision'
                # Back preserves agreement and custom path but must still obey the agreement gate.
                $back.PerformClick()
                $agreement.Checked = $false
                Assert-Test (-not $install.Enabled) 'Returning to license lost the gate'
                $back.PerformClick()
                Assert-Test ($script:setupPage -eq 'welcome') 'Back to Welcome failed'
                $install.PerformClick()
                $agreement.Checked = $true
                $install.PerformClick()
                if ($case -in @('update','automatic-update')) {
                    Assert-Test ($pathPanel.Visible -and $pathBox.ReadOnly -and -not $browse.Enabled -and -not $custom.Visible) 'Update folder must be locked'
                    Save-Frame 'update'
                    $install.PerformClick()
                } elseif ($case -eq 'custom') {
                    Assert-Test (-not $pathPanel.Visible) 'Default address row must be collapsed'
                    Save-Frame 'default'
                    $custom.Checked = $true
                    $pathBox.Text = Join-Path $env:TEST_OUTPUT "中文 Apps\user's Code-Codex"
                    $preserved=$pathBox.Text
                    # Users change language by returning to Welcome; other pages
                    # retain configuration without exposing a second selector.
                    $back.PerformClick()
                    $back.PerformClick()
                    foreach ($round in 1..6) {
                        $languageChoice.SelectedIndex=1-$languageChoice.SelectedIndex
                        Assert-LanguageVisibility
                        Assert-Test ($languageChoice.Left -eq $detail.Left -and $languageLabel.Top -gt $detail.Bottom) 'Language switch moved field out of welcome content'
                    }
                    $languageChoice.SelectedIndex=1-$languageChoice.SelectedIndex
                    Assert-Test ($agreement.Checked -and $custom.Checked -and $pathBox.Text -eq $preserved -and -not (Test-Path -LiteralPath $decision)) 'Language change reset state or committed early'
                    $languageChoice.SelectedIndex=1-$languageChoice.SelectedIndex
                    Assert-Test ($pathBox.Text -eq $preserved -and $script:CodeCodexUiLocale -eq $env:CLE_UI_LANGUAGE -and $form.Text.StartsWith((ConvertTo-CodeCodexUiText 'Code-Codex setup'))) 'Language roundtrip lost selection'
                    $install.PerformClick()
                    Assert-LanguageVisibility
                    $install.PerformClick()
                    Assert-LanguageVisibility

                } elseif ($case -eq 'invalid') {
                    $custom.Checked = $true
                    $pathBox.Text = 'C:\'
                    $install.PerformClick()
                    Assert-Test (-not (Test-Path -LiteralPath $decision) -and $script:setupPending -and $pathHint.ForeColor.R -eq 170) 'Invalid path was accepted or error not visible'
                    Save-Frame 'invalid'
                    $cancel.PerformClick()
                } elseif ($case -eq 'reset-default') {
                    $custom.Checked = $true
                    $pathBox.Text = Join-Path $env:TEST_OUTPUT 'unused\Code-Codex'
                    $custom.Checked = $false
                    Assert-Test (-not $pathPanel.Visible -and $pathBox.Text -eq $env:TEST_SETUP_ROOT) 'Turning off custom did not restore default'
                    $install.PerformClick()
                } elseif ($case -eq 'cancel') {
                    Save-Frame 'default'
                    $cancel.PerformClick()
                } elseif ($case -eq 'close') { $form.Close() }
            }
        } elseif ($script:testStep -eq 2) {
            if ($case -in @('report','automatic-update-report','uninstall-report')) {
                $script:fixtureCopiedDetails=$null
                $script:fixtureReport="Original fixture error`nProcess timeline`n" + ('Detailed check observation. '*2000)
                $report=@{message=$script:fixtureReport;path=$null}|ConvertTo-Json -Compress
                [IO.File]::WriteAllText($env:CLE_PROGRESS_STATE_PATH,('8|report|0|'+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($report))))
                return
            }
            if ($case -eq 'custom') {
                Assert-Test ($pathPanel.Visible -and [Math]::Abs($form.Height-$form.Width*0.6) -le 1) 'Custom field did not expand'
                # Required controls remain inside the client and do not overlap the footer.
                Assert-Test (($pathPanel.Bottom -le $actions.Top) -and ($install.Right -le $actions.Width)) 'Configuration layout overlaps'
                Save-Frame 'custom'
                $install.PerformClick()
            }
            if ($case -in @('custom','update','reset-default','automatic-update')) {
                if ($case -ne 'automatic-update') {
                Assert-Test (Test-Path -LiteralPath $decision) 'Install did not produce a decision'
                $selected = [IO.File]::ReadAllText($decision) | ConvertFrom-Json
                $expected = if ($case -eq 'custom') { Join-Path $env:TEST_OUTPUT "中文 Apps\user's Code-Codex" } else { $env:TEST_SETUP_ROOT }
                Assert-Test ($selected.installRoot -eq $expected -and $selected.uiLanguage -eq $env:CLE_UI_LANGUAGE) 'Selected root differs'
                } else {
                    $expected=$env:TEST_SETUP_ROOT
                    Assert-Test (-not (Test-Path -LiteralPath $decision)) 'Updater unexpectedly requested folder selection'
                }
                Assert-Test (-not $custom.Visible -and -not $pathPanel.Visible -and -not $actions.Visible -and $bar.Visible) 'Same form did not switch to progress'
                Assert-Test (-not (Test-Path -LiteralPath (Join-Path $expected 'versions'))) 'UI wrote installation data'
                $message = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("Installing files`nYour data is preserved."))
                [IO.File]::WriteAllText($env:CLE_PROGRESS_STATE_PATH, ('2|progress|65|'+$message))
            }
        } elseif ($script:testStep -eq 3) {
            if ($case -in @('report','automatic-update-report','uninstall-report')) {
                if ($script:setupPage -ne 'report') { $script:testStep=2;return }
                Assert-Test ([IO.File]::ReadAllText($env:CLE_PROGRESS_ACK_PATH) -eq '8|report') 'Report acknowledgement missing'
                Assert-Test ($script:reportBox.Text -eq ($script:fixtureReport -replace "\r?\n", "`r`n") -and -not $cancel.Enabled) 'Complete report or open-file state incorrect'
                $back.PerformClick()
                Assert-Test ($script:fixtureCopiedDetails -eq $script:fixtureReport -and $script:setupPage -eq 'report') 'Copy details truncated report or changed page'
                # The fixture copy adapter never changes the system clipboard.
                Save-Frame 'diagnostic-report';$install.PerformClick();return
            }
            if ($bar.Value -ne 65 -or $status.Text -ne (ConvertTo-CodeCodexUiText $(if($script:uninstallWizard){'Removing application files'}else{'Installing files'}))) {
                $script:testWaitTicks++
                if ($script:testWaitTicks -gt 20) { throw 'Progress update timed out' }
                $script:testStep = 2
                return
            }
            Assert-Test ($bar.Value -eq 65 -and $status.Text -eq (ConvertTo-CodeCodexUiText $(if($script:uninstallWizard){'Removing application files'}else{'Installing files'}))) 'Progress did not update in the same window'
            Assert-Test ($brandPanel.Visible -and $form.ClientSize.Width -eq [int](720*$form.LayoutDpi/96.0)) 'Brand disappeared during installation'
            Save-Frame 'progress'
            $message = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($(if($script:uninstallWizard){'Code-Codex was uninstalled successfully.'}else{'Code-Codex was installed successfully. Use the desktop shortcut to start.'})))
            [IO.File]::WriteAllText($env:CLE_PROGRESS_STATE_PATH, ('3|finish|100|'+$message))
        } elseif ($script:testStep -eq 4) {
            if ($script:setupPage -ne 'finish') {
                $script:testWaitTicks++
                if ($script:testWaitTicks -gt 20) { throw 'Finish page timed out' }
                $script:testStep = 3
                return
            }
            Assert-Test ($script:setupPage -eq 'finish' -and $install.Text -eq (ConvertTo-CodeCodexUiText 'Finish') -and $install.Enabled -and $form.ControlBox -and -not $bar.Visible -and -not $back.Visible -and -not $cancel.Visible) 'Finish page absent'
            Assert-Test ($detail.Text -eq (ConvertTo-CodeCodexUiText $(if($script:uninstallWizard){'Code-Codex was uninstalled successfully.'}else{'Code-Codex was installed successfully. Use the desktop shortcut to start.'})) -and $form.CancelButton -eq $install) 'Finish details or keyboard action absent'
            Save-Frame 'finish'
            $install.PerformClick()
        } elseif ($script:testStep -gt 10) { throw 'Form failed to close' }
    } catch {
        [IO.File]::WriteAllText((Join-Path $env:TEST_OUTPUT 'error.txt'), ($_ | Out-String))
        $script:allowClose = $true
        $script:testTimer.Stop()
        $form.Close()
    }
})
$script:testTimer.Start()
'@
$results = @()
$cases = if ($Uninstall) { @('uninstall-keep','uninstall-purge','uninstall-cancel','uninstall-close','uninstall-report','uninstall-response-failure') } else { @('custom','invalid','reset-default','cancel','close','update','automatic-update','automatic-update-report','automatic-progress','welcome-cancel','license-cancel','report') }
if ($OnlyCases) { foreach($selectedCase in $OnlyCases) { if ($selectedCase -notin $cases) { throw 'Unknown wizard fixture case.' } }; $cases=$OnlyCases }
foreach ($case in $cases) {
    $directory = Join-Path $OutputRoot $case
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $root = Join-Path $directory 'default\Code-Codex'
    if ($case -in @('update','automatic-update')) {
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $root 'current-version'), '0.4.12')
    }
    $contractPath = Join-Path $directory 'Storage-Layout.ps1'
    [IO.File]::WriteAllText($contractPath, $contract, [Text.UTF8Encoding]::new($true))
    $scriptText = [IO.File]::ReadAllText((Join-Path $repo 'resources/i18n/Language.ps1')) + "`n" + $match.Groups[1].Value.Replace('[System.Windows.Forms.Application]::Run($form)', $checks + "`n[System.Windows.Forms.Application]::Run(`$form)")
    $runner = Join-Path $directory 'form.ps1'
    # Replace only the clipboard port; production report formatting and click handler run unchanged.
    $scriptText=$scriptText.Replace('[System.Windows.Forms.Clipboard]::SetText([string]$script:report.message)', '$script:fixtureCopiedDetails=[string]$script:report.message')
    [IO.File]::WriteAllText($runner, $scriptText, [Text.UTF8Encoding]::new($true))
    $state = Join-Path $directory 'state'
    [IO.File]::WriteAllText($state, '0|progress|0|UmVhZHkgdG8gaW5zdGFsbA==')
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $info.Arguments = '-NoProfile -STA -ExecutionPolicy Bypass -File "'+$runner+'"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardOutput = $true
    $variables = @{ CLE_UNINSTALL_WIZARD=$(if($Uninstall){'1'}else{'0'});CLE_UNINSTALL_PURGE=$(if($case -eq 'uninstall-purge'){'1'}else{'0'});CLE_UI_LANGUAGE=$Language;CLE_UI_LANGUAGE_RESOURCES=(Join-Path $repo 'resources/i18n');CLE_PROGRESS_TITLE=$(if($Uninstall){if($Language -eq 'zh-CN'){'卸载 Code-Codex'}else{'Code-Codex uninstall'}}elseif($Language -eq 'zh-CN'){'Code-Codex 安装'}else{'Code-Codex setup'});CLE_PROGRESS_VERSION=$fixtureVersion;CLE_PROGRESS_MESSAGE='Ready to install';CLE_PROGRESS_VALUE='0';CLE_PROGRESS_ICON_PATH=(Join-Path $repo 'crates\launcher\resources\code-codex.png');CLE_SETUP_BACKGROUND_PATH=(Join-Path $repo 'crates\launcher\resources\setup-brand-background.png');CLE_SETUP_LICENSE_PATH=(Join-Path $repo 'LICENSE');CLE_PROGRESS_EXECUTABLE=(Join-Path $repo 'target\release\code-codex-setup.exe');CLE_PROGRESS_READY_PATH=(Join-Path $directory 'ready');CLE_PROGRESS_STATE_PATH=$state;CLE_PROGRESS_PARENT_PID=$PID.ToString();CLE_SETUP_WIZARD=$(if($case -eq 'automatic-progress'){'0'}else{'1'});CLE_SETUP_SELECT=$(if($case -in @('automatic-progress','automatic-update')){'0'}else{'1'});CLE_SETUP_INITIAL_ROOT='';CLE_SETUP_STORAGE_CONTRACT=$contractPath;CLE_SETUP_DECISION_PATH=(Join-Path $directory 'selection.json');TEST_SETUP_ROOT=$root;TEST_CASE=$case;TEST_OUTPUT=$directory }
    if ($case -eq 'automatic-update-report') { $variables['CLE_SETUP_SELECT'] = '0' }
    foreach($entry in $variables.GetEnumerator()) { $info.EnvironmentVariables[$entry.Key] = $entry.Value }
    $info.EnvironmentVariables['CLE_PROGRESS_ACK_PATH']=Join-Path $directory 'ack'
    $info.EnvironmentVariables['CLE_PROGRESS_HEARTBEAT_PATH']=Join-Path $directory 'heartbeat'
    $process = [Diagnostics.Process]::Start($info)
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    if(-not $process.WaitForExit(15000)) { $process.Kill(); throw "UI fixture timeout: $case" }
    $stderr = $stderrTask.Result
    $stdout = $stdoutTask.Result
    [IO.File]::WriteAllText((Join-Path $directory 'process.log'), $stdout+"`n"+$stderr)
    if($stdout -match '"phase":"(heartbeat|UI command processing|unhandled UI exception)","status":"(write failed|failed)"') { throw "Production UI reported an error: $case; see $directory" }
    if($process.ExitCode -ne 0 -or (Test-Path (Join-Path $directory 'error.txt'))) { throw "UI fixture failed: $case; see $directory" }
    $results += @{case=$case;passed=$true;exit=$process.ExitCode}
}
$results | ConvertTo-Json | Set-Content (Join-Path $OutputRoot 'result.json') -Encoding UTF8
Write-Output "$($results.Count) real WinForms wizard/diagnostic cases passed; evidence: $OutputRoot"
