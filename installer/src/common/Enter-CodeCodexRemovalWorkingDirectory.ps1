function Enter-CodeCodexRemovalWorkingDirectory([string]$Root,[string]$Role) {
    # PowerShell's provider location and the process's Win32 current directory
    # are independent. Both can keep an otherwise empty installation in use.
    $external = [IO.Path]::GetFullPath([Environment]::GetFolderPath([Environment+SpecialFolder]::System))
    $owned = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
    if ($external.Equals($owned,[StringComparison]::OrdinalIgnoreCase) -or
        $external.StartsWith($owned+'\',[StringComparison]::OrdinalIgnoreCase)) {
        throw 'CC-UNINSTALL-CWD-001: A working directory outside the installation is required.'
    }
    Set-Location -LiteralPath $external -ErrorAction Stop
    [Environment]::CurrentDirectory = $external
    [Console]::Out.WriteLine("CC-UNINSTALL-CWD-000: role=$Role; pid=$PID; provider=$((Get-Location).Path); process=$([Environment]::CurrentDirectory)")
}
