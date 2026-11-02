function Assert-RegularFile([string]$Path, [string]$Description) {
    $item = Get-ExistingItem $Path
    if ($null -eq $item -or
        $item.PSIsContainer -or
        $item -isnot [IO.FileInfo] -or
        (Test-ReparsePoint $item)) {
        throw "$Description must be a regular file: $Path"
    }
    return $item
}

function Get-Sha256Hash([string]$Path) {
    [void](Assert-RegularFile $Path "Hash input")
    $stream = [IO.File]::Open(
        $Path,
        [IO.FileMode]::Open,
        [IO.FileAccess]::Read,
        [IO.FileShare]::Read)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "")
    }
    finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

function Assert-SafeFileCopy([string]$Source, [string]$Destination) {
    [void](Assert-RegularFile $Source "Documentation source")

    $destinationDirectory = Split-Path -Parent $Destination
    $destinationDirectoryItem = Get-ExistingItem $destinationDirectory
    if ($null -ne $destinationDirectoryItem -and
        (-not $destinationDirectoryItem.PSIsContainer -or
            $destinationDirectoryItem -isnot [IO.DirectoryInfo] -or
            (Test-ReparsePoint $destinationDirectoryItem))) {
        throw "Documentation destination parent must be a regular directory: $destinationDirectory"
    }

    $destinationItem = Get-ExistingItem $Destination
    if ($null -ne $destinationItem -and
        ($destinationItem.PSIsContainer -or
            $destinationItem -isnot [IO.FileInfo] -or
            (Test-ReparsePoint $destinationItem))) {
        throw "Documentation destination must be a regular file: $Destination"
    }
}

function Assert-SafeDocumentTree([string]$Source, [string]$Destination) {
    $sourceItem = Get-ExistingItem $Source
    if ($null -eq $sourceItem -or
        -not $sourceItem.PSIsContainer -or
        $sourceItem -isnot [IO.DirectoryInfo] -or
        (Test-ReparsePoint $sourceItem)) {
        throw "Documentation source must be a regular directory: $Source"
    }

    $destinationItem = Get-ExistingItem $Destination
    if ($null -ne $destinationItem -and
        (-not $destinationItem.PSIsContainer -or
            $destinationItem -isnot [IO.DirectoryInfo] -or
            (Test-ReparsePoint $destinationItem))) {
        throw "Documentation destination must be a regular directory: $Destination"
    }

    foreach ($sourceChild in @(Get-ChildItem -LiteralPath $Source -Force -ErrorAction Stop)) {
        $destinationChild = Join-Path $Destination $sourceChild.Name
        if ($sourceChild.PSIsContainer) {
            Assert-SafeDocumentTree $sourceChild.FullName $destinationChild
        }
        else {
            Assert-SafeFileCopy $sourceChild.FullName $destinationChild
        }
    }
}

function Copy-AtomicFile([string]$Source, [string]$Destination) {
    [void](Assert-RegularFile $Source "Copy source")
    $destinationDirectory = Split-Path -Parent $Destination
    $destinationDirectoryItem = Get-ExistingItem $destinationDirectory
    if ($null -eq $destinationDirectoryItem) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        $destinationDirectoryItem = Get-ExistingItem $destinationDirectory
    }
    if ($null -eq $destinationDirectoryItem -or
        -not $destinationDirectoryItem.PSIsContainer -or
        $destinationDirectoryItem -isnot [IO.DirectoryInfo] -or
        (Test-ReparsePoint $destinationDirectoryItem)) {
        throw "Copy destination parent must be a regular directory: $destinationDirectory"
    }

    $destinationItem = Get-ExistingItem $Destination
    if ($null -ne $destinationItem -and
        ($destinationItem.PSIsContainer -or
            $destinationItem -isnot [IO.FileInfo] -or
            (Test-ReparsePoint $destinationItem))) {
        throw "Copy destination must be a regular file: $Destination"
    }

    $temporary = Join-Path $destinationDirectory (".{0}.{1}.tmp" -f (Split-Path -Leaf $Destination), [Guid]::NewGuid().ToString("N"))
    $replacementBackup = Join-Path $destinationDirectory (".{0}.{1}.replace-backup" -f (Split-Path -Leaf $Destination), [Guid]::NewGuid().ToString("N"))
    try {
        Copy-Item -LiteralPath $Source -Destination $temporary
        $destinationItem = Get-ExistingItem $Destination
        if ($null -ne $destinationItem -and
            ($destinationItem.PSIsContainer -or
                $destinationItem -isnot [IO.FileInfo] -or
                (Test-ReparsePoint $destinationItem))) {
            throw "Copy destination must remain a regular file: $Destination"
        }
        if ($null -ne $destinationItem) {
            Invoke-InstallFileOperation "Replacing support file" $Destination {
                [IO.File]::Replace($temporary, $Destination, $replacementBackup, $true)
            }
            Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
        }
        else {
            Invoke-InstallFileOperation "Moving support file" $Destination {
                [IO.File]::Move($temporary, $Destination)
            }
        }
    }
    finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
    }
}

function Copy-SafeDocumentTree([string]$Source, [string]$Destination) {
    Assert-SafeDocumentTree $Source $Destination

    $destinationItem = Get-ExistingItem $Destination
    if ($null -eq $destinationItem) {
        $destinationParent = Split-Path -Parent $Destination
        $destinationParentItem = Get-ExistingItem $destinationParent
        if ($null -eq $destinationParentItem -or
            -not $destinationParentItem.PSIsContainer -or
            $destinationParentItem -isnot [IO.DirectoryInfo] -or
            (Test-ReparsePoint $destinationParentItem)) {
            throw "Documentation destination parent must be a regular directory: $destinationParent"
        }
        New-Item -ItemType Directory -Path $Destination | Out-Null
        $destinationItem = Get-ExistingItem $Destination
    }
    if ($null -eq $destinationItem -or
        -not $destinationItem.PSIsContainer -or
        $destinationItem -isnot [IO.DirectoryInfo] -or
        (Test-ReparsePoint $destinationItem)) {
        throw "Documentation destination must be a regular directory: $Destination"
    }

    foreach ($sourceChild in @(Get-ChildItem -LiteralPath $Source -Force -ErrorAction Stop)) {
        $destinationChild = Join-Path $Destination $sourceChild.Name
        if ($sourceChild.PSIsContainer) {
            Copy-SafeDocumentTree $sourceChild.FullName $destinationChild
        }
        else {
            Assert-SafeFileCopy $sourceChild.FullName $destinationChild
            Copy-AtomicFile $sourceChild.FullName $destinationChild
        }
    }
}

function Write-AtomicText([string]$Destination, [string]$Content) {
    # Version-independent storage markers need no replacement during a hot update.
    # Preserve the existing file when content is identical, including rollback.
    if (Test-Path -LiteralPath $Destination -PathType Leaf) {
        [void](Assert-RegularFile $Destination "Installation marker")
        if ([IO.File]::ReadAllText($Destination) -eq $Content) { return }
    }
    $directory = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = Join-Path $directory (".{0}.{1}.tmp" -f (Split-Path -Leaf $Destination), [Guid]::NewGuid().ToString("N"))
    $replacementBackup = Join-Path $directory (".{0}.{1}.replace-backup" -f (Split-Path -Leaf $Destination), [Guid]::NewGuid().ToString("N"))
    try {
        [IO.File]::WriteAllText($temporary, $Content, [Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $Destination -PathType Leaf) {
            Invoke-InstallFileOperation "Replacing installation marker" $Destination {
                [IO.File]::Replace($temporary, $Destination, $replacementBackup, $true)
            }
            Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
        }
        else {
            Invoke-InstallFileOperation "Moving installation marker" $Destination {
                [IO.File]::Move($temporary, $Destination)
            }
        }
    }
    finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $replacementBackup -Force -ErrorAction SilentlyContinue
    }
}

function Update-CodeCodexSameVersionPayload([string]$Root, [string]$Version, [string]$Binary, [string]$Launcher) {
    $owned = Assert-CodeCodexRoot $Root -Owned
    if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or $Version.Length -gt 32) { throw 'CC-INSTALL-PAYLOAD-VERSION-001: Invalid payload version.' }
    $folder = Assert-CodeCodexRoot (Join-Path $owned "versions\$Version")
    $items = @()
    foreach ($pair in @(@($Binary,'code-codex.exe'),@($Launcher,'CodeCodex.exe'))) {
        $target = Join-Path $folder $pair[1]
        $oldHash = Get-Sha256Hash $target; $newHash = Get-Sha256Hash $pair[0]
        $items += [ordered]@{name=$pair[1];source=$pair[0];target=$target;oldSha256=$oldHash;newSha256=$newHash;replaced=$false}
    }
    $script:SameVersionPayload = [ordered]@{schema=1;version=$Version;at=[DateTime]::UtcNow.ToString('o');outcome='same-bytes';items=$items}
    if (-not @($items | Where-Object { $_.oldSha256 -ne $_.newSha256 }).Count) { return }
    $backup = Assert-CodeCodexRoot (Join-Path $owned ('logs\payload-backups\'+[Guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
    # Back up and verify the entire pair before changing either executable.
    foreach ($item in $items) {
        $item.backup = Join-Path $backup $item.name
        Copy-Item -LiteralPath $item.target -Destination $item.backup -ErrorAction Stop
        if ((Get-Sha256Hash $item.backup) -ne $item.oldSha256) { throw 'CC-INSTALL-PAYLOAD-BACKUP-001: The previous build backup could not be verified.' }
    }
    $script:SameVersionPayload.outcome = 'prepared'
    $script:SameVersionPayload.journal = Join-Path $backup 'payload.json'
    Write-AtomicText $script:SameVersionPayload.journal ($script:SameVersionPayload | ConvertTo-Json -Depth 6)
    foreach ($item in $items) {
        if ($item.oldSha256 -eq $item.newSha256) { continue }
        if ((Get-Sha256Hash $item.target) -ne $item.oldSha256) { throw 'CC-INSTALL-PAYLOAD-STALE-001: Installed bytes changed after backup; replacement refused.' }
        Copy-AtomicFile $item.source $item.target
        $item.replaced = $true
        if ((Get-Sha256Hash $item.target) -ne $item.newSha256) { throw 'CC-INSTALL-PAYLOAD-HASH-001: Replaced application bytes do not match the package.' }
        Write-AtomicText $script:SameVersionPayload.journal ($script:SameVersionPayload | ConvertTo-Json -Depth 6)
    }
    $script:SameVersionPayload.outcome = 'replaced'
    Write-AtomicText $script:SameVersionPayload.journal ($script:SameVersionPayload | ConvertTo-Json -Depth 6)
}

function Restore-CodeCodexSameVersionPayload {
    if (-not $script:SameVersionPayload -or $script:SameVersionPayload.outcome -eq 'same-bytes') { return }
    foreach ($item in $script:SameVersionPayload.items) {
        if (-not $item.replaced) { continue }
        $null = Assert-CodeCodexRoot (Split-Path -Parent $item.target)
        $null = Assert-CodeCodexRoot (Split-Path -Parent $item.backup)
        $current = Get-Sha256Hash $item.target
        if ($current -eq $item.oldSha256) { continue }
        if ($current -ne $item.newSha256 -or (Get-Sha256Hash $item.backup) -ne $item.oldSha256) { throw 'CC-INSTALL-PAYLOAD-ROLLBACK-CONFLICT-001: Application or backup bytes changed; automatic rollback refused.' }
        Copy-AtomicFile $item.backup $item.target
        if ((Get-Sha256Hash $item.target) -ne $item.oldSha256) { throw 'CC-INSTALL-PAYLOAD-ROLLBACK-HASH-001: Restored bytes could not be verified.' }
    }
    $script:SameVersionPayload.outcome = 'rolled-back'
    if ($script:SameVersionPayload.journal) { Write-AtomicText $script:SameVersionPayload.journal ($script:SameVersionPayload | ConvertTo-Json -Depth 6) }
}

$script:InstallRollbackPrepared = $false
