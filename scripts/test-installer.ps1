[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$installerRoot = Join-Path $RepoRoot "installer"

function Assert-Contains([string]$Text, [string]$Pattern, [string]$Message) {
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains([string]$Text, [string]$Pattern, [string]$Message) {
    if ($Text -match $Pattern) { throw $Message }
}

foreach ($scriptPath in @(
    (Join-Path $installerRoot "Install-CodexLiveExplorer.ps1"),
    (Join-Path $installerRoot "Uninstall-CodexLiveExplorer.ps1"),
    (Join-Path $installerRoot "Finalize-Uninstall.ps1"),
    (Join-Path $PSScriptRoot "build-msi.ps1"),
    (Join-Path $PSScriptRoot "package.ps1"),
    (Join-Path $PSScriptRoot "msbuild-tools.ps1"),
    (Join-Path $PSScriptRoot "test-msi-settings-cleanup.ps1"),
    (Join-Path $PSScriptRoot "test-installer.ps1"),
    (Join-Path $PSScriptRoot "test.ps1")
)) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $scriptPath,
        [ref]$tokens,
        [ref]$parseErrors
    )
    if ($parseErrors.Count -gt 0) {
        $details = ($parseErrors | ForEach-Object { $_.Message }) -join "; "
        throw "PowerShell parser rejected $scriptPath`: $details"
    }
}

$wixPath = Join-Path $installerRoot "Package.wxs"
[xml]$wix = Get-Content -LiteralPath $wixPath -Raw -Encoding UTF8
$namespace = New-Object System.Xml.XmlNamespaceManager($wix.NameTable)
$namespace.AddNamespace("w", "http://wixtoolset.org/schemas/v4/wxs")

$expectedReleaseVersion = "0.1.19"
$expectedUpgradeCode = "{A7E56376-831E-4F97-ACF6-BE40704F6176}"
$packageNode = $wix.SelectSingleNode("/w:Wix/w:Package", $namespace)
if ($null -eq $packageNode -or
    $packageNode.Version -ne '$(var.ProductVersion)' -or
    $packageNode.UpgradeCode -ne $expectedUpgradeCode) {
    throw "MSI package identity must use ProductVersion and the stable upgrade code."
}
$majorUpgrade = $packageNode.SelectSingleNode("w:MajorUpgrade", $namespace)
if ($null -eq $majorUpgrade -or
    $majorUpgrade.AllowSameVersionUpgrades -ne "yes" -or
    $majorUpgrade.Schedule -notin @("afterInstallExecute", "afterInstallFinalize") -or
    [string]::IsNullOrWhiteSpace($majorUpgrade.DowngradeErrorMessage)) {
    throw "MSI must stage upgrades side by side before removing the prior version while rejecting newer-version downgrades."
}

$portableInstallProperty = $wix.SelectSingleNode(
    "//w:Property[@Id='PORTABLEINSTALLDETECTED']",
    $namespace
)
$portableInstallSearch = if ($null -ne $portableInstallProperty) {
    $portableInstallProperty.SelectSingleNode(
        "w:RegistrySearch[@Id='PortableInstallRegistrationSearch']",
        $namespace
    )
}
$portableInstallLaunch = $wix.SelectSingleNode(
    "//w:Launch[@Condition='Installed OR NOT PORTABLEINSTALLDETECTED']",
    $namespace
)
if ($null -eq $portableInstallProperty -or
    $null -eq $portableInstallSearch -or
    $portableInstallSearch.Root -ne "HKCU" -or
    $portableInstallSearch.Key -ne 'Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexLiveExplorer' -or
    $portableInstallSearch.Name -ne "DisplayName" -or
    $portableInstallSearch.Type -ne "raw" -or
    $null -eq $portableInstallLaunch -or
    [string]::IsNullOrWhiteSpace($portableInstallLaunch.Message)) {
    throw "Fresh MSI installs must detect and block the portable Apps & Features registration while allowing Installed maintenance and removal."
}
$crossFormatAction = $wix.SelectSingleNode("//w:CustomAction[@Id='BlockCrossFormatInstall']", $namespace)
$crossFormatSequence = $wix.SelectSingleNode(
    "//w:InstallExecuteSequence/w:Custom[@Action='BlockCrossFormatInstall']",
    $namespace
)
if ($null -eq $crossFormatAction -or
    $crossFormatAction.BinaryRef -ne "SettingsCleanupCustomActionBinary" -or
    $crossFormatAction.DllEntry -ne "BlockCrossFormatInstall" -or
    $crossFormatAction.Execute -ne "immediate" -or
    $crossFormatAction.Impersonate -ne "yes" -or
    $crossFormatAction.Return -ne "check" -or
    $null -eq $crossFormatSequence -or
    $crossFormatSequence.Before -ne "InstallInitialize" -or
    $crossFormatSequence.Condition -ne 'NOT (REMOVE = "ALL")') {
    throw "MSI must verify the physical install-type marker before any install transaction starts."
}

if ($wix.SelectNodes("//w:Shortcut", $namespace).Count -ne 0 -or
    $null -ne $wix.SelectSingleNode("//w:Property[@Id='DESKTOPSHORTCUT']", $namespace) -or
    $null -ne $wix.SelectSingleNode("//w:Property[@Id='AUTOSTART']", $namespace) -or
    $null -ne $wix.SelectSingleNode("//w:Feature/w:ComponentRef[@Id='StartMenuShortcut']", $namespace) -or
    $null -ne $wix.SelectSingleNode("//w:Feature/w:ComponentRef[@Id='DesktopShortcut']", $namespace) -or
    $null -ne $wix.SelectSingleNode("//w:Feature/w:ComponentRef[@Id='AutoStart']", $namespace)) {
    throw "MSI must redirect the existing Codex desktop link without creating separate Live Explorer or sign-in shortcuts."
}

$versionFolder = $wix.SelectSingleNode("//w:Directory[@Id='VersionFolder']", $namespace)
$commandLinePayload = $wix.SelectSingleNode("//w:Component[@Id='CommandLinePayload']", $namespace)
$runtimeLauncherPayload = $wix.SelectSingleNode("//w:Component[@Id='RuntimeLauncherPayload']", $namespace)
if ($null -eq $versionFolder -or
    $versionFolder.Name -ne '$(var.ProductVersion)' -or
    $null -eq $commandLinePayload -or
    $null -eq $runtimeLauncherPayload -or
    $commandLinePayload.ParentNode.Id -ne "VersionFolder" -or
    $runtimeLauncherPayload.ParentNode.Id -ne "VersionFolder" -or
    $null -eq $commandLinePayload.SelectSingleNode("w:File[@Id='CommandLineExecutable' and @Name='codex-live-explorer.exe']", $namespace) -or
    $null -eq $runtimeLauncherPayload.SelectSingleNode("w:File[@Id='RuntimeLauncherExecutable' and @Name='CodexLiveExplorer.exe']", $namespace)) {
    throw "MSI runtime executables must live only under versions\\ProductVersion."
}
$productFiles = $wix.SelectSingleNode("//w:Component[@Id='ProductFiles']", $namespace)
foreach ($requiredRootFile in @(
    @{ Id = "RootLauncherExecutable"; Name = "CodexLiveExplorer.exe" },
    @{ Id = "ShortcutIntegrationExecutable"; Name = "CodexLiveExplorer.Shortcut.exe" },
    @{ Id = "UninstallExecutable"; Name = "Uninstall-CodexLiveExplorer.exe" },
    @{ Id = "CurrentVersionFile"; Name = "current-version" },
    @{ Id = "InstallTypeFile"; Name = "install-type" }
)) {
    $file = $productFiles.SelectSingleNode("w:File[@Id='$($requiredRootFile.Id)']", $namespace)
    if ($null -eq $file -or $file.Name -ne $requiredRootFile.Name) {
        throw "MSI stable-root payload is missing $($requiredRootFile.Name)."
    }
}

$prepareIntegration = $wix.SelectSingleNode("//w:CustomAction[@Id='PrepareCodexShortcutInstall']", $namespace)
$installIntegration = $wix.SelectSingleNode("//w:CustomAction[@Id='InstallCodexShortcut']", $namespace)
$commitIntegration = $wix.SelectSingleNode("//w:CustomAction[@Id='CommitCodexShortcutInstall']", $namespace)
$rollbackInstallIntegration = $wix.SelectSingleNode("//w:CustomAction[@Id='RollbackCodexShortcutInstall']", $namespace)
$restoreIntegration = $wix.SelectSingleNode("//w:CustomAction[@Id='RestoreCodexShortcut']", $namespace)
if ($null -eq $prepareIntegration -or
    $prepareIntegration.FileRef -ne "ShortcutIntegrationExecutable" -or
    $prepareIntegration.Execute -ne "deferred" -or
    $prepareIntegration.Impersonate -ne "yes" -or
    $prepareIntegration.Return -ne "check" -or
    $prepareIntegration.ExeCommand -notmatch '^prepare-install --install-root .+$') {
    throw "MSI must capture shortcut state before changing it."
}
if ($null -eq $installIntegration -or
    $installIntegration.FileRef -ne "ShortcutIntegrationExecutable" -or
    $installIntegration.Execute -ne "deferred" -or
    $installIntegration.Impersonate -ne "yes" -or
    $installIntegration.Return -ne "check" -or
    $installIntegration.ExeCommand -notmatch '^install --install-root .+ --version .+ --preserve-legacy$') {
    throw "MSI must run checked, per-user Codex shortcut installation only after files are staged."
}
if ($null -eq $commitIntegration -or
    $commitIntegration.FileRef -ne "ShortcutIntegrationExecutable" -or
    $commitIntegration.Execute -ne "commit" -or
    $commitIntegration.Impersonate -ne "yes" -or
    $commitIntegration.Return -ne "ignore" -or
    $commitIntegration.ExeCommand -notmatch '^commit-install --install-root .+$') {
    throw "MSI must discard its rollback snapshot only when the transaction commits."
}
if ($null -eq $rollbackInstallIntegration -or
    $rollbackInstallIntegration.FileRef -ne "ShortcutIntegrationExecutable" -or
    $rollbackInstallIntegration.Execute -ne "rollback" -or
    $rollbackInstallIntegration.Impersonate -ne "yes" -or
    $rollbackInstallIntegration.ExeCommand -notmatch '^rollback-install --install-root .+$') {
    throw "MSI install rollback must restore the captured pre-install shortcut state."
}
if ($null -eq $restoreIntegration -or
    $restoreIntegration.FileRef -ne "ShortcutIntegrationExecutable" -or
    $restoreIntegration.Execute -ne "deferred" -or
    $restoreIntegration.Impersonate -ne "yes" -or
    $restoreIntegration.Return -ne "check" -or
    $restoreIntegration.ExeCommand -notmatch '^restore --install-root .+$') {
    throw "MSI must run checked, per-user Codex shortcut restoration before product files are removed."
}
$prepareIntegrationSequence = $wix.SelectSingleNode(
    "//w:InstallExecuteSequence/w:Custom[@Action='PrepareCodexShortcutInstall']",
    $namespace
)
$installIntegrationSequence = $wix.SelectSingleNode(
    "//w:InstallExecuteSequence/w:Custom[@Action='InstallCodexShortcut']",
    $namespace
)
$commitIntegrationSequence = $wix.SelectSingleNode(
    "//w:InstallExecuteSequence/w:Custom[@Action='CommitCodexShortcutInstall']",
    $namespace
)
$restoreIntegrationSequence = $wix.SelectSingleNode(
    "//w:InstallExecuteSequence/w:Custom[@Action='RestoreCodexShortcut']",
    $namespace
)
if ($null -eq $prepareIntegrationSequence -or
    $prepareIntegrationSequence.After -ne "RollbackCodexShortcutInstall" -or
    $prepareIntegrationSequence.Condition -ne 'NOT Installed AND NOT (REMOVE = "ALL")' -or
    $null -eq $installIntegrationSequence -or
    $installIntegrationSequence.After -ne "PrepareCodexShortcutInstall" -or
    $installIntegrationSequence.Condition -ne 'NOT Installed AND NOT (REMOVE = "ALL")' -or
    $null -eq $commitIntegrationSequence -or
    $commitIntegrationSequence.After -ne "InstallCodexShortcut" -or
    $commitIntegrationSequence.Condition -ne 'NOT Installed AND NOT (REMOVE = "ALL")' -or
    $null -eq $restoreIntegrationSequence -or
    $restoreIntegrationSequence.Before -ne "RemoveFiles" -or
    $restoreIntegrationSequence.Condition -ne 'REMOVE = "ALL" AND NOT UPGRADINGPRODUCTCODE') {
    throw "MSI shortcut integration must snapshot, install, and commit in order, restore before deletion, and stay redirected across major upgrades."
}
foreach ($cleanupFile in @("RemoveGeneratedCodexIcon", "RemoveLegacyRootCommandLine")) {
    $removeFile = $productFiles.SelectSingleNode("w:RemoveFile[@Id='$cleanupFile']", $namespace)
    if ($null -eq $removeFile -or $removeFile.On -ne "uninstall") {
        throw "MSI uninstall must clean generated icon and legacy root payload residue ($cleanupFile)."
    }
}
foreach ($rollbackId in @("RollbackCodexShortcutInstall", "RollbackCodexShortcutRemoval")) {
    $rollback = $wix.SelectSingleNode("//w:CustomAction[@Id='$rollbackId']", $namespace)
    if ($null -eq $rollback -or
        $rollback.FileRef -ne "ShortcutIntegrationExecutable" -or
        $rollback.Execute -ne "rollback" -or
        $rollback.Impersonate -ne "yes") {
        throw "MSI shortcut changes must have per-user rollback coverage ($rollbackId)."
    }
}

$cargoManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "Cargo.toml") -Raw -Encoding UTF8
if ($cargoManifest -notmatch '(?ms)^\[workspace\.package\]\s+.*?^version\s*=\s*"([^"]+)"') {
    throw "Unable to read the workspace version from Cargo.toml."
}
$cargoVersion = $Matches[1]
$uiManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "packages\explorer-ui\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$demoManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "demo-video\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$buildMsiText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "build-msi.ps1") -Raw -Encoding UTF8
$packageText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "package.ps1") -Raw -Encoding UTF8
$releaseWorkflowText = Get-Content -LiteralPath (Join-Path $RepoRoot ".github\workflows\release.yml") -Raw -Encoding UTF8

function Get-TopLevelJsonVersion([string]$Path) {
    $json = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if ($json -notmatch '(?ms)^\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*"([^"]+)"') {
        throw "Unable to read the top-level package version from $Path."
    }
    return $Matches[1]
}

function Get-DefaultReleaseVersion([string]$Text, [string]$SourceName) {
    if ($Text -notmatch '(?m)^\s*\[string\]\$Version\s*=\s*"([^"]+)"') {
        throw "Unable to read the default release version from $SourceName."
    }
    return $Matches[1]
}

$releaseVersions = [ordered]@{
    "Cargo.toml" = $cargoVersion
    "packages/explorer-ui/package.json" = [string]$uiManifest.version
    "packages/explorer-ui/package-lock.json" = (Get-TopLevelJsonVersion (Join-Path $RepoRoot "packages\explorer-ui\package-lock.json"))
    "demo-video/package.json" = [string]$demoManifest.version
    "demo-video/package-lock.json" = (Get-TopLevelJsonVersion (Join-Path $RepoRoot "demo-video\package-lock.json"))
    "scripts/build-msi.ps1 default" = (Get-DefaultReleaseVersion $buildMsiText "scripts/build-msi.ps1")
    "scripts/package.ps1 default" = (Get-DefaultReleaseVersion $packageText "scripts/package.ps1")
}
foreach ($releaseVersion in $releaseVersions.GetEnumerator()) {
    if ($releaseVersion.Value -ne $expectedReleaseVersion) {
        throw "$($releaseVersion.Key) version must be $expectedReleaseVersion; found $($releaseVersion.Value)."
    }
}
if ($releaseWorkflowText -notmatch '(?m)^\s*default:\s*0\.1\.14\s*$') {
    throw "Release workflow default version must be $expectedReleaseVersion."
}

$settingsComponent = $wix.SelectSingleNode("//w:Component[@Id='SettingsCleanup']", $namespace)
if ($null -eq $settingsComponent) { throw "MSI SettingsCleanup component is missing." }
$settingsDirectory = $settingsComponent.ParentNode
if ($settingsDirectory.Id -ne "SettingsFolder" -or $settingsDirectory.Name -ne "CodexLiveExplorer") {
    throw "MSI settings cleanup is not rooted at LocalAppDataFolder\CodexLiveExplorer."
}
if ($settingsDirectory.SelectNodes(".//w:RemoveFile", $namespace).Count -ne 0) {
    throw "MSI settings cleanup must not use RemoveFile because it can traverse a reparse-point settings root."
}
$removeSettingsFolder = $settingsComponent.SelectSingleNode("w:RemoveFolder[@Id='RemoveSettingsFolder']", $namespace)
if ($null -eq $removeSettingsFolder -or $removeSettingsFolder.On -ne "uninstall") {
    throw "MSI settings folder cleanup is missing."
}
if ($null -eq $wix.SelectSingleNode("//w:Feature/w:ComponentRef[@Id='SettingsCleanup']", $namespace)) {
    throw "MSI SettingsCleanup is not part of the installed feature."
}
if ($null -ne $wix.SelectSingleNode("//w:Property[@Id='KEEPSETTINGS']", $namespace)) {
    throw "KeepSettings is intentionally portable-only; do not expose an undocumented MSI property."
}
$arpInstallLocation = $wix.SelectSingleNode("//w:SetProperty[@Id='ARPINSTALLLOCATION']", $namespace)
if ($null -eq $arpInstallLocation -or
    $arpInstallLocation.Value -ne '[INSTALLFOLDER]' -or
    $arpInstallLocation.After -ne 'CostFinalize') {
    throw "MSI must publish its resolved install location for exact physical-uninstaller ownership checks."
}

$cleanupBinary = $wix.SelectSingleNode("//w:Binary[@Id='SettingsCleanupCustomActionBinary']", $namespace)
if ($null -eq $cleanupBinary -or $cleanupBinary.SourceFile -ne '$(var.SettingsCleanupCAPath)') {
    throw "MSI must embed the native settings-cleanup custom action."
}
$cleanupAction = $wix.SelectSingleNode("//w:CustomAction[@Id='CleanupMsiSettings']", $namespace)
if ($null -eq $cleanupAction -or
    $cleanupAction.BinaryRef -ne "SettingsCleanupCustomActionBinary" -or
    $cleanupAction.DllEntry -ne "CleanupMsiSettings" -or
    $cleanupAction.Execute -ne "immediate" -or
    $cleanupAction.Impersonate -ne "yes" -or
    $cleanupAction.Return -ne "check") {
    throw "MSI native settings cleanup must be a checked, impersonated immediate DLL action."
}
foreach ($unsafeAttribute in @("ExeCommand", "Script", "VBScriptCall", "JScriptCall")) {
    if ($null -ne $cleanupAction.Attributes[$unsafeAttribute]) {
        throw "MSI settings cleanup must not introduce shell or script interpolation."
    }
}
$cleanupSequence = $wix.SelectSingleNode(
    "//w:InstallExecuteSequence/w:Custom[@Action='CleanupMsiSettings']",
    $namespace
)
if ($null -eq $cleanupSequence -or
    $cleanupSequence.After -ne "InstallFinalize" -or
    $cleanupSequence.Condition -ne 'REMOVE = "ALL" AND NOT UPGRADINGPRODUCTCODE') {
    throw "MSI settings cleanup must run post-commit on explicit full removal and skip major-upgrade removal."
}

$uninstallerPath = Join-Path $installerRoot "Uninstall-CodexLiveExplorer.ps1"
$uninstaller = Get-Content -LiteralPath $uninstallerPath -Raw -Encoding UTF8
Assert-Contains $uninstaller '\[switch\]\$KeepSettings' "Portable uninstaller must expose -KeepSettings."
Assert-Contains $uninstaller 'if \(-not \$KeepSettings -or \$PurgeSettings\)' "Settings must be removed by default and retained only by explicit opt-out."
Assert-Contains $uninstaller 'foreach \(\$settingsName in @\("settings\.json", "settings\.json\.tmp"\)\)' "Portable default purge must remove both the settings file and its crash residue."
Assert-Contains $uninstaller '\^\\\.settings\\\.json\\\.\[A-Za-z0-9\]\{16\}\\\.tmp\$' "Portable crash-orphan cleanup must use the exact 16-character ASCII-alphanumeric name contract."
Assert-Contains $uninstaller 'Select-Object -First 64' "Portable crash-orphan cleanup must be bounded."
Assert-Contains $uninstaller 'Remove-SettingsEntry \$crashOrphanPath -RegularFileOnly' "Portable crash-orphan cleanup must preserve directories and reparse points."
Assert-Contains $uninstaller 'Get-CimInstance Win32_Process' "Portable uninstaller process preflight is missing."
Assert-Contains $uninstaller 'codex-live-explorer\.exe' "Portable uninstaller must fail closed for product-named processes without a readable path."
Assert-Contains $uninstaller 'Test-ReparsePoint \$installItem' "Portable uninstaller must reject a reparse-point install root."
Assert-Contains $uninstaller 'Test-ReparsePoint \$finalizerItem' "Portable uninstaller must reject a reparse-point finalizer."
Assert-Contains $uninstaller '\$shortcutTool = Join-Path \$InstallFullPath "CodexLiveExplorer\.Shortcut\.exe"' "Portable uninstall must use the installed shortcut ownership tool."
Assert-Contains $uninstaller '& \$shortcutTool restore --install-root \$InstallFullPath' "Portable uninstall must restore the original Codex shortcut before cleanup."
Assert-Contains $uninstaller 'No Live Explorer files were removed' "Shortcut conflicts must fail closed before product cleanup."
Assert-NotContains $uninstaller '-LiteralPath "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CodexLiveExplorer"' "The foreground uninstaller must retain ARP until file removal succeeds."
Assert-Contains $uninstaller 'Test-ReparsePoint \$installTypeItem' "Uninstall must reject an unsafe ownership marker."
Assert-Contains $uninstaller '\^\\\{\[0-9A-Fa-f\]\{8\}-\[0-9A-Fa-f\]\{4\}-\[0-9A-Fa-f\]\{4\}-\[0-9A-Fa-f\]\{4\}-\[0-9A-Fa-f\]\{12\}\\\}\$' "MSI delegation must accept only a structurally valid product-code key."
Assert-Contains $uninstaller '\[string\]\$_.WindowsInstaller -eq "1"' "MSI delegation must select only Windows Installer registrations."
Assert-Contains $uninstaller 'Test-SamePath \(\[string\]\$_.InstallLocation\) \$InstallFullPath' "MSI delegation must require the registration for this install location."
Assert-NotContains $uninstaller '\$product = \$productCandidates \| Select-Object -First 1' "MSI delegation must fail closed instead of selecting an arbitrary same-name product."
Assert-Contains $uninstaller '\$matchingProducts.Count -ne 1' "MSI delegation must reject ambiguous registrations for the same install location."
Assert-Contains $uninstaller '"-MsiProductCode"' "MSI removal must be delegated through the detached verified finalizer."
Assert-Contains $uninstaller 'Get-FileHash -LiteralPath \$finalizerSource -Algorithm SHA256' "The temporary finalizer copy must match the verified installed script."
$uninstallProcessIndex = $uninstaller.IndexOf('Get-CimInstance Win32_Process', [StringComparison]::Ordinal)
$msiDelegationIndex = $uninstaller.IndexOf('$installTypePath = Join-Path $InstallFullPath "install-type"', [StringComparison]::Ordinal)
$finalizerPreflightIndex = $uninstaller.IndexOf('$finalizerSource = Join-Path $InstallFullPath', [StringComparison]::Ordinal)
$finalizerCopyIndex = $uninstaller.IndexOf('Copy-Item -LiteralPath $finalizerSource -Destination $finalizerCopy', [StringComparison]::Ordinal)
$powerShellPreflightIndex = $uninstaller.IndexOf('$powerShellPath = [IO.Path]::GetFullPath', [StringComparison]::Ordinal)
$shortcutRestoreIndex = $uninstaller.IndexOf('& $shortcutTool restore --install-root $InstallFullPath', [StringComparison]::Ordinal)
$settingsMutationIndex = $uninstaller.IndexOf('if (-not $KeepSettings -or $PurgeSettings)', [StringComparison]::Ordinal)
$finalizerLaunchIndex = $uninstaller.LastIndexOf('Start-Process -FilePath $powerShellPath', [StringComparison]::Ordinal)
if ($uninstallProcessIndex -lt 0 -or
    $msiDelegationIndex -lt 0 -or
    $finalizerPreflightIndex -lt 0 -or
    $finalizerCopyIndex -lt 0 -or
    $powerShellPreflightIndex -lt 0 -or
    $shortcutRestoreIndex -lt 0 -or
    $settingsMutationIndex -lt 0 -or
    $finalizerLaunchIndex -lt 0 -or
    $uninstallProcessIndex -ge $msiDelegationIndex -or
    $uninstallProcessIndex -ge $finalizerPreflightIndex -or
    $finalizerPreflightIndex -ge $finalizerCopyIndex -or
    $finalizerCopyIndex -ge $shortcutRestoreIndex -or
    $powerShellPreflightIndex -ge $shortcutRestoreIndex -or
    $uninstallProcessIndex -ge $shortcutRestoreIndex -or
    $shortcutRestoreIndex -ge $settingsMutationIndex -or
    $settingsMutationIndex -ge $finalizerLaunchIndex) {
    throw "Uninstall must complete process, finalizer, and PowerShell preflight before delegation or mutation."
}

$finalizerPath = Join-Path $installerRoot "Finalize-Uninstall.ps1"
$finalizer = Get-Content -LiteralPath $finalizerPath -Raw -Encoding UTF8
Assert-Contains $finalizer 'function Remove-SafeTree' "Safe recursive finalizer is missing."
Assert-Contains $finalizer 'Test-ReparsePoint \$rootItem' "Finalizer must inspect each directory root before enumeration."
Assert-Contains $finalizer 'Remove-ReparsePoint \$currentChild' "Finalizer must unlink child reparse points without traversal."
Assert-Contains $finalizer 'for \(\$attempt = 1; -not \$removed -and \$attempt -le 30; \$attempt\+\+\)' "Finalizer retry bound changed unexpectedly."
Assert-Contains $finalizer '\$removed = \$null -eq \(Get-ExistingItem \$InstallFullPath\)' "Finalizer must verify removal after every attempt."
Assert-Contains $finalizer 'System\.Windows\.Forms\.MessageBox' "Finalizer needs a visible primary failure path."
Assert-Contains $finalizer 'WScript\.Shell' "Finalizer needs a visible fallback failure path."
Assert-Contains $finalizer '\[int\]\$LauncherPid = 0' "The detached finalizer must wait for the installed uninstaller executable."
Assert-Contains $finalizer '\[string\]\$MsiProductCode' "The detached finalizer must support MSI delegation."
Assert-Contains $finalizer 'Wait-ForProcessExit \$LauncherPid' "MSI delegation must not start until the installed launcher releases its executable."
Assert-Contains $finalizer 'Join-Path \$systemDirectory "msiexec\.exe"' "MSI delegation must resolve Windows Installer from the trusted system directory."
Assert-Contains $finalizer '\[int\]\$msiProcess.ExitCode -notin @\(0, 1641, 3010\)' "MSI success and reboot-success exit codes must all be accepted."
Assert-Contains $finalizer '\$portableUninstallKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CodexLiveExplorer"' "Portable ARP must be owned by the detached finalizer."
$launcherWaitIndex = $finalizer.IndexOf('Wait-ForProcessExit $LauncherPid', [StringComparison]::Ordinal)
$msiLaunchIndex = $finalizer.IndexOf('$msiProcess = Start-Process', [StringComparison]::Ordinal)
$portableRemovalIndex = $finalizer.IndexOf('Remove-SafeTree $InstallFullPath', [StringComparison]::Ordinal)
$arpRemovalIndex = $finalizer.IndexOf('$portableUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexLiveExplorer"', [StringComparison]::Ordinal)
if ($launcherWaitIndex -lt 0 -or
    $msiLaunchIndex -lt 0 -or
    $launcherWaitIndex -ge $msiLaunchIndex -or
    $portableRemovalIndex -lt 0 -or
    $arpRemovalIndex -lt 0 -or
    $portableRemovalIndex -ge $arpRemovalIndex) {
    throw "The detached helper must wait before MSI delegation and retain portable ARP until file removal succeeds."
}
if ($finalizer -match '(?im)^\s*Remove-Item\b[^\r\n]*-Recurse') {
    throw "Finalizer must not use an unguarded recursive Remove-Item operation."
}

$cleanupProjectPath = Join-Path $installerRoot "SettingsCleanupCA.vcxproj"
[xml]$cleanupProject = Get-Content -LiteralPath $cleanupProjectPath -Raw -Encoding UTF8
if ($cleanupProject.Project.ItemGroup.ClCompile.Include -notcontains "SettingsCleanupCA.cpp") {
    throw "MSI settings-cleanup custom-action project does not compile the audited native source."
}
$cleanupSource = Get-Content -LiteralPath (Join-Path $installerRoot "SettingsCleanupCA.cpp") -Raw -Encoding UTF8
Assert-Contains $cleanupSource 'FILE_FLAG_OPEN_REPARSE_POINT' "MSI settings cleanup must open path components without following reparse points."
Assert-Contains $cleanupSource 'locked\.ancestors\.push_back' "MSI settings cleanup must retain locked ancestor handles for its lifetime."
Assert-Contains $cleanupSource 'RecheckRootIdentity\(locked\)' "MSI settings cleanup must recheck the locked settings-root identity."
Assert-Contains $cleanupSource 'SetFileInformationByHandle' "MSI settings cleanup must delete verified entries by handle."
Assert-Contains $cleanupSource 'constexpr size_t maximumCandidates = 64' "MSI crash-orphan cleanup must be bounded."
Assert-Contains $cleanupSource 'constexpr size_t tokenLength = 16' "MSI crash-orphan cleanup must enforce the exact bridge token length."
Assert-Contains $cleanupSource 'regularFilesOnly && \(isDirectory \|\| isReparsePoint\)' "MSI crash-orphan cleanup must preserve non-regular entries."
Assert-Contains $cleanupSource 'FOLDERID_LocalAppData' "MSI settings cleanup must resolve Local AppData without interpolated MSI or shell input."
if ($cleanupSource -match '(?i)\b(system|ShellExecuteW?|CreateProcessW?|DeleteFileW?|RemoveDirectoryW?|SHFileOperationW?)\s*\(') {
    throw "MSI settings cleanup must not invoke a shell or perform path-based deletion."
}

$buildMsi = Get-Content -LiteralPath (Join-Path $PSScriptRoot "build-msi.ps1") -Raw -Encoding UTF8
Assert-Contains $buildMsi 'SettingsCleanupCA\.vcxproj' "MSI build must compile the native settings-cleanup custom action."
Assert-Contains $buildMsi 'SettingsCleanupCAPath=\$settingsCleanupCAPath' "MSI build must pass the validated native custom action to WiX."
foreach ($msiInput in @(
    "ShimBinaryPath",
    "ShortcutBinaryPath",
    "UninstallBinaryPath",
    "UninstallScriptPath",
    "FinalizerScriptPath",
    "CurrentVersionPath",
    "InstallTypePath"
)) {
    Assert-Contains $buildMsi ('"-d", "' + $msiInput + '=') "MSI build must bind $msiInput into the versioned package."
}
Assert-Contains $buildMsi '\[IO\.File\]::WriteAllText\(\$currentVersionPath, \$Version' "MSI must generate its stable-launcher version pointer from ProductVersion."
Assert-Contains $buildMsi '\[IO\.File\]::WriteAllText\(\$installTypePath, "msi' "The physical uninstaller must be able to delegate MSI-owned removal."

$portableInstaller = Get-Content -LiteralPath (Join-Path $installerRoot "Install-CodexLiveExplorer.ps1") -Raw -Encoding UTF8
Assert-Contains $portableInstaller '\[string\]\$Version = "0\.1\.14"' "Portable installer default version is stale."
foreach ($sourceName in @(
    "SourceBinary",
    "SourceRuntimeLauncher",
    "SourceShim",
    "SourceShortcutTool",
    "SourceUninstallerExecutable",
    "SourceUninstaller",
    "SourceFinalizer"
)) {
    Assert-Contains $portableInstaller ("\$" + $sourceName + "\b") "Portable installer must define and preflight $sourceName."
}
Assert-Contains $portableInstaller '\$VersionsRoot = Join-Path \$InstallRoot "versions"' "Portable releases must be installed under a versioned payload root."
Assert-Contains $portableInstaller '\$VersionRoot = Join-Path \$VersionsRoot \$Version' "Portable release directory must be selected by the validated version."
Assert-Contains $portableInstaller 'Get-FileHash[^\r\n]+-Algorithm SHA256' "Equal-version installs must verify immutable payload hashes."
Assert-Contains $portableInstaller '\[IO\.Directory\]::Move\(\$stagingVersion, \$VersionRoot\)' "A versioned payload must become visible through an atomic directory move."
Assert-Contains $portableInstaller 'Copy-AtomicFile \$SourceShim \(Join-Path \$InstallRoot "CodexLiveExplorer\.exe"\)' "The stable root launcher must be installed atomically."
Assert-Contains $portableInstaller 'Copy-AtomicFile \$SourceShortcutTool \(Join-Path \$InstallRoot "CodexLiveExplorer\.Shortcut\.exe"\)' "The shortcut ownership tool must be installed at the stable root."
Assert-Contains $portableInstaller 'Copy-AtomicFile \$SourceUninstallerExecutable \(Join-Path \$InstallRoot "Uninstall-CodexLiveExplorer\.exe"\)' "The clickable uninstaller must be installed at the stable root."
Assert-Contains $portableInstaller 'Write-AtomicText \(Join-Path \$InstallRoot "current-version"\)' "Portable setup must update the stable launcher's version pointer atomically."
Assert-Contains $portableInstaller 'Write-AtomicText \(Join-Path \$InstallRoot "install-type"\) "portable' "Portable setup must identify its ownership for uninstall."
Assert-Contains $portableInstaller '& \$installedShortcutTool install --install-root \$InstallRoot --version \$Version' "Portable setup must redirect the existing Codex shortcut through the ownership tool."
Assert-Contains $portableInstaller 'Windows\\CurrentVersion\\Uninstall\\CodexLiveExplorer' "Portable setup must register its clickable uninstaller in Apps & Features."
Assert-Contains $portableInstaller 'UninstallString' "Portable Apps & Features registration must invoke the physical uninstaller executable."
Assert-Contains $portableInstaller '\$installTypePath = Join-Path \$InstallRoot "install-type"' "Portable setup must inspect an existing ownership marker."
Assert-Contains $portableInstaller '\(Get-Content -LiteralPath \$installTypePath[^\r\n]+\)\.Trim\(\) -eq "msi"' "Portable setup must reject an MSI-owned install root."
Assert-Contains $portableInstaller 'Windows\\CurrentVersion\\Uninstall\\\*' "Portable setup must detect older MSI releases that lack an ownership marker."
Assert-Contains $portableInstaller '\[string\]\$_.PSChildName -match \$msiProductCodePattern' "Portable setup must recognize MSI registrations by product-code keys."
Assert-Contains $portableInstaller '\[string\]\$_.WindowsInstaller -eq "1"' "Portable setup must not confuse its own registration with an MSI product."
Assert-Contains $portableInstaller '& \$SourceShortcutTool preflight --install-root \$InstallRoot --version \$Version' "Portable setup must validate Stable Codex and shortcut ownership before mutation."
Assert-Contains $portableInstaller 'function Assert-SafeDocumentTree' "Portable setup must recursively preflight documentation sources and destinations."
Assert-Contains $portableInstaller 'function Copy-SafeDocumentTree' "Portable setup must copy documentation without traversing unvalidated paths."
Assert-Contains $portableInstaller 'Assert-SafeFileCopy \$sourceChild\.FullName \$destinationChild' "Portable documentation copy must validate every file source and destination."
Assert-Contains $portableInstaller 'Copy-AtomicFile \$sourceChild\.FullName \$destinationChild' "Portable documentation files must use atomic replacement."
Assert-Contains $portableInstaller '\$sourceItem -isnot \[IO\.DirectoryInfo\]' "Portable documentation preflight must require real source directories."
Assert-Contains $portableInstaller '\$destinationItem -isnot \[IO\.DirectoryInfo\]' "Portable documentation copy must reject non-directory destination nodes."
Assert-Contains $portableInstaller '\$destinationItem -isnot \[IO\.FileInfo\]' "Portable documentation copy must reject non-file destination nodes."
Assert-NotContains $portableInstaller '(?im)^\s*Copy-Item\b[^\r\n]*-Recurse' "Portable setup must not recursively copy documentation through Copy-Item."
Assert-NotContains $portableInstaller 'Get-CimInstance Win32_Process' "Versioned portable upgrades must not require the previous runtime to exit."
Assert-NotContains $portableInstaller 'New-Object -ComObject WScript\.Shell' "Portable setup must not create ad hoc Live Explorer shortcuts."
$payloadPreflightIndex = $portableInstaller.IndexOf('$requiredPayload = @(', [StringComparison]::Ordinal)
$programsPreflightIndex = $portableInstaller.IndexOf('$programsItem = Get-ExistingItem', [StringComparison]::Ordinal)
$installPreflightIndex = $portableInstaller.IndexOf('$existingInstall = Get-ExistingItem', [StringComparison]::Ordinal)
$documentFilePreflightIndex = $portableInstaller.IndexOf('Assert-SafeFileCopy $sourceDocument $destinationDocument', [StringComparison]::Ordinal)
$documentTreePreflightIndex = $portableInstaller.IndexOf('Assert-SafeDocumentTree $sourceDocs $installedDocs', [StringComparison]::Ordinal)
$ownershipPreflightIndex = $portableInstaller.IndexOf('$installTypePath = Join-Path $InstallRoot "install-type"', [StringComparison]::Ordinal)
$msiRegistrationPreflightIndex = $portableInstaller.IndexOf('$existingMsiRegistration = Get-ItemProperty', [StringComparison]::Ordinal)
$shortcutPreflightIndex = $portableInstaller.IndexOf('& $SourceShortcutTool preflight --install-root $InstallRoot --version $Version', [StringComparison]::Ordinal)
$installMutationIndex = $portableInstaller.IndexOf('New-Item -ItemType Directory -Path $VersionsRoot', [StringComparison]::Ordinal)
$versionPublishIndex = $portableInstaller.IndexOf('[IO.Directory]::Move($stagingVersion, $VersionRoot)', [StringComparison]::Ordinal)
$pointerPublishIndex = $portableInstaller.IndexOf('Write-AtomicText (Join-Path $InstallRoot "current-version")', [StringComparison]::Ordinal)
$arpRegistrationIndex = $portableInstaller.IndexOf('$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexLiveExplorer"', [StringComparison]::Ordinal)
$arpRegistrationCompleteIndex = $portableInstaller.IndexOf('New-ItemProperty -Path $uninstallKey -Name "NoRepair"', [StringComparison]::Ordinal)
$shortcutInstallIndex = $portableInstaller.IndexOf('& $installedShortcutTool install --install-root $InstallRoot --version $Version', [StringComparison]::Ordinal)
if ($payloadPreflightIndex -lt 0 -or
    $programsPreflightIndex -lt 0 -or
    $installPreflightIndex -lt 0 -or
    $documentFilePreflightIndex -lt 0 -or
    $documentTreePreflightIndex -lt 0 -or
    $ownershipPreflightIndex -lt 0 -or
    $msiRegistrationPreflightIndex -lt 0 -or
    $shortcutPreflightIndex -lt 0 -or
    $installMutationIndex -lt 0 -or
    $versionPublishIndex -lt 0 -or
    $pointerPublishIndex -lt 0 -or
    $arpRegistrationIndex -lt 0 -or
    $arpRegistrationCompleteIndex -lt 0 -or
    $shortcutInstallIndex -lt 0 -or
    $payloadPreflightIndex -ge $installMutationIndex -or
    $programsPreflightIndex -ge $installMutationIndex -or
    $installPreflightIndex -ge $installMutationIndex -or
    $documentFilePreflightIndex -ge $installMutationIndex -or
    $documentTreePreflightIndex -ge $installMutationIndex -or
    $ownershipPreflightIndex -ge $installMutationIndex -or
    $msiRegistrationPreflightIndex -ge $installMutationIndex -or
    $shortcutPreflightIndex -ge $installMutationIndex -or
    $installMutationIndex -ge $versionPublishIndex -or
    $versionPublishIndex -ge $pointerPublishIndex -or
    $pointerPublishIndex -ge $arpRegistrationIndex -or
    $arpRegistrationIndex -ge $arpRegistrationCompleteIndex -or
    $arpRegistrationCompleteIndex -ge $shortcutInstallIndex) {
    throw "Portable setup must preflight destinations, publish a complete version, register its uninstaller, and only then redirect Codex."
}

& {
    $functionNames = @(
        "Test-ReparsePoint",
        "Get-ExistingItem",
        "Assert-RegularFile",
        "Assert-SafeFileCopy",
        "Assert-SafeDocumentTree",
        "Copy-AtomicFile",
        "Copy-SafeDocumentTree"
    )
    $tokens = $null
    $parseErrors = $null
    $installerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Join-Path $installerRoot "Install-CodexLiveExplorer.ps1"),
        [ref]$tokens,
        [ref]$parseErrors
    )
    $functionDefinitions = $installerAst.FindAll(
        {
            param($node)
            $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $functionNames -contains $node.Name
        },
        $true
    ) | ForEach-Object { $_.Extent.Text }
    if ($functionDefinitions.Count -ne $functionNames.Count) {
        throw "Unable to load the portable documentation-copy helpers for adversarial tests."
    }
    . ([ScriptBlock]::Create(($functionDefinitions -join "`r`n")))

    function Assert-DocumentCopyFails([ScriptBlock]$Action, [string]$Message) {
        $failed = $false
        try {
            & $Action
        }
        catch {
            $failed = $true
        }
        if (-not $failed) {
            throw $Message
        }
    }

    function Remove-InstallerTestTree([string]$Path) {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        if ($null -eq $item) {
            return
        }
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            if ($item.PSIsContainer) {
                [IO.Directory]::Delete($item.FullName)
            }
            else {
                [IO.File]::Delete($item.FullName)
            }
            return
        }
        if (-not $item.PSIsContainer) {
            [IO.File]::Delete($item.FullName)
            return
        }
        foreach ($child in @(Get-ChildItem -LiteralPath $item.FullName -Force -ErrorAction Stop)) {
            Remove-InstallerTestTree $child.FullName
        }
        [IO.Directory]::Delete($item.FullName)
    }

    $temporaryPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $testRoot = [IO.Path]::GetFullPath((Join-Path $temporaryPrefix ("clex-document-copy-{0}" -f [Guid]::NewGuid().ToString("N"))))
    if (-not $testRoot.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Adversarial documentation-copy test escaped the temporary directory."
    }

    try {
        $sourceDocs = Join-Path $testRoot "source\docs"
        $sourceDemo = Join-Path $sourceDocs "demo"
        $installParent = Join-Path $testRoot "install"
        $destinationDocs = Join-Path $installParent "docs"
        $outside = Join-Path $testRoot "outside"
        [void][IO.Directory]::CreateDirectory($sourceDemo)
        [void][IO.Directory]::CreateDirectory($installParent)
        [void][IO.Directory]::CreateDirectory($outside)
        [IO.File]::WriteAllText((Join-Path $sourceDocs "guide.md"), "guide-v1")
        [IO.File]::WriteAllText((Join-Path $sourceDemo "README.md"), "demo")
        [IO.File]::WriteAllText((Join-Path $outside "sentinel.txt"), "outside")

        Copy-SafeDocumentTree $sourceDocs $destinationDocs
        if ([IO.File]::ReadAllText((Join-Path $destinationDocs "guide.md")) -ne "guide-v1" -or
            [IO.File]::ReadAllText((Join-Path $destinationDocs "demo\README.md")) -ne "demo") {
            throw "Safe recursive documentation copy did not preserve nested file contents."
        }
        [IO.File]::WriteAllText((Join-Path $sourceDocs "guide.md"), "guide-v2")
        Copy-SafeDocumentTree $sourceDocs $destinationDocs
        if ([IO.File]::ReadAllText((Join-Path $destinationDocs "guide.md")) -ne "guide-v2") {
            throw "Safe recursive documentation copy did not atomically replace an existing regular file."
        }

        $destinationDemo = Join-Path $destinationDocs "demo"
        Remove-InstallerTestTree $destinationDemo
        New-Item -ItemType Junction -Path $destinationDemo -Target $outside | Out-Null
        Assert-DocumentCopyFails {
            Copy-SafeDocumentTree $sourceDocs $destinationDocs
        } "Portable documentation copy followed a nested destination junction."
        if ((Test-Path -LiteralPath (Join-Path $outside "README.md")) -or
            [IO.File]::ReadAllText((Join-Path $outside "sentinel.txt")) -ne "outside") {
            throw "Nested destination junction target was modified by documentation copy."
        }
        Remove-InstallerTestTree $destinationDemo

        $junctionInstallParent = Join-Path $testRoot "junction-install"
        [void][IO.Directory]::CreateDirectory($junctionInstallParent)
        $junctionDocs = Join-Path $junctionInstallParent "docs"
        New-Item -ItemType Junction -Path $junctionDocs -Target $outside | Out-Null
        Assert-DocumentCopyFails {
            Copy-SafeDocumentTree $sourceDocs $junctionDocs
        } "Portable documentation copy followed a destination docs junction."
        if (Test-Path -LiteralPath (Join-Path $outside "guide.md")) {
            throw "Destination docs junction target was modified by documentation copy."
        }
        Remove-InstallerTestTree $junctionDocs

        $fileCollisionParent = Join-Path $testRoot "file-collision"
        [void][IO.Directory]::CreateDirectory($fileCollisionParent)
        $fileCollisionDocs = Join-Path $fileCollisionParent "docs"
        [IO.File]::WriteAllText($fileCollisionDocs, "not-a-directory")
        Assert-DocumentCopyFails {
            Copy-SafeDocumentTree $sourceDocs $fileCollisionDocs
        } "Portable documentation copy accepted a file where docs must be a directory."

        $directoryCollisionDocs = Join-Path $testRoot "directory-collision\docs"
        [void][IO.Directory]::CreateDirectory((Join-Path $directoryCollisionDocs "guide.md"))
        Assert-DocumentCopyFails {
            Copy-SafeDocumentTree $sourceDocs $directoryCollisionDocs
        } "Portable documentation copy accepted a directory where a documentation file must be written."

        $sourceJunction = Join-Path $sourceDocs "linked"
        New-Item -ItemType Junction -Path $sourceJunction -Target $outside | Out-Null
        $sourceReparseDestination = Join-Path $testRoot "source-reparse\docs"
        [void][IO.Directory]::CreateDirectory((Split-Path -Parent $sourceReparseDestination))
        Assert-DocumentCopyFails {
            Copy-SafeDocumentTree $sourceDocs $sourceReparseDestination
        } "Portable documentation copy followed a source junction."
        if (Test-Path -LiteralPath $sourceReparseDestination) {
            throw "Source reparse-point preflight mutated the destination before failing."
        }
        Remove-InstallerTestTree $sourceJunction
    }
    finally {
        Remove-InstallerTestTree $testRoot
    }
}

$packageScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot "package.ps1") -Raw -Encoding UTF8
foreach ($text in @($portableInstaller, $packageScript)) {
    Assert-Contains $text 'Finalize-Uninstall\.ps1' "Portable payload must include the uninstall finalizer."
}
foreach ($releaseBinary in @(
    "codex-live-explorer-shim.exe",
    "codex-live-explorer-shortcut.exe",
    "codex-live-explorer-setup.exe",
    "codex-live-explorer-uninstall.exe"
)) {
    Assert-Contains $packageScript ([regex]::Escape($releaseBinary)) "Release packaging must include $releaseBinary."
}
Assert-Contains $packageScript 'Install-CodexLiveExplorer\.exe' "The extracted ZIP must expose a clickable setup executable."
Assert-Contains $packageScript 'CodexLiveExplorer-\$Version-x64-setup\.exe' "Release packaging must produce a standalone one-click setup executable."
Assert-Contains $packageScript 'GetBytes\("CLEXZIP1"\)' "Standalone setup must append the self-extracting payload footer."
Assert-Contains $packageScript '\$footerWriter\.Write\(\[uint64\]\$setupStub\.LongLength\)' "Standalone setup must record its payload offset without truncation."
Assert-Contains $packageScript '\$footerWriter\.Write\(\[uint64\]\$setupPayload\.LongLength\)' "Standalone setup must record its payload length without truncation."
Assert-Contains $packageScript '\$zip,\s*\$setup,\s*\$msi' "Checksums must cover ZIP, one-click setup EXE, and MSI artifacts."
Assert-Contains $releaseWorkflowText 'artifacts/\*-setup\.exe' "The release workflow must publish the standalone one-click setup executable."

$launcherManifest = Get-Content -LiteralPath (Join-Path $RepoRoot "crates\launcher\Cargo.toml") -Raw -Encoding UTF8
foreach ($binaryName in @(
    "codex-live-explorer-shim",
    "codex-live-explorer-setup",
    "codex-live-explorer-uninstall",
    "codex-live-explorer-shortcut"
)) {
    Assert-Contains $launcherManifest ('name = "' + [regex]::Escape($binaryName) + '"') "Launcher manifest must declare the $binaryName executable."
}

$setupWrapper = Get-Content -LiteralPath (Join-Path $RepoRoot "crates\launcher\src\bin\codex-live-explorer-setup.rs") -Raw -Encoding UTF8
$uninstallWrapper = Get-Content -LiteralPath (Join-Path $RepoRoot "crates\launcher\src\bin\codex-live-explorer-uninstall.rs") -Raw -Encoding UTF8
$stableShim = Get-Content -LiteralPath (Join-Path $RepoRoot "crates\launcher\src\bin\codex-live-explorer-shim.rs") -Raw -Encoding UTF8
$shortcutTool = Get-Content -LiteralPath (Join-Path $RepoRoot "crates\launcher\src\bin\codex-live-explorer-shortcut.rs") -Raw -Encoding UTF8
foreach ($wrapper in @($setupWrapper, $uninstallWrapper, $stableShim)) {
    Assert-Contains $wrapper 'windows_subsystem = "windows"' "Clickable setup, uninstall, and stable launch entry points must not open console windows."
}
Assert-Contains $setupWrapper 'const FOOTER_MAGIC: &\[u8; 8\] = b"CLEXZIP1"' "The one-click setup executable must carry an identifiable embedded payload."
Assert-Contains $setupWrapper 'const INSTALL_SCRIPT: &str = "Install-CodexLiveExplorer\.ps1"' "The one-click setup executable must invoke the audited setup script."
Assert-Contains $setupWrapper 'fn portable_executable_layout' "Standalone setup must distinguish the PE image and Authenticode certificate table from an appended payload."
Assert-Contains $setupWrapper 'match inspect_setup_source\(&executable\)' "Standalone setup must select its embedded payload before considering a sibling script."
Assert-Contains $setupWrapper 'fn appended_data_with_a_missing_or_corrupt_footer_never_falls_back' "Standalone setup must test fail-closed handling of malformed overlays."
Assert-Contains $setupWrapper 'fn signed_embedded_payload_is_classified_and_extracted' "Standalone setup must test an embedded payload followed by an Authenticode certificate table."
Assert-Contains $uninstallWrapper 'Uninstall-CodexLiveExplorer\.ps1' "The physical uninstaller must invoke the audited uninstall script."
Assert-Contains $stableShim 'const POINTER_FILE: &str = "current-version"' "The stable launcher must select its immutable version through current-version."
Assert-Contains $stableShim '\.join\("versions"\)' "The stable launcher must resolve only a versioned runtime payload."
Assert-Contains $shortcutTool 'const CODEX_AUMID: &str = "OpenAI\.Codex_2p2nqsd0c76g0!App"' "Shortcut replacement must validate the official Stable Codex AppX identity."
Assert-Contains $shortcutTool 'const SHORTCUT_NAME: &str = "Codex\.lnk"' "Shortcut replacement must retain the official shortcut name."
Assert-Contains $shortcutTool 'const BACKUP_NAME: &str = "Codex\.original\.lnk"' "Shortcut integration must retain the original link bytes."
Assert-Contains $shortcutTool 'const MANIFEST_NAME: &str = "shortcut-manifest\.json"' "Shortcut integration must record versioned ownership metadata."
Assert-Contains $shortcutTool 'original_sha256' "Shortcut restoration must validate the byte-for-byte backup hash."
Assert-Contains $shortcutTool 'ShortcutConflict' "Shortcut restoration must fail closed when the desktop link is no longer product-owned."
Assert-Contains $shortcutTool 'INSTALL_ROLLBACK_NAME' "MSI shortcut changes must retain a transactional rollback snapshot."
Assert-Contains $shortcutTool 'fn preflight\(' "Portable setup must have a read-only shortcut prerequisite check."
Assert-Contains $shortcutTool 'fn prepare_install\(' "MSI setup must capture pre-install shortcut state."
Assert-Contains $shortcutTool 'fn rollback_install\(' "MSI setup must restore captured shortcut state on rollback."
Assert-Contains $shortcutTool 'fn commit_install\(' "MSI setup must discard captured state only on commit."
Assert-Contains $shortcutTool 'preserve_legacy' "MSI setup must defer legacy shortcut cleanup until commit."
Assert-Contains $shortcutTool 'fn fresh_install_rollback_restores_exact_official_state' "Fresh MSI rollback must be covered by an exact-state test."
Assert-Contains $shortcutTool 'fn managed_upgrade_rollback_preserves_prior_integration_exactly' "Managed MSI upgrade rollback must be covered by an exact-state test."
Assert-Contains $shortcutTool 'fn restore_does_not_overwrite_a_user_changed_shortcut' "The shortcut tool must test conflict-safe restoration."
Assert-Contains $shortcutTool 'fn restore_is_byte_for_byte_and_idempotent' "The shortcut tool must test exact and repeatable restoration."

$aggregateTest = Get-Content -LiteralPath (Join-Path $PSScriptRoot "test.ps1") -Raw -Encoding UTF8
Assert-Contains $aggregateTest '& \(Join-Path \$PSScriptRoot "test-installer\.ps1"\)' "The aggregate test script must invoke installer contract validation."
$installerGateIndex = $aggregateTest.IndexOf('& (Join-Path $PSScriptRoot "test-installer.ps1")', [StringComparison]::Ordinal)
$firstBuildGateIndex = $aggregateTest.IndexOf('& npm --prefix $UiRoot ci', [StringComparison]::Ordinal)
if ($installerGateIndex -lt 0 -or $firstBuildGateIndex -lt 0 -or $installerGateIndex -ge $firstBuildGateIndex) {
    throw "Installer contract validation must run before repository build and test gates."
}

& (Join-Path $PSScriptRoot "test-msi-settings-cleanup.ps1")

Write-Host "Installer and uninstall contracts and adversarial cleanup tests passed."
