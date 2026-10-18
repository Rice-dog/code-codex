function Remove-ReparsePoint([IO.FileSystemInfo]$Item) {
    if ($Item.PSIsContainer) {
        [IO.Directory]::Delete($Item.FullName, $false)
    }
    else {
        [IO.File]::Delete($Item.FullName)
    }
}