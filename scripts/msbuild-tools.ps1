function Get-CodexMsBuildPath {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) {
        throw "Visual Studio Installer's vswhere.exe was not found."
    }

    $installationPaths = @(
        & $vswhere `
            -latest `
            -products * `
            -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
            -property installationPath
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to query Visual Studio Build Tools."
    }
    $installationPath = $installationPaths |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($installationPath)) {
        throw "Visual Studio Build Tools with Desktop C++ were not found."
    }

    $msbuild = Join-Path $installationPath "MSBuild\Current\Bin\MSBuild.exe"
    if (-not (Test-Path -LiteralPath $msbuild -PathType Leaf)) {
        throw "MSBuild was not found in the selected Visual Studio installation: $msbuild"
    }
    return [IO.Path]::GetFullPath($msbuild)
}
