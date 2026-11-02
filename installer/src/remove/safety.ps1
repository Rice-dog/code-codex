function Assert-AllowedUninstallPath([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    if ($fullPath -ne $InstallFullPath -and
        -not $fullPath.StartsWith($InstallPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe uninstall path."
    }
}

{{managed-assets}}
function Get-CodeCodexVersionedRootLaunchers([string]$Root) {
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return }
    Get-ChildItem -LiteralPath $Root -Force | Where-Object {
        -not $_.PSIsContainer -and -not (Test-ReparsePoint $_) -and
        $_.Name -match '^CodeCodex-((0|[1-9][0-9]*)\.){2}(0|[1-9][0-9]*)\.exe$' -and $_.Name.Length -le 46
    } | ForEach-Object Name
}
function Remove-CodeCodexGeneratedIcons([string]$Root) {
    $full = [IO.Path]::GetFullPath($Root)
    Assert-AllowedUninstallPath $full
    foreach($name in $GeneratedIconEntries) { Remove-SafeTree (Join-Path $full $name) }
}
function Test-CodeCodexApplicationFiles([string]$Root) {
    foreach($name in (@($ApplicationEntries) + @(Get-CodeCodexVersionedRootLaunchers $Root))){if(Test-Path -LiteralPath (Join-Path $Root $name)){return $true}}
    return $false
}
function Test-CodeCodexRemovalComplete([string]$Root,[switch]$Purge) {
    # Read-only observation after the transaction has verified ownership. This
    # does not authorize deletion when the marker has gone missing.
    $full = Assert-CodeCodexRoot $Root
    if (Test-CodeCodexApplicationFiles $full) { return $false }
    if ($Purge) {
        foreach ($name in @('data','plugins','logs','temp','backups','storage-layout.json')) {
            if (Test-Path -LiteralPath (Join-Path $full $name)) { return $false }
        }
    }
    return $true
}
function Remove-CodeCodexEmptyRoot([string]$Root) {
    if ((Test-Path -LiteralPath $Root) -and @(Get-ChildItem -LiteralPath $Root -Force).Count -eq 0) {
        try { [IO.Directory]::Delete($Root,$false) }
        catch {
            $failure = $_
            $cause = $_.Exception
            while ($cause.InnerException) { $cause = $cause.InnerException }
            $win32 = $cause.HResult -band 0xffff
            # Another application's directory handle can outlive removal.
            # Only sharing/lock violations of a freshly verified EMPTY root
            # are non-fatal. Never relax file, permission or ownership checks.
            if ($cause -is [IO.IOException] -and $win32 -in @(32,33)) {
                $full = Assert-CodeCodexRoot $Root
                $item = Get-ExistingItem $full
                if ($item -and $item.PSIsContainer -and -not (Test-ReparsePoint $item) -and
                    @(Get-ChildItem -LiteralPath $full -Force -ErrorAction Stop).Count -eq 0) {
                    [Console]::Out.WriteLine("CC-UNINSTALL-ROOT-001: All selected files were removed; an empty installation folder remains in use by another process. Reinstallation into this empty folder is safe. path=$full; win32=$win32; cause=$($cause.Message)")
                    return
                }
            }
            throw $failure
        }
    }
}
function Remove-CodeCodexAccountCredentials([string]$Root) {
    $full = Assert-CodeCodexRoot $Root -Owned
    $accounts = Join-Path $full 'data\accounts'
    if (-not (Test-Path -LiteralPath $accounts)) { return }
    # Only the connection homes under this verified application root are eligible.
    # Never enumerate or read Windows credential values, or the official profile.
    foreach ($part in @('data','data\accounts')) {
        $item = Get-Item -LiteralPath (Join-Path $full $part) -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Account credential cleanup rejected a redirected directory.' }
    }
    if (-not ('CodeCodexAccountCredentialCleanup' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class CodeCodexAccountCredentialCleanup {
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    private static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    private static extern uint GetFinalPathNameByHandleW(SafeFileHandle file,StringBuilder path,uint length,uint flags);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    private static extern bool CredDeleteW(string target,uint kind,uint flags);
    public static string Target(string home,string root) {
        using(var handle=CreateFileW(home,0,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
            if(handle.IsInvalid)throw new IOException("Opening the owned account home failed.",Marshal.GetLastWin32Error());
            var path=new StringBuilder(32768);
            var length=GetFinalPathNameByHandleW(handle,path,(uint)path.Capacity,0);
            if(length==0||length>=path.Capacity)throw new IOException("Resolving the owned account home failed.");
            var canonical=path.ToString();
            var expected="\\\\?\\"+Path.GetFullPath(home).TrimEnd('\\');
            var boundary="\\\\?\\"+Path.GetFullPath(root).TrimEnd('\\')+"\\data\\accounts\\";
            if(!canonical.Equals(expected,StringComparison.OrdinalIgnoreCase)||!canonical.StartsWith(boundary,StringComparison.OrdinalIgnoreCase))throw new IOException("Account credential home escaped the verified application root.");
            using(var hash=SHA256.Create()) {
                var digest=hash.ComputeHash(Encoding.UTF8.GetBytes(path.ToString()));
                return "cli|"+BitConverter.ToString(digest).Replace("-","").ToLowerInvariant().Substring(0,16)+".Codex Auth";
            }
        }
    }
    public static void Delete(string home,string root) {
        var legacy=Target(home,root);
        var sealedStore="secrets|"+legacy.Substring(4,16)+".codex";
        foreach(var target in new[]{legacy,sealedStore}) {
            if(!CredDeleteW(target,1,0)) {
                var code=Marshal.GetLastWin32Error();
                if(code!=1168)throw new IOException("Deleting an owned account credential failed.",code);
            }
        }
    }
}
'@
    }
    $count = 0
    foreach ($owner in Get-ChildItem -LiteralPath $accounts -Force) {
        if ($owner.Name -notmatch '^[a-f0-9]{64}$') { continue }
        if (-not $owner.PSIsContainer -or ($owner.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Account credential cleanup rejected a redirected owner.' }
        foreach ($connection in Get-ChildItem -LiteralPath $owner.FullName -Force) {
            if ($connection.Name -notmatch '^[a-f0-9]{32}$') { continue }
            if (-not $connection.PSIsContainer -or ($connection.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Account credential cleanup rejected a redirected connection.' }
            $count++
            if ($count -gt 4096) { throw 'Account credential cleanup exceeded its bounded home count.' }
            [CodeCodexAccountCredentialCleanup]::Delete($connection.FullName,$full)
        }
    }
}
function Remove-CodeCodexApplicationFiles([string]$Root,[switch]$Purge) {
    $full = Assert-CodeCodexRoot $Root -Owned
    if($Purge){Remove-CodeCodexAccountCredentials $full}
    $names = @($ApplicationEntries) + @(Get-CodeCodexVersionedRootLaunchers $Root)
    if($Purge){$names+=@('data','plugins','logs','temp','backups')}
    foreach($name in $names){
        $target=[IO.Path]::GetFullPath((Join-Path $full $name))
        if(-not $target.StartsWith($full+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Removal target escaped the application root.'}
        Remove-SafeTree $target
    }
    if($Purge){ Remove-SafeTree (Join-Path $full 'storage-layout.json') }
    try { Remove-CodeCodexEmptyRoot $full }
    catch {
        # A late directory failure must not destroy the authorization needed
        # for a subsequent retry. Revalidate ancestors; never follow a replaced
        # root or overwrite a marker created by another process.
        $originalFailure = $_
        if ($Purge) {
            try {
                $null = Assert-CodeCodexRoot $full
                if (Test-Path -LiteralPath $full -PathType Container) {
                    $marker = Join-Path $full 'storage-layout.json'
                    $stream = [IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                    try {
                        $bytes = [Text.Encoding]::UTF8.GetBytes('{"schema":1,"product":"Code-Codex","layout":"centralized"}')
                        $stream.Write($bytes,0,$bytes.Length)
                    } finally { $stream.Dispose() }
                }
            } catch {
                throw "Empty-root cleanup failed: $($originalFailure.Exception.Message); ownership marker recovery failed: $($_.Exception.Message)"
            }
        }
        throw $originalFailure
    }
}

function Remove-SafeTree([string]$Root) {
    $rootFull = [IO.Path]::GetFullPath($Root)
    Assert-AllowedUninstallPath $rootFull
    $rootItem = Get-ExistingItem $rootFull
    if ($null -eq $rootItem) { return }
    if (Test-ReparsePoint $rootItem) {
        Remove-ReparsePoint $rootItem
        return
    }
    if (-not $rootItem.PSIsContainer) {
        $rootItem.Attributes = [IO.FileAttributes]::Normal
        [IO.File]::Delete($rootFull)
        return
    }

    $prefix = $rootFull.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    foreach ($child in @(Get-ChildItem -LiteralPath $rootFull -Force)) {
        $childFull = [IO.Path]::GetFullPath($child.FullName)
        if (-not $childFull.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
            -not $childFull.StartsWith($InstallPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unsafe uninstall child path."
        }
        $currentChild = Get-Item -LiteralPath $childFull -Force
        if (Test-ReparsePoint $currentChild) {
            Remove-ReparsePoint $currentChild
        }
        elseif (-not $currentChild.PSIsContainer) {
            $currentChild.Attributes = [IO.FileAttributes]::Normal
            [IO.File]::Delete($childFull)
        }
        else {
            Remove-SafeTree $childFull
        }
    }

    $verifiedRoot = Get-ExistingItem $rootFull
    if ($null -eq $verifiedRoot) { return }
    if (Test-ReparsePoint $verifiedRoot) {
        Remove-ReparsePoint $verifiedRoot
        return
    }
    if (-not $verifiedRoot.PSIsContainer -or @(Get-ChildItem -LiteralPath $rootFull -Force).Count -ne 0) {
        throw "The uninstall directory changed while it was being removed."
    }
    [IO.Directory]::Delete($rootFull, $false)
}

function Wait-ForProcessExit([int]$ProcessId, [string]$Description, [object]$Dialog) {
    if ($ProcessId -le 0) { return }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ($null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        if ([DateTime]::UtcNow -ge $deadline) {
            throw "$Description did not exit before the uninstall timeout."
        }
        Invoke-UninstallProgressEvents $Dialog
        Start-Sleep -Milliseconds 100
    }
}
