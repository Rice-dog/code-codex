# SPDX-License-Identifier: GPL-3.0-or-later
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SourceRoot,
    [Parameter(Mandatory=$true)][string]$VcpkgRoot,
    [Parameter(Mandatory=$true)][string]$BuildRoot,
    [string]$BuildTreesRoot,
    [string]$DownloadsRoot,
    [string]$BinaryCacheRoot,
    [string]$OutputRoot = (Join-Path $PSScriptRoot '../../artifacts/lan-remote-native'),
    [switch]$PrepareSource,
    [switch]$BuildOnly
)
$ErrorActionPreference='Stop'
$inputNames=@('CMakeLists.txt','project-hook.cmake','host.cc','viewer.cc','viewer-main.cc','room.cc','room_state.h','prepare-aspia.py','build.ps1','COPYING')
$inputHashes=@{}
foreach($name in $inputNames){$inputHashes[$name]=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant()}
# SourceRoot must be a disposable Aspia v3.3.5 copy, never an installed app.
# Pin its vcpkg4aspia checkout to 3bfb0ca0945f72f6af254a75541daa3764a47145.
if ($PrepareSource) {
    & python (Join-Path $PSScriptRoot 'prepare-aspia.py') $SourceRoot
    if ($LASTEXITCODE -ne 0) { throw 'REMOTE_BUILD_SOURCE: Source preparation failed.' }
}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'REMOTE_BUILD_TOOLS: MSVC x64 build tools were not found.' }
$cmake=Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$ninja=Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja'
$batch=Join-Path ([IO.Path]::GetFullPath($BuildRoot)) 'build-native.cmd'
New-Item -ItemType Directory -Path $BuildRoot,$OutputRoot -Force | Out-Null
# Fixed commands/paths only. Quoted paths cannot contain cmd expansion characters.
foreach($path in @($SourceRoot,$VcpkgRoot,$BuildRoot,$OutputRoot,$PSScriptRoot,$BuildTreesRoot,$DownloadsRoot,$BinaryCacheRoot,$vs)) {
    if($path -match '["%\r\n&|<>^!]') { throw 'REMOTE_BUILD_PATH: Unsupported command-shell path characters.' }
}
$shortOption=if($BuildTreesRoot){'-DVCPKG_INSTALL_OPTIONS=--x-buildtrees-root='+$BuildTreesRoot}else{''}
$hook=Join-Path $PSScriptRoot 'project-hook.cmake'
$configure=if($BuildOnly){
    if(!(Test-Path -LiteralPath (Join-Path $BuildRoot 'CMakeCache.txt'))){throw 'REMOTE_BUILD_CACHE: Configure the native build first.'}
    ''
}else{'"'+$cmake+'" -S "'+$SourceRoot+'" -B "'+$BuildRoot+'" -G Ninja -DCMAKE_BUILD_TYPE=Release "-DCMAKE_TOOLCHAIN_FILE='+$VcpkgRoot+'/scripts/buildsystems/vcpkg.cmake" -DVCPKG_TARGET_TRIPLET=x64-windows-static -DVCPKG_HOST_TRIPLET=x64-windows-static "-DCMAKE_PROJECT_aspia_INCLUDE='+$hook+'" "'+$shortOption+'"'}
$cacheEnvironment=@()
if($DownloadsRoot){$cacheEnvironment+='set "VCPKG_DOWNLOADS='+$DownloadsRoot+'"'}
if($BinaryCacheRoot){$cacheEnvironment+='set "VCPKG_DEFAULT_BINARY_CACHE='+$BinaryCacheRoot+'"'}
@"
@echo off
call "$vs\VC\Auxiliary\Build\vcvars64.bat"
set "VCPKG_ROOT=$VcpkgRoot"
set "VCPKG_INSTALLED_DIR=$BuildRoot/vcpkg_installed"
set "VCPKG_MAX_CONCURRENCY=6"
$($cacheEnvironment -join "`r`n")
set "PATH=$ninja;%PATH%"
$configure
if errorlevel 1 exit /b 1
"$cmake" --build "$BuildRoot" --target code_codex_lan_remote code_codex_remote_viewer --parallel 6
exit /b %errorlevel%
"@ | Set-Content -LiteralPath $batch -Encoding ASCII
& cmd.exe /d /c $batch
if($LASTEXITCODE -ne 0){throw 'REMOTE_BUILD_FAILED: Inspect the native build log.'}
Copy-Item -LiteralPath (Join-Path $BuildRoot 'code_codex_lan_remote.exe') -Destination (Join-Path $OutputRoot 'code_codex_lan_remote.exe') -Force
Copy-Item -LiteralPath (Join-Path $BuildRoot 'code_codex_remote_viewer.exe') -Destination (Join-Path $OutputRoot 'code_codex_remote_viewer.exe') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'COPYING') -Destination $OutputRoot -Force
foreach($name in $inputNames){if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $inputHashes[$name]){throw 'REMOTE_BUILD_INPUT_CHANGED: Source changed while compiling; no receipt was issued.'}}
$binary=Get-Item -LiteralPath (Join-Path $OutputRoot 'code_codex_lan_remote.exe')
$viewer=Get-Item -LiteralPath (Join-Path $OutputRoot 'code_codex_remote_viewer.exe')
@{schema=1;upstream='dchapyshev/aspia@v3.3.5';upstreamArchiveSha256='25e3503fe191d4d75cdc6d799d8bcda29e4f6acf78028d77e73532886816ce23';vcpkgCommit='3bfb0ca0945f72f6af254a75541daa3764a47145';inputs=$inputHashes;size=$binary.Length;sha256=(Get-FileHash -LiteralPath $binary.FullName -Algorithm SHA256).Hash.ToLowerInvariant();viewer=@{size=$viewer.Length;sha256=(Get-FileHash -LiteralPath $viewer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputRoot 'build-manifest.json') -Encoding UTF8
