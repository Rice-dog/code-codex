[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'installer/Uninstall-CodeCodex.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Uninstaller parse failed' }
$definition = $ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Remove-CodeCodexLoginStartup'}, $true)
if ($null -eq $definition) { throw 'Missing production login revocation helper' }
. ([scriptblock]::Create($definition.Extent.Text))
$checks = 0
function Check([bool]$Pass, [string]$Message) { if (-not $Pass) { throw $Message }; $script:checks++ }
$path = 'HKCU:\Software\CodeCodexTestFixtures\uninstall-login-' + [Guid]::NewGuid().ToString('N')
try {
    Remove-CodeCodexLoginStartup $path
    Check (-not (Test-Path -LiteralPath $path)) 'Absent key is not created by revocation'
    New-Item -Path $path -Force | Out-Null
    New-ItemProperty -LiteralPath $path -Name Codex -Value 'official sentinel' -PropertyType String | Out-Null
    New-ItemProperty -LiteralPath $path -Name CodeCodexLogin -Value 'fixture login command' -PropertyType String | Out-Null
    Remove-CodeCodexLoginStartup $path
    Check ($null -eq (Get-ItemProperty -LiteralPath $path).PSObject.Properties['CodeCodexLogin']) 'Production removal deletes the opt-in value'
    Check ((Get-ItemPropertyValue -LiteralPath $path -Name Codex) -ceq 'official sentinel') 'Official Codex setting is untouched'
    Remove-CodeCodexLoginStartup $path
    Check (Test-Path -LiteralPath $path) 'Idempotent revocation never deletes the shared Run key'
    New-ItemProperty -LiteralPath $path -Name CodeCodexLogin -Value 'fixture login command' -PropertyType String | Out-Null
    function Remove-ItemProperty { [CmdletBinding()]param($LiteralPath,$Name) throw 'Fixture registry access denied' }
    $failed = $false
    try { Remove-CodeCodexLoginStartup $path } catch { $failed = $_.Exception.Message -like '*Fixture registry access denied*' }
    Check $failed 'Revocation failure is not falsely reported as uninstall success'
    Check ((Get-ItemPropertyValue -LiteralPath $path -Name CodeCodexLogin) -ceq 'fixture login command') 'Failed revocation retains the previous entry'
    Remove-Item Function:\Remove-ItemProperty
    $install = [IO.File]::ReadAllText((Join-Path $repo 'installer/Install-CodeCodex.ps1'))
    Check ($install.Contains('Copy-AtomicFile $SourceShim (Join-Path $InstallRoot "CodeCodex.exe")')) 'Upgrade installs the stable pointer-resolving shim'
    Check (-not $install.Contains('-Name "CodeCodexLogin"')) 'Fresh install and upgrade cannot opt a user into startup'
    $assets = Get-Content -LiteralPath (Join-Path $repo 'resources/managed-assets.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Check ($assets.applicationEntries -contains 'CodeCodex.exe') 'Keep and Purge removal both own the stable launcher'
    Write-Host "Login startup installer: $checks checks passed; isolated registry only"
} finally {
    # Exact freshly created namespace, never the real Run key or application root.
    if ($path -notmatch '^HKCU:\\Software\\CodeCodexTestFixtures\\uninstall-login-[a-f0-9]{32}$') { throw 'Unsafe fixture cleanup target' }
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
}
