$script:CreatedVersionRoot = $false
$script:InstallCommitted = $false
$script:ActivationReport = [ordered]@{outcome='not-run';code='CC-INSTALL-ACTIVATE-000'}
$script:RollbackReport = [ordered]@{outcome='not-needed';issues=@()}
$script:VersionRetentionReport = [ordered]@{policy='current-and-previous';outcome='not-run';reason='installation has not committed'}
$script:RetiredStartupCacheReport = [ordered]@{outcome='not-run';reason='installation has not committed'}
$previousVersionMarker = $null
$previousInstallTypeMarker = $null
$script:VersionSnapshotTaken = $false
$script:RegistrySnapshotTaken = $false
$previousRegistryEntry = $null
$script:CleanupIssues = @()
try {
if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or $Version.Length -gt 32) {
    throw "CC-INSTALL-VERSION-001: Release version must be a bounded three-part numeric version: $Version"
}
Publish-CodeCodexProgress 62 "Checking installation" "Verifying package files and the destination folder."

$requiredPayload = @(
    $SourceBinary,
    $SourceRuntimeLauncher,
    $SourceShim,
    $SourceShortcutTool,
    $SourceUninstallerExecutable,
    $SourceUninstaller,
    $SourceFinalizer,
    $SourceBrandIcon
)
foreach ($payload in $requiredPayload) {
    $item = Get-ExistingItem $payload
    if ($null -eq $item -or $item.PSIsContainer -or (Test-ReparsePoint $item)) {
        throw "CC-INSTALL-PAYLOAD-001: Required payload must be a regular file next to this installer: $payload"
    }
}

$installedBefore = Test-Path -LiteralPath (Join-Path $RegisteredRoot 'current-version') -PathType Leaf
if ($SelectDirectory) {
    $selected = Show-CodeCodexDirectoryChoice $InstallRoot $installedBefore
    if ($null -eq $selected) { Write-Host 'CODECODEX_INSTALL_CANCELLED'; exit 0 }
    $InstallRoot = $selected
}
$InstallRoot = Assert-CodeCodexRoot $InstallRoot
if ($installedBefore -and -not $InstallRoot.Equals([IO.Path]::GetFullPath($RegisteredRoot).TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase)) {
    throw 'CC-INSTALL-LOCATION-001: An existing installation must be updated in its registered folder. To relocate, uninstall with KeepSettings first, then select the new folder.'
}
$VersionsRoot = Join-Path $InstallRoot 'versions'
$VersionRoot = Join-Path $VersionsRoot $Version
if (Test-Path -LiteralPath $InstallRoot) {
    $children = @(Get-ChildItem -LiteralPath $InstallRoot -Force)
    if ($children.Count -gt 0 -and -not (Test-Path -LiteralPath (Join-Path $InstallRoot 'storage-layout.json')) -and -not $installedBefore) {
        throw 'CC-INSTALL-OWNERSHIP-001: The selected folder is not empty or owned by Code-Codex. Choose an empty dedicated folder.'
    }
}
$disk = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($InstallRoot))
if ($disk.AvailableFreeSpace -lt 100MB) { throw 'CC-INSTALL-SPACE-001: At least 100 MB of free disk space is required before installation and migration.' }
$existingInstall = Get-ExistingItem $InstallRoot
if ($null -ne $existingInstall -and
    (-not $existingInstall.PSIsContainer -or (Test-ReparsePoint $existingInstall))) {
    throw "Refusing to install into a non-directory or reparse-point path: $InstallRoot"
}

$documentCopies = @()
foreach ($document in @(
    "README.md",
    "README.en.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES_EN.md",
    "THIRD_PARTY_NOTICES_ZH_CN.md",
    "THIRD_PARTY_LICENSES.txt",
    "sbom.spdx.json"
)) {
    $sourceDocument = Join-Path $SourceRoot $document
    if ($null -ne (Get-ExistingItem $sourceDocument)) {
        $destinationDocument = Join-Path $InstallRoot $document
        Assert-SafeFileCopy $sourceDocument $destinationDocument
        $documentCopies += [PSCustomObject]@{
            Source = $sourceDocument
            Destination = $destinationDocument
        }
    }
}
$sourceDocs = Join-Path $SourceRoot "docs"
$installedDocs = Join-Path $InstallRoot "docs"
$installDocumentation = $null -ne (Get-ExistingItem $sourceDocs)
if ($installDocumentation) {
    Assert-SafeDocumentTree $sourceDocs $installedDocs
}

$installFullPath = [IO.Path]::GetFullPath($InstallRoot)
$versionFullPath = [IO.Path]::GetFullPath($VersionRoot)
$installPrefix = $installFullPath.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $versionFullPath.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing a version path outside the selected installation root."
}

$installTypePath = Join-Path $InstallRoot "install-type"
$installTypeItem = Get-ExistingItem $installTypePath
if ($null -ne $installTypeItem) {
    if ($installTypeItem.PSIsContainer -or (Test-ReparsePoint $installTypeItem)) {
        throw "Refusing to read a non-file or reparse-point installation ownership marker: $installTypePath"
    }
    if ((Get-Content -LiteralPath $installTypePath -Raw -Encoding UTF8).Trim() -eq "msi") {
        throw "Code-Codex is owned by Windows Installer. Uninstall it through Windows Installed apps before using the standalone installer."
    }
}

$msiProductCodePattern = '^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$'
$uninstallRegistryRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
$uninstallRegistryPattern = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
$existingMsiRegistration = $null
if (Test-Path -LiteralPath $uninstallRegistryRoot) {
    $existingMsiRegistration = Get-ItemProperty $uninstallRegistryPattern -ErrorAction Stop |
        Where-Object {
            $_.DisplayName -eq "Code-Codex" -and
            [string]$_.PSChildName -match $msiProductCodePattern -and
            [string]$_.WindowsInstaller -eq "1"
        } |
        Select-Object -First 1
}
if ($null -ne $existingMsiRegistration) {
    throw "Code-Codex is registered with Windows Installer. Uninstall it through Windows Installed apps before using the standalone installer."
}

Publish-CodeCodexProgress 68 "Checking Codex integration" "Validating the official Codex installation and shortcuts."
& $SourceShortcutTool preflight --install-root $InstallRoot --version $Version
if ($LASTEXITCODE -ne 0) {
    throw "CC-INSTALL-CODEX-001: Stable Codex could not be validated for Code-Codex integration. No installation files were changed."
}
$script:InstallOperation = "Creating installation directory"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$installRootItem = Get-ExistingItem $InstallRoot
if ($null -eq $installRootItem -or -not $installRootItem.PSIsContainer -or (Test-ReparsePoint $installRootItem)) {
    throw "The installation root must be a regular directory."
}
$script:InstallOperation = 'Preparing centralized storage'
$StorageMarkerPath = Join-Path $InstallRoot 'storage-layout.json'
if (Get-ExistingItem $StorageMarkerPath) {
    $null=Assert-CodeCodexRoot $InstallRoot -Owned
    $StorageMarkerBefore = [IO.File]::ReadAllText($StorageMarkerPath)
}
$script:StorageSnapshotTaken = $true
$script:InstallOperation = 'Checking storage replacement capability'
$script:InstallTarget = $InstallRoot
Test-CodeCodexAtomicStorage $InstallRoot { param($phase,$status) Trace-Install ('Storage preflight '+$phase) $status 0 }
Publish-CodeCodexProgress 70 'Migrating existing data' 'Copying settings, verified plugins and logs; keeping original data for recovery.'
# Retain this product marker after an interrupted migration so a retry can resume safely.
Write-AtomicText $StorageMarkerPath '{"schema":1,"product":"Code-Codex","layout":"centralized"}'
Initialize-CodeCodexStorage $InstallRoot
Trace-Install 'storage migration' ('passed; copied=' + $script:MigrationCopied + '; preservedDestination=' + $script:MigrationSkipped)
$languageJson = & $SourceShortcutTool language --install-root $InstallRoot
if ($LASTEXITCODE -ne 0) { throw 'CC-LANG-READ-001: Could not read the current language before commit.' }
$script:LanguageBefore = ($languageJson -join "`n") | ConvertFrom-Json
$script:InstallOperation = "Saving shortcut rollback state"
& $SourceShortcutTool prepare-install --install-root $InstallRoot | Out-Null
if ($LASTEXITCODE -ne 0) { throw "The shortcut rollback state could not be prepared." }
$script:InstallRollbackPrepared = $true
$previousVersionPath = Join-Path $InstallRoot "current-version"
$previousInstallTypePath = Join-Path $InstallRoot "install-type"
if (Test-Path -LiteralPath $previousVersionPath -PathType Leaf) {
    $previousVersionMarker = [IO.File]::ReadAllText($previousVersionPath)
}
if (Test-Path -LiteralPath $previousInstallTypePath -PathType Leaf) {
    $previousInstallTypeMarker = [IO.File]::ReadAllText($previousInstallTypePath)
}
$script:VersionSnapshotTaken = $true

New-Item -ItemType Directory -Path $VersionsRoot -Force | Out-Null
$versionsItem = Get-Item -LiteralPath $VersionsRoot -Force
if (-not $versionsItem.PSIsContainer -or (Test-ReparsePoint $versionsItem)) {
    throw "The versions path must be a regular directory: $VersionsRoot"
}

if (Test-Path -LiteralPath $VersionRoot) {
    Publish-CodeCodexProgress 74 "Verifying application files" "Comparing the installed binaries with this package."
    $versionItem = Get-Item -LiteralPath $VersionRoot -Force
    if (-not $versionItem.PSIsContainer -or (Test-ReparsePoint $versionItem)) {
        throw "The release path must be a regular directory: $VersionRoot"
    }
    foreach ($pair in @(
        @($SourceBinary, (Join-Path $VersionRoot "code-codex.exe")),
        @($SourceRuntimeLauncher, (Join-Path $VersionRoot "CodeCodex.exe"))
    )) {
        if (-not (Test-Path -LiteralPath $pair[1] -PathType Leaf) -or
            (Get-Sha256Hash $pair[0]) -ne (Get-Sha256Hash $pair[1])) {
            throw "CC-INSTALL-VERSION-CONFLICT-001: Version $Version is already installed with a different payload. Use a new release version."
        }
    }
}
else {
    Publish-CodeCodexProgress 74 "Installing application files" "Copying the Code-Codex binaries into the version folder."
    $stagingVersion = Join-Path $VersionsRoot (".{0}.{1}.tmp" -f $Version, [Guid]::NewGuid().ToString("N"))
    try {
        New-Item -ItemType Directory -Path $stagingVersion | Out-Null
        Copy-Item -LiteralPath $SourceBinary -Destination (Join-Path $stagingVersion "code-codex.exe")
        Copy-Item -LiteralPath $SourceRuntimeLauncher -Destination (Join-Path $stagingVersion "CodeCodex.exe")
        Invoke-InstallFileOperation "Moving version directory" $VersionRoot {
            [IO.Directory]::Move($stagingVersion, $VersionRoot)
        }
        $script:CreatedVersionRoot = $true
    }
    finally {
        if (Test-Path -LiteralPath $stagingVersion) {
            try { Remove-Item -LiteralPath $stagingVersion -Recurse -Force -ErrorAction Stop }
            catch { $script:CleanupIssues += "staging directory cleanup failed" }
        }
    }
}

Publish-CodeCodexProgress 81 "Installing support files" "Updating the launcher, uninstaller, and documentation."
Copy-AtomicFile $SourceShim (Join-Path $InstallRoot "CodeCodex-$Version.exe")
# Stable, already-managed root entry for the opt-in login command. The shim
# resolves current-version, so upgrades and rollback do not pin a retired binary.
Copy-AtomicFile $SourceShim (Join-Path $InstallRoot "CodeCodex.exe")
Copy-AtomicFile $SourceShortcutTool (Join-Path $InstallRoot "CodeCodex.Shortcut.exe")
Copy-AtomicFile $SourceUninstallerExecutable (Join-Path $InstallRoot "Uninstall-CodeCodex.exe")
Copy-AtomicFile $SourceUninstaller (Join-Path $InstallRoot "Uninstall-CodeCodex.ps1")
Copy-AtomicFile $SourceFinalizer (Join-Path $InstallRoot "Finalize-Uninstall.ps1")
Copy-AtomicFile $SourceBrandIcon (Join-Path $InstallRoot "CodeCodex.Brand.png")

foreach ($documentCopy in $documentCopies) {
    Assert-SafeFileCopy $documentCopy.Source $documentCopy.Destination
    Copy-AtomicFile $documentCopy.Source $documentCopy.Destination
}
if ($installDocumentation) {
    Copy-SafeDocumentTree $sourceDocs $installedDocs
}

Write-AtomicText (Join-Path $InstallRoot "current-version") ($Version + "`n")
Write-AtomicText (Join-Path $InstallRoot "install-type") "portable`n"
Write-AtomicText $StorageMarkerPath '{"schema":1,"product":"Code-Codex","layout":"centralized"}'
New-Item 'HKCU:\Software\CodeCodex' -Force | Out-Null
New-ItemProperty 'HKCU:\Software\CodeCodex' -Name InstallPath -Value $InstallRoot -PropertyType String -Force | Out-Null

Publish-CodeCodexProgress 88 "Registering installation" "Updating the Windows installed-app entry."
# Remove only the obsolete unconditional sign-in entry. The new opt-in
# CodeCodexLogin value is separate and must be preserved across upgrades.
Remove-ItemProperty `
    -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
    -Name "CodeCodex" `
    -ErrorAction SilentlyContinue

$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodeCodex"
$previousRegistryEntry = Get-ItemProperty -LiteralPath $uninstallKey -ErrorAction SilentlyContinue
$script:RegistrySnapshotTaken = $true
New-Item -Path $uninstallKey -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayName" -PropertyType String -Value "Code-Codex" -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayVersion" -PropertyType String -Value $Version -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "Publisher" -PropertyType String -Value "Code-Codex contributors" -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "InstallLocation" -PropertyType String -Value $InstallRoot -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "DisplayIcon" -PropertyType String -Value (Join-Path $InstallRoot "Uninstall-CodeCodex.exe") -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "UninstallString" -PropertyType String `
    -Value ('"{0}"' -f (Join-Path $InstallRoot "Uninstall-CodeCodex.exe")) -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "NoModify" -PropertyType DWord -Value 1 -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name "NoRepair" -PropertyType DWord -Value 1 -Force | Out-Null

$installedShortcutTool = Join-Path $InstallRoot "CodeCodex.Shortcut.exe"
Publish-CodeCodexProgress 94 "Updating shortcuts" "Linking the Codex desktop shortcut to Code-Codex."
$shortcutResultJson = & $installedShortcutTool install --install-root $InstallRoot --version $Version --preserve-legacy
$shortcutExitCode = $LASTEXITCODE
if ($shortcutExitCode -ne 0) {
    throw "CC-INSTALL-SHORTCUT-001: The Codex or ChatGPT desktop shortcut could not be redirected, or the Code-Codex shortcut could not be created (exit code $shortcutExitCode)."
}
$shortcutResult = ($shortcutResultJson -join "`n") | ConvertFrom-Json
$managedShortcut = [string]$shortcutResult.shortcutPath
if (-not $managedShortcut -or -not (Test-Path -LiteralPath $managedShortcut -PathType Leaf)) {
    throw "Code-Codex could not verify the installed desktop shortcut."
}
$script:InstallOperation = "Verifying installed payload and shortcut"
foreach ($pair in @(
    @($SourceBinary, (Join-Path $VersionRoot "code-codex.exe")),
    @($SourceRuntimeLauncher, (Join-Path $VersionRoot "CodeCodex.exe")),
    @($SourceShim, (Join-Path $InstallRoot "CodeCodex-$Version.exe")),
    @($SourceShim, (Join-Path $InstallRoot "CodeCodex.exe")),
    @($SourceShortcutTool, $installedShortcutTool),
    @($SourceUninstallerExecutable, (Join-Path $InstallRoot "Uninstall-CodeCodex.exe"))
)) {
    if (-not (Test-Path -LiteralPath $pair[1] -PathType Leaf) -or
        (Get-Sha256Hash $pair[0]) -ne (Get-Sha256Hash $pair[1])) {
        throw "CC-INSTALL-INTEGRITY-001: Installed file verification failed for $([IO.Path]::GetFileName($pair[1]))."
    }
}
if (([IO.File]::ReadAllText($previousVersionPath)).Trim() -ne $Version) {
    throw "The active installed version was not updated."
}
$shortcutStatusJson = & $installedShortcutTool status --install-root $InstallRoot
if ($LASTEXITCODE -ne 0) { throw "The installed shortcut status could not be verified." }
$shortcutStatus = ($shortcutStatusJson -join "`n") | ConvertFrom-Json
if ([string]$shortcutStatus.state -ne "managed" -or
    [string]$shortcutStatus.installedVersion -ne $Version -or
    [string]$shortcutStatus.shortcutPath -ne $managedShortcut) {
    throw "The installed shortcut does not point to the verified version."
}
# A language choice is committed only after all payload and shortcut checks.
$script:InstallOperation = "Committing UI language"
if ($script:LanguageBefore.issue) { Write-Warning ('Language preference preserved: '+$script:LanguageBefore.issue.code); Trace-Install 'UI language commit' 'fallback; damaged preference preserved' }
elseif ($UiLanguage -or [int]$script:LanguageBefore.revision -eq 0) {
    $targetLanguage = if ($UiLanguage) { $UiLanguage } else { [string]$script:LanguageBefore.locale }
    $languageJson = & $SourceShortcutTool language --install-root $InstallRoot --locale $targetLanguage --expected-revision $script:LanguageBefore.revision
    if ($LASTEXITCODE -ne 0) { throw 'CC-LANG-WRITE-001: Could not commit UI language; the previous choice was preserved.' }
    $script:LanguageCommitted = ($languageJson -join "`n") | ConvertFrom-Json
    if ($script:LanguageCommitted.issue) { Trace-Install 'UI language commit' 'fallback; damaged preference preserved' } else { Trace-Install 'UI language commit' 'passed' }
}
if ($script:LanguageBefore.issue -or $script:LanguageCommitted.issue) { Write-Host 'CODECODEX_LANGUAGE_NOT_SAVED' }
$script:InstallOperation = "Committing shortcut installation"
& $installedShortcutTool commit-install --install-root $InstallRoot | Out-Null
if ($LASTEXITCODE -ne 0) { throw "The shortcut installation could not be committed." }
$script:InstallRollbackPrepared = $false
$script:InstallCommitted = $true
Publish-CodeCodexProgress 96 "Shortcut ready" "Code-Codex will start from $([IO.Path]::GetFileNameWithoutExtension($managedShortcut))."

$script:VersionRetentionReport = Remove-CodeCodexOldVersions $InstallRoot $Version $previousVersionMarker $script:InstallCommitted
if ($script:VersionRetentionReport.outcome -ne 'passed') {
    Write-Warning 'Some older application versions were retained. See versionRetention in the installation log for details.'
}

$script:InstallOperation = "Retiring obsolete startup movie cache"
Publish-CodeCodexProgress 97 "Removing obsolete startup movies" "Keeping the original video library and basic parameters."
try {
    $script:RetiredStartupCacheReport = Remove-CodeCodexRetiredStartupCache $InstallRoot
} catch {
    # Optional maintenance must not turn a committed installation into a failure.
    $script:RetiredStartupCacheReport = [ordered]@{
        outcome='retained'; relativePath='data/cache/startup-video'; removedBytes=0L
        originalMediaPreserved=$true; reason=$_.Exception.Message
        exceptionType=$_.Exception.GetType().FullName
    }
}
if ($script:RetiredStartupCacheReport.outcome -eq 'retained') { Write-Warning 'Obsolete startup movies were retained because safe cleanup could not be completed; see retiredStartupCache in the installation log.' }
Trace-Install 'Retired startup cache' $script:RetiredStartupCacheReport.outcome
$installedCommandLine = Join-Path $VersionRoot "code-codex.exe"
Publish-CodeCodexProgress 98 "Activating Code-Codex" "Refreshing any currently open Codex window."
try {
    if ($NoActivate) { $script:ActivationReport=[ordered]@{outcome='explicitly-skipped';code='CC-INSTALL-ACTIVATE-006'} }
    else {
        $activation=Start-Process -FilePath $installedCommandLine -ArgumentList @("activate") -WindowStyle Hidden -PassThru
        $script:ActivationReport=[ordered]@{outcome='waiting';code='CC-INSTALL-ACTIVATE-003';pid=$activation.Id;expectedVersion=$Version;installationCommitted=$true}
        $watch=[Diagnostics.Stopwatch]::StartNew()
        while ($watch.ElapsedMilliseconds -lt 20000) {
            $log=Get-ChildItem -LiteralPath (Join-Path $InstallRoot 'logs\runtime') -Filter ('*-'+$activation.Id+'.jsonl') -File -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($log -and $log.Length -le 5MB) {
                foreach ($line in @(Get-Content -LiteralPath $log.FullName -Tail 160 -ErrorAction SilentlyContinue)) {
                    try { $event=$line|ConvertFrom-Json -ErrorAction Stop } catch { continue }
                    if ($event.source -eq 'launcher' -and $event.action -eq 'live activation' -and $event.outcome -eq 'skipped' -and $event.details.version -eq $Version) {
                        $script:ActivationReport.outcome=$event.details.reason;$script:ActivationReport.code=$event.details.code;break
                    }
                    if ($event.source -eq 'renderer' -and $event.action -eq 'file tree state' -and $event.outcome -in @('ready','empty','no-project') -and $event.details.version -eq $Version -and $event.details.visible -eq $true -and $event.details.bridgeAvailable -eq $true) {
                        $script:ActivationReport.outcome='ready';$script:ActivationReport.code='CC-INSTALL-ACTIVATE-005';$script:ActivationReport.rendererState=$event.outcome;break
                    }
                }
            }
            if ($script:ActivationReport.outcome -ne 'waiting') { break }
            $activation.Refresh()
            if ($activation.HasExited) {
                $script:ActivationReport.outcome=if($activation.ExitCode -eq 0){'no-verified-running-target'}else{'process-exited'}
                $script:ActivationReport.code=if($activation.ExitCode -eq 0){'CC-INSTALL-ACTIVATE-004'}else{'CC-INSTALL-ACTIVATE-002'}
                $script:ActivationReport.exitCode=$activation.ExitCode;break
            }
            Start-Sleep -Milliseconds 250
        }
        $script:ActivationReport.elapsedMs=$watch.ElapsedMilliseconds
        if ($script:ActivationReport.outcome -eq 'waiting') { $script:ActivationReport.outcome='readiness-timeout' }
        Trace-Install ('Activation '+$script:ActivationReport.code) $script:ActivationReport.outcome
        if ($script:ActivationReport.outcome -notin @('ready','no-verified-running-target')) { Write-Warning ($script:ActivationReport.code+': Files are installed, but the current interface has not confirmed readiness. The installation was retained; inspect activation in the install report.') }
    }
}
catch {
    $script:ActivationReport=[ordered]@{outcome='activation-error';code='CC-INSTALL-ACTIVATE-001';installationCommitted=$true;reason=$_.Exception.Message;hresult=$_.Exception.HResult}
    Write-Warning "CC-INSTALL-ACTIVATE-001: Files are installed, but updating the currently open interface failed: $($_.Exception.Message)"
}

Save-CodeCodexInstallReport 'passed'
Write-Host "Code-Codex managed shortcut: $managedShortcut"
Write-Host "Installed Code-Codex $Version. Open the managed desktop shortcut to start Codex with Code-Codex."
}
catch {
    $failure = $_
    $failedOperation=[ordered]@{stage=$script:InstallStage;operation=$script:InstallOperation;target=$script:InstallTarget;attempt=$script:InstallAttempt}
    $rollbackIssues = @($script:CleanupIssues)
    if (-not $script:InstallCommitted) {
        if ($script:StorageSnapshotTaken) {
            try {
                if ($null -ne $StorageMarkerBefore) { Write-AtomicText $StorageMarkerPath $StorageMarkerBefore }
                if ($StorageRegistryBefore -and $StorageRegistryBefore.InstallPath) { Set-ItemProperty 'HKCU:\Software\CodeCodex' -Name InstallPath -Value $StorageRegistryBefore.InstallPath }
                else { Remove-ItemProperty 'HKCU:\Software\CodeCodex' -Name InstallPath -ErrorAction SilentlyContinue }
            } catch { $rollbackIssues += (New-CodeCodexRollbackIssue 'storage locator rollback failed' $_) }
        }
        if ($script:InstallRollbackPrepared) {
            $shortcutRollbackOutput = & $SourceShortcutTool rollback-install --install-root $InstallRoot 2>&1
            if ($LASTEXITCODE -ne 0) { $rollbackIssues += [ordered]@{operation='shortcut restore';code='CC-INSTALL-ROLLBACK-SHORTCUT-001';exitCode=$LASTEXITCODE;output=([string]($shortcutRollbackOutput -join "`n")).Substring(0,[Math]::Min(2048,([string]($shortcutRollbackOutput -join "`n")).Length))} }
        }
        if ($script:VersionSnapshotTaken) {
        foreach ($marker in @(@($previousVersionPath, $previousVersionMarker), @($previousInstallTypePath, $previousInstallTypeMarker))) {
            if (-not $marker[0]) { continue }
            try {
                if ($null -eq $marker[1]) {
                    Remove-Item -LiteralPath $marker[0] -Force -ErrorAction SilentlyContinue
                }
                else {
                    [IO.File]::WriteAllText($marker[0], [string]$marker[1], [Text.UTF8Encoding]::new($false))
                }
            }
            catch { $rollbackIssues += (New-CodeCodexRollbackIssue 'version marker rollback failed' $_) }
        }
        }
        if ($script:RegistrySnapshotTaken) {
            try {
                if ($null -eq $previousRegistryEntry) {
                    Remove-Item -LiteralPath $uninstallKey -Force -ErrorAction SilentlyContinue
                }
                else {
                    foreach ($name in @('DisplayName', 'DisplayVersion', 'Publisher', 'InstallLocation', 'DisplayIcon', 'UninstallString', 'NoModify', 'NoRepair')) {
                        $property = $previousRegistryEntry.PSObject.Properties[$name]
                        if ($null -eq $property) {
                            Remove-ItemProperty -LiteralPath $uninstallKey -Name $name -ErrorAction SilentlyContinue
                        }
                        else {
                            Set-ItemProperty -LiteralPath $uninstallKey -Name $name -Value $property.Value -ErrorAction Stop
                        }
                    }
                }
            }
            catch { $rollbackIssues += (New-CodeCodexRollbackIssue 'installed-app registration rollback failed' $_) }
        }
        if ($script:CreatedVersionRoot -and $VersionRoot.StartsWith($VersionsRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
            try { Remove-Item -LiteralPath $VersionRoot -Recurse -Force -ErrorAction Stop }
            catch { $rollbackIssues += (New-CodeCodexRollbackIssue 'new version directory cleanup failed' $_) }
        }
    }
    $script:RollbackReport=[ordered]@{outcome=$(if($script:InstallCommitted){'not-performed-after-commit'}elseif($rollbackIssues.Count){'incomplete'}else{'completed-unverified'});issues=@($rollbackIssues);verified=$false}
    $script:InstallStage=$failedOperation.stage;$script:InstallOperation=$failedOperation.operation;$script:InstallTarget=$failedOperation.target;$script:InstallAttempt=$failedOperation.attempt
    Write-InstallDiagnostic $failure
    Save-CodeCodexInstallReport 'failed'
    if ($rollbackIssues.Count -gt 0) {
        [Console]::Out.WriteLine('CODECODEX_ROLLBACK_ERROR:' + ($rollbackIssues | ConvertTo-Json -Depth 6 -Compress))
    }
    exit 1
}
