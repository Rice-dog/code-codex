function Trace-Install([string]$Phase, [string]$Outcome, [int]$Attempt = 0) {
    if ($script:InstallTrace.Count -ge 128) { $script:InstallTrace.RemoveAt(0) }
    $script:InstallTrace.Add([ordered]@{ elapsedMs=$script:InstallClock.ElapsedMilliseconds; phase=$Phase; outcome=$Outcome; attempt=$Attempt })
}
Trace-Install 'entry' 'started'

function Publish-CodeCodexProgress([int]$Percent, [string]$Stage, [string]$Detail) {
    Trace-Install $Stage 'started'
    $script:InstallStage = $Stage
    $script:InstallOperation = $Stage
    $script:InstallTarget = ""
    $script:InstallAttempt = 0
    if ([string]::IsNullOrWhiteSpace($env:CLE_PROGRESS_STATE_PATH)) { return }
    try {
        $message = [Convert]::ToBase64String(
            [Text.Encoding]::UTF8.GetBytes($Stage + "`n" + $Detail)
        )
        $command = "{0}|progress|{1}|{2}" -f [DateTime]::UtcNow.Ticks, $Percent, $message
        [IO.File]::WriteAllText($env:CLE_PROGRESS_STATE_PATH, $command, [Text.UTF8Encoding]::new($false))
    }
    catch {} # A display failure must not interrupt installation.
}

function Invoke-InstallFileOperation([string]$Operation, [string]$Target, [scriptblock]$Action) {
    $script:InstallOperation = $Operation
    $script:InstallTarget = $Target
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $script:InstallAttempt = $attempt
        try {
            Trace-Install $Operation 'started' $attempt
            & $Action
            Trace-Install $Operation 'passed' $attempt
            return
        }
        catch {
            Trace-Install $Operation 'failed' $attempt
            $code = [Convert]::ToString($_.Exception.GetBaseException().HResult, 16).ToUpperInvariant()
            if ($attempt -eq 3 -or $code -notin @("80070020", "80070021")) { throw }
            Trace-Install $Operation 'retry scheduled' ($attempt + 1)
            Start-Sleep -Milliseconds (150 * $attempt)
        }
    }
}

function Write-InstallDiagnostic($Failure) {
    $baseError = $Failure.Exception.GetBaseException()
    $hresult = [Convert]::ToString($baseError.HResult, 16).ToUpperInvariant().PadLeft(8, '0')
    $win32 = if ($hresult.StartsWith('8007')) { [Convert]::ToInt32($hresult.Substring(4), 16) } else { $null }
    $causes = @(); $cause=$Failure.Exception
    while ($null -ne $cause -and $causes.Count -lt 8) {
        $causes += [ordered]@{exceptionType=$cause.GetType().FullName;hresult=$cause.HResult;messageBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cause.Message))}
        $cause=$cause.InnerException
    }
    $detail = [ordered]@{
        schema = 2
        code = Get-CodeCodexInstallFailureCode $baseError $script:InstallOperation
        installationCommitted = $script:InstallCommitted
        rollback = $script:RollbackReport
        timeline = @($script:InstallTrace.ToArray())
        exceptionChain = $causes
        chainTruncated = ($null -ne $cause)
        errorId = $Failure.FullyQualifiedErrorId
        category = [string]$Failure.CategoryInfo.Category
        processEnvironment = [ordered]@{ powershell=$PSVersionTable.PSVersion.ToString(); languageMode=[string]$ExecutionContext.SessionState.LanguageMode; process64Bit=[Environment]::Is64BitProcess; os64Bit=[Environment]::Is64BitOperatingSystem }
        stage = $script:InstallStage
        operation = $script:InstallOperation
        targetName = if ($script:InstallTarget) { Split-Path -Leaf $script:InstallTarget } else { "" }
        targetExists = if ($script:InstallTarget) { Test-Path -LiteralPath $script:InstallTarget } else { $null }
        attempt = $script:InstallAttempt
        exception = $baseError.GetType().Name
        hresult = "0x$hresult"
        win32 = $win32
        line = $Failure.InvocationInfo.ScriptLineNumber
        messageBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($baseError.Message))
    }
    [Console]::Out.WriteLine('CODECODEX_INSTALL_ERROR:' + (ConvertTo-Json -InputObject $detail -Depth 8 -Compress))
}

function Get-CodeCodexInstallFailureCode([Exception]$Exception, [string]$Operation) {
    if ($Exception.Message -match '^(CC-INSTALL-[A-Z-]+-[0-9]{3}):') { return $Matches[1] }
    $native = $Exception.HResult -band 65535
    if ($Exception.Data.Contains('CodeCodexCode')) { return [string]$Exception.Data['CodeCodexCode'] }
    switch ($native) {
        5 { return 'CC-INSTALL-ACCESS-001' }
        32 { return 'CC-INSTALL-SHARING-001' }
        33 { return 'CC-INSTALL-LOCK-001' }
        112 { return 'CC-INSTALL-SPACE-001' }
        39 { return 'CC-INSTALL-SPACE-002' }
        206 { return 'CC-INSTALL-PATH-LENGTH-001' }
        3 { return 'CC-INSTALL-PATH-MISSING-001' }
        2 { return 'CC-INSTALL-FILE-MISSING-001' }
        183 { return 'CC-INSTALL-CONFLICT-001' }
        80 { return 'CC-INSTALL-CONFLICT-002' }
        19 { return 'CC-INSTALL-READONLY-001' }
        21 { return 'CC-INSTALL-DRIVE-001' }
    }
    if ($Exception -is [UnauthorizedAccessException]) { return 'CC-INSTALL-ACCESS-002' }
    if ($Exception -is [IO.PathTooLongException]) { return 'CC-INSTALL-PATH-LENGTH-002' }
    if ($Exception -is [IO.InvalidDataException]) { return 'CC-INSTALL-PAYLOAD-001' }
    if ($Exception -is [ArgumentException]) { return 'CC-INSTALL-ARGUMENT-001' }
    if ($Operation -match 'shortcut') { return 'CC-INSTALL-SHORTCUT-001' }
    if ($Operation -match 'migration|storage') { return 'CC-INSTALL-STORAGE-001' }
    if ($Operation -match 'verif') { return 'CC-INSTALL-VERIFY-001' }
    return 'CC-INSTALL-UNKNOWN-001'
}

function New-CodeCodexRollbackIssue([string]$Operation, $Failure) {
    $e=$Failure.Exception.GetBaseException()
    return [ordered]@{operation=$Operation;code='CC-INSTALL-ROLLBACK-001';exceptionType=$e.GetType().FullName;hresult=('0x'+$e.HResult.ToString('X8'));reason=$e.Message;errorId=$Failure.FullyQualifiedErrorId;line=$Failure.InvocationInfo.ScriptLineNumber}
}

{{common:Test-ReparsePoint}}

{{common:Get-ExistingItem}}
