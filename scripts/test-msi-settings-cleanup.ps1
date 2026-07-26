[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "msbuild-tools.ps1")

function Get-ExistingItem([string]$Path) {
    return Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Assert-Exists([string]$Path, [string]$Message) {
    if ($null -eq (Get-ExistingItem $Path)) { throw $Message }
}

function Assert-Missing([string]$Path, [string]$Message) {
    if ($null -ne (Get-ExistingItem $Path)) { throw $Message }
}

$msbuild = Get-CodexMsBuildPath
$project = Join-Path $RepoRoot "installer\SettingsCleanupCA.vcxproj"
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempPrefix = $tempBase.TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
) + [IO.Path]::DirectorySeparatorChar
$testRoot = [IO.Path]::GetFullPath((Join-Path $tempBase (
    "CodexLiveExplorer-MsiCleanupTest-" + [Guid]::NewGuid().ToString("N")
)))
if (-not $testRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe MSI cleanup test path: $testRoot"
}
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testRootItem = Get-Item -LiteralPath $testRoot -Force
if (-not $testRootItem.PSIsContainer -or
    ($testRootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "MSI cleanup test root must be a regular directory."
}

$createdJunctions = [Collections.Generic.List[string]]::new()
try {
    $buildRoot = Join-Path $testRoot "build"
    $intermediateRoot = Join-Path $buildRoot "obj"
    New-Item -ItemType Directory -Path $buildRoot | Out-Null
    & $msbuild $project `
        /nologo `
        /m `
        /p:Configuration=Release `
        /p:Platform=x64 `
        /p:SettingsCleanupTest=true `
        /p:IgnoreWarnIntDirInTempDetected=true `
        "/p:OutDir=$buildRoot\" `
        "/p:IntDir=$intermediateRoot\"
    if ($LASTEXITCODE -ne 0) {
        throw "MSI settings-cleanup adversarial-test build failed with exit code $LASTEXITCODE."
    }
    $testExecutable = Join-Path $buildRoot "SettingsCleanupCATest.exe"
    if (-not (Test-Path -LiteralPath $testExecutable -PathType Leaf)) {
        throw "MSI settings-cleanup adversarial-test executable was not built."
    }

    foreach ($acceptedName in @(
        "CodexLiveExplorer.exe",
        "codex-live-explorer.exe",
        "CODEXLIVEEXPLORER.EXE"
    )) {
        & $testExecutable --blocked-process-name $acceptedName
        if ($LASTEXITCODE -ne 0) {
            throw "MSI process guard rejected a shipped executable name: $acceptedName"
        }
    }
    foreach ($rejectedName in @(
        "Codex.exe",
        "codex-live-explorer-helper.exe",
        "codex-live-explorer.exe.bak"
    )) {
        & $testExecutable --blocked-process-name $rejectedName
        if ($LASTEXITCODE -ne 1) {
            throw "MSI process guard accepted an unrelated executable name: $rejectedName"
        }
    }

    function Assert-InstallOwnership([string]$InstallRoot, [int]$ExpectedExitCode, [string]$Message) {
        & $testExecutable --check-install-ownership $InstallRoot
        if ($LASTEXITCODE -ne $ExpectedExitCode) {
            throw "$Message Expected exit code $ExpectedExitCode; received $LASTEXITCODE."
        }
    }

    $missingInstallRoot = Join-Path $testRoot "ownership-missing\Codex Live Explorer"
    Assert-InstallOwnership $missingInstallRoot 0 "A missing install root was not accepted."

    $ownedInstallRoot = Join-Path $testRoot "ownership-regular\Codex Live Explorer"
    New-Item -ItemType Directory -Path $ownedInstallRoot -Force | Out-Null
    $installTypeMarker = Join-Path $ownedInstallRoot "install-type"
    "msi" | Set-Content -LiteralPath $installTypeMarker -Encoding ascii
    Assert-InstallOwnership $ownedInstallRoot 1 "An MSI-owned install root was not accepted."
    "portable" | Set-Content -LiteralPath $installTypeMarker -Encoding ascii
    Assert-InstallOwnership $ownedInstallRoot 2 "A portable-owned install root was not detected."
    "unexpected" | Set-Content -LiteralPath $installTypeMarker -Encoding ascii
    Assert-InstallOwnership $ownedInstallRoot 3 "An invalid ownership marker was accepted."
    Remove-Item -LiteralPath $installTypeMarker -Force
    Assert-InstallOwnership $ownedInstallRoot 3 "An existing install root without an ownership marker was accepted."
    New-Item -ItemType Directory -Path $installTypeMarker | Out-Null
    Assert-InstallOwnership $ownedInstallRoot 3 "A directory ownership marker was accepted."

    $ownershipJunctionTarget = Join-Path $testRoot "ownership-junction-target"
    $ownershipJunction = Join-Path $testRoot "ownership-junction"
    New-Item -ItemType Directory -Path $ownershipJunctionTarget | Out-Null
    "msi" | Set-Content -LiteralPath (Join-Path $ownershipJunctionTarget "install-type") -Encoding ascii
    New-Item -ItemType Junction -Path $ownershipJunction -Target $ownershipJunctionTarget | Out-Null
    $createdJunctions.Add($ownershipJunction)
    Assert-InstallOwnership $ownershipJunction 3 "A reparse-point install root was accepted."

    $ownershipParentTarget = Join-Path $testRoot "ownership-parent-target"
    $ownershipParentJunction = Join-Path $testRoot "ownership-parent-junction"
    $ownershipParentInstall = Join-Path $ownershipParentJunction "Codex Live Explorer"
    New-Item -ItemType Directory -Path (Join-Path $ownershipParentTarget "Codex Live Explorer") -Force | Out-Null
    "msi" | Set-Content -LiteralPath (Join-Path $ownershipParentTarget "Codex Live Explorer\install-type") -Encoding ascii
    New-Item -ItemType Junction -Path $ownershipParentJunction -Target $ownershipParentTarget | Out-Null
    $createdJunctions.Add($ownershipParentJunction)
    Assert-InstallOwnership $ownershipParentInstall 3 "A reparse-point Programs parent was accepted."

    $blockedProcessPath = Join-Path $testRoot "CodexLiveExplorer.exe"
    Copy-Item -LiteralPath (Join-Path $env:WINDIR "System32\ping.exe") -Destination $blockedProcessPath
    $blockedProcess = Start-Process `
        -FilePath $blockedProcessPath `
        -WindowStyle Hidden `
        -ArgumentList @("127.0.0.1", "-n", "30") `
        -PassThru
    try {
        Start-Sleep -Milliseconds 250
        if ($blockedProcess.HasExited) {
            throw "MSI process-guard fixture exited before it could be enumerated."
        }
        & $testExecutable --check-running-explorer
        if ($LASTEXITCODE -ne 0) {
            throw "MSI process guard did not detect a running shipped executable name."
        }
    }
    finally {
        if (-not $blockedProcess.HasExited) {
            $blockedProcess.Kill()
            [void]$blockedProcess.WaitForExit(5000)
        }
        $blockedProcess.Dispose()
    }

    function Invoke-CleanupTest([string]$SettingsRoot) {
        & $testExecutable $SettingsRoot
        if ($LASTEXITCODE -ne 0) {
            throw "MSI settings-cleanup test helper failed with exit code $LASTEXITCODE."
        }
    }

    $regularRoot = Join-Path $testRoot "regular\CodexLiveExplorer"
    New-Item -ItemType Directory -Path $regularRoot -Force | Out-Null
    $settingsFile = Join-Path $regularRoot "settings.json"
    $legacyTemp = Join-Path $regularRoot "settings.json.tmp"
    $crashOrphan = Join-Path $regularRoot ".settings.json.A1b2C3d4E5f6G7h8.tmp"
    $unrelatedDotfile = Join-Path $regularRoot ".settings.json.A1b2C3d4E5f6G7h!.tmp"
    $wrongLengthDotfile = Join-Path $regularRoot ".settings.json.A1b2C3.tmp"
    $unrelatedFile = Join-Path $regularRoot ".keep"
    "settings" | Set-Content -LiteralPath $settingsFile -Encoding UTF8
    "legacy" | Set-Content -LiteralPath $legacyTemp -Encoding UTF8
    "orphan" | Set-Content -LiteralPath $crashOrphan -Encoding UTF8
    "invalid-token" | Set-Content -LiteralPath $unrelatedDotfile -Encoding UTF8
    "wrong-length" | Set-Content -LiteralPath $wrongLengthDotfile -Encoding UTF8
    "keep" | Set-Content -LiteralPath $unrelatedFile -Encoding UTF8
    (Get-Item -LiteralPath $settingsFile).Attributes = [IO.FileAttributes]::ReadOnly
    Invoke-CleanupTest $regularRoot
    Assert-Missing $settingsFile "Regular settings.json was not removed."
    Assert-Missing $legacyTemp "Legacy settings.json.tmp was not removed."
    Assert-Missing $crashOrphan "Exact crash orphan was not removed."
    Assert-Exists $unrelatedDotfile "A non-alphanumeric crash-candidate lookalike was removed."
    Assert-Exists $wrongLengthDotfile "A wrong-length crash-candidate lookalike was removed."
    Assert-Exists $unrelatedFile "An unrelated dotfile was removed."

    $junctionTarget = Join-Path $testRoot "junction-target"
    $junctionParent = Join-Path $testRoot "junction-parent"
    $settingsJunction = Join-Path $junctionParent "CodexLiveExplorer"
    New-Item -ItemType Directory -Path $junctionTarget, $junctionParent | Out-Null
    $targetSettings = Join-Path $junctionTarget "settings.json"
    $targetLegacyTemp = Join-Path $junctionTarget "settings.json.tmp"
    $targetOrphan = Join-Path $junctionTarget ".settings.json.0123456789AbCdEf.tmp"
    "outside-settings" | Set-Content -LiteralPath $targetSettings -Encoding UTF8
    "outside-legacy" | Set-Content -LiteralPath $targetLegacyTemp -Encoding UTF8
    "outside-orphan" | Set-Content -LiteralPath $targetOrphan -Encoding UTF8
    New-Item -ItemType Junction -Path $settingsJunction -Target $junctionTarget | Out-Null
    $createdJunctions.Add($settingsJunction)
    Invoke-CleanupTest $settingsJunction
    Assert-Missing $settingsJunction "Settings-root junction was not unlinked."
    Assert-Exists $targetSettings "Settings cleanup traversed a root junction to settings.json."
    Assert-Exists $targetLegacyTemp "Settings cleanup traversed a root junction to settings.json.tmp."
    Assert-Exists $targetOrphan "Settings cleanup traversed a root junction to a crash orphan."

    $orphanReparseRoot = Join-Path $testRoot "orphan-reparse\CodexLiveExplorer"
    $orphanReparseTarget = Join-Path $testRoot "orphan-reparse-target"
    New-Item -ItemType Directory -Path $orphanReparseRoot, $orphanReparseTarget -Force | Out-Null
    $orphanReparseSentinel = Join-Path $orphanReparseTarget "sentinel.txt"
    "outside" | Set-Content -LiteralPath $orphanReparseSentinel -Encoding UTF8
    $orphanReparse = Join-Path $orphanReparseRoot ".settings.json.Z9y8X7w6V5u4T3s2.tmp"
    New-Item -ItemType Junction -Path $orphanReparse -Target $orphanReparseTarget | Out-Null
    $createdJunctions.Add($orphanReparse)
    Invoke-CleanupTest $orphanReparseRoot
    Assert-Exists $orphanReparse "Crash-orphan cleanup removed a non-regular reparse entry."
    Assert-Exists $orphanReparseSentinel "Crash-orphan cleanup traversed a child junction."

    $unexpectedRoot = Join-Path $testRoot "unexpected\CodexLiveExplorer"
    $unexpectedSettingsDirectory = Join-Path $unexpectedRoot "settings.json"
    New-Item -ItemType Directory -Path $unexpectedSettingsDirectory -Force | Out-Null
    $unexpectedSentinel = Join-Path $unexpectedSettingsDirectory "sentinel.txt"
    "keep" | Set-Content -LiteralPath $unexpectedSentinel -Encoding UTF8
    Invoke-CleanupTest $unexpectedRoot
    Assert-Exists $unexpectedSentinel "Settings cleanup recursively removed an unexpected settings directory."

    $raceAncestor = Join-Path $testRoot "ancestor-race"
    $raceSettingsRoot = Join-Path $raceAncestor "nested\CodexLiveExplorer"
    $raceSettingsFile = Join-Path $raceSettingsRoot "settings.json"
    New-Item -ItemType Directory -Path $raceSettingsRoot -Force | Out-Null
    "settings" | Set-Content -LiteralPath $raceSettingsFile -Encoding UTF8
    $eventSuffix = [Guid]::NewGuid().ToString("N")
    $readyEventName = "Local\CodexLiveExplorer-CleanupReady-$eventSuffix"
    $continueEventName = "Local\CodexLiveExplorer-CleanupContinue-$eventSuffix"
    $readyEvent = [Threading.EventWaitHandle]::new(
        $false,
        [Threading.EventResetMode]::ManualReset,
        $readyEventName
    )
    $continueEvent = [Threading.EventWaitHandle]::new(
        $false,
        [Threading.EventResetMode]::ManualReset,
        $continueEventName
    )
    $raceProcess = $null
    try {
        $raceProcess = Start-Process `
            -FilePath $testExecutable `
            -WindowStyle Hidden `
            -PassThru `
            -ArgumentList @(
                ('"{0}"' -f $raceSettingsRoot),
                $readyEventName,
                $continueEventName
            )
        if (-not $readyEvent.WaitOne(5000)) {
            throw "MSI cleanup helper did not enter its ancestor-locked section."
        }

        $renamedAncestor = Join-Path $testRoot "ancestor-race-renamed"
        $renameWasBlocked = $false
        try {
            Move-Item -LiteralPath $raceAncestor -Destination $renamedAncestor -ErrorAction Stop
        }
        catch {
            $renameWasBlocked = $true
        }
        if (-not $renameWasBlocked) {
            throw "A locked settings-path ancestor could be renamed during cleanup."
        }

        [void]$continueEvent.Set()
        if (-not $raceProcess.WaitForExit(10000)) {
            $raceProcess.Kill()
            throw "MSI cleanup helper did not finish its bounded ancestor-race test."
        }
        if ($raceProcess.ExitCode -ne 0) {
            throw "MSI cleanup helper failed the ancestor-race test with exit code $($raceProcess.ExitCode)."
        }
        Assert-Missing $raceSettingsFile "Settings cleanup did not resume after the blocked ancestor rename."

        Move-Item -LiteralPath $raceAncestor -Destination $renamedAncestor
        Move-Item -LiteralPath $renamedAncestor -Destination $raceAncestor
    }
    finally {
        [void]$continueEvent.Set()
        if ($null -ne $raceProcess) {
            if (-not $raceProcess.HasExited -and -not $raceProcess.WaitForExit(5000)) {
                $raceProcess.Kill()
                [void]$raceProcess.WaitForExit(5000)
            }
            $raceProcess.Dispose()
        }
        $continueEvent.Dispose()
        $readyEvent.Dispose()
    }

    $boundedRoot = Join-Path $testRoot "bounded\CodexLiveExplorer"
    New-Item -ItemType Directory -Path $boundedRoot -Force | Out-Null
    foreach ($number in 0..69) {
        $token = "{0:D16}" -f $number
        "orphan" | Set-Content -LiteralPath (
            Join-Path $boundedRoot ".settings.json.$token.tmp"
        ) -Encoding UTF8
    }
    Invoke-CleanupTest $boundedRoot
    $remainingOrphans = @(
        Get-ChildItem -LiteralPath $boundedRoot -File -Force |
            Where-Object { $_.Name -match '^\.settings\.json\.[A-Za-z0-9]{16}\.tmp$' }
    )
    if ($remainingOrphans.Count -ne 6) {
        throw "Crash-orphan cleanup must be bounded to 64 candidates; found $($remainingOrphans.Count) remaining."
    }

    $emptyAfterCleanup = Join-Path $testRoot "empty\CodexLiveExplorer"
    New-Item -ItemType Directory -Path $emptyAfterCleanup -Force | Out-Null
    "settings" | Set-Content -LiteralPath (Join-Path $emptyAfterCleanup "settings.json") -Encoding UTF8
    "orphan" | Set-Content -LiteralPath (
        Join-Path $emptyAfterCleanup ".settings.json.aBcDeF0123456789.tmp"
    ) -Encoding UTF8
    Invoke-CleanupTest $emptyAfterCleanup
    Assert-Missing $emptyAfterCleanup "An empty regular settings root was not removed."

    Write-Host "MSI custom-action adversarial tests passed."
}
finally {
    foreach ($junction in $createdJunctions) {
        $junctionItem = Get-ExistingItem $junction
        if ($null -ne $junctionItem -and
            ($junctionItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            [IO.Directory]::Delete($junctionItem.FullName, $false)
        }
    }
    $cleanupItem = Get-ExistingItem $testRoot
    if ($null -ne $cleanupItem -and
        $testRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and
        $cleanupItem.PSIsContainer -and
        ($cleanupItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
