# Disposable off-screen window owned by test-startup-conflict.ps1, never Codex.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object Windows.Forms.Form
$form.Text = 'CodeCodex startup recovery test fixture'
$form.StartPosition = [Windows.Forms.FormStartPosition]::Manual
$form.Location = New-Object Drawing.Point(-12000, -12000)
$form.ShowInTaskbar = $true
$mode = $env:CLE_RESTART_WINDOW_MODE
$second = $null
if ($mode -eq 'multi') {
    $second = New-Object Windows.Forms.Form
    $second.Text = 'CodeCodex second test window'
    $second.StartPosition = [Windows.Forms.FormStartPosition]::Manual
    $second.Location = New-Object Drawing.Point(-12500, -12500)
    $second.ShowInTaskbar = $true
}
$form.Add_Shown({
    if ($mode -eq 'hidden') { $form.Hide() }
    if ($mode -eq 'disabled') { $form.Enabled = $false }
    if ($null -ne $second) { $second.Show() }
    [IO.File]::WriteAllText($env:CLE_RESTART_WINDOW_READY, 'ready')
})
$form.Add_FormClosing({
    param($sender, $event)
    if ($mode -eq 'veto') { $event.Cancel = $true; return }
    if ($null -ne $second) { $second.Close() }
})
try { [Windows.Forms.Application]::Run($form) }
finally { if ($null -ne $second) { $second.Dispose() }; $form.Dispose() }
