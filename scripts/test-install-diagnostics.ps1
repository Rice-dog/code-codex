$ErrorActionPreference = 'Stop'
$source = Join-Path (Split-Path -Parent $PSScriptRoot) 'installer\Install-CodeCodex.ps1'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Installer script has syntax errors.' }

foreach ($name in @('Invoke-InstallFileOperation', 'Write-InstallDiagnostic')) {
    $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if ($null -eq $definition) { throw "Installer diagnostic function missing: $name" }
    . ([scriptblock]::Create($definition.Extent.Text))
}

$script:InstallStage = 'Installing application files'
$script:InstallOperation = ''
$script:InstallTarget = ''
$script:InstallAttempt = 0
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('CodeCodex-install-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $sourceDirectory = Join-Path $temporary 'source'
    $targetDirectory = Join-Path $temporary 'target'
    New-Item -ItemType Directory -Path $sourceDirectory | Out-Null
    New-Item -ItemType Directory -Path $targetDirectory | Out-Null
    $failed = $false
    try {
        Invoke-InstallFileOperation 'Moving version directory' $targetDirectory {
            [IO.Directory]::Move($sourceDirectory, $targetDirectory)
        }
    }
    catch {
        $failed = $true
        $original = $_
    }
    if (-not $failed) { throw 'The conflicting directory move unexpectedly succeeded.' }
    if ($script:InstallAttempt -ne 1) { throw 'A non-transient conflict was retried.' }

    $oldOutput = [Console]::Out
    $captured = [IO.StringWriter]::new()
    try {
        [Console]::SetOut($captured)
        Write-InstallDiagnostic $original
    }
    finally { [Console]::SetOut($oldOutput) }
    $line = $captured.ToString().Trim()
    if (-not $line.StartsWith('CODECODEX_INSTALL_ERROR:')) { throw 'Structured error marker missing.' }
    $report = $line.Substring('CODECODEX_INSTALL_ERROR:'.Length) | ConvertFrom-Json
    if ($report.operation -ne 'Moving version directory' -or
        $report.targetName -ne 'target' -or
        $report.targetExists -ne $true -or
        $report.exception -ne 'IOException' -or
        $report.hresult -notmatch '^0x[0-9A-F]{8}$') {
        throw 'The move diagnostic omitted its operation, target state, exception, or error code.'
    }

    $localized = -join (@(0x6587, 0x4EF6, 0x6B63, 0x5728, 0x4F7F, 0x7528, 0x4E2D) | ForEach-Object { [char]$_ })
    $chinese = [IO.IOException]::new($localized)
    $record = [Management.Automation.ErrorRecord]::new($chinese, 'MoveTest', [Management.Automation.ErrorCategory]::WriteError, $targetDirectory)
    $captured = [IO.StringWriter]::new()
    [Console]::SetOut($captured)
    try { Write-InstallDiagnostic $record }
    finally { [Console]::SetOut($oldOutput) }
    $report = $captured.ToString().Trim().Substring('CODECODEX_INSTALL_ERROR:'.Length) | ConvertFrom-Json
    $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($report.messageBase64))
    if ($decoded -ne $localized) { throw 'Localized error text was not preserved as UTF-8.' }
    Write-Output 'Installer move diagnostics and Chinese error encoding passed.'
}
finally {
    if ($temporary.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
    }
}
