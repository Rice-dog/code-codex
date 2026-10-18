function Test-SamePath([string]$Left, [string]$Right) {
    if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) {
        return $false
    }
    try {
        $leftFull = [IO.Path]::GetFullPath($Left).TrimEnd(
            [IO.Path]::DirectorySeparatorChar,
            [IO.Path]::AltDirectorySeparatorChar
        )
        $rightFull = [IO.Path]::GetFullPath($Right).TrimEnd(
            [IO.Path]::DirectorySeparatorChar,
            [IO.Path]::AltDirectorySeparatorChar
        )
        return $leftFull.Equals($rightFull, [StringComparison]::OrdinalIgnoreCase)
    }
    catch {
        return $false
    }
}