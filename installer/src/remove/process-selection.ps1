function Test-CodeCodexParentEdge([object]$Parent, [object]$Child) {
    return $null -ne $Parent -and $null -ne $Child -and
        $null -ne $Parent.CreationDate -and $null -ne $Child.CreationDate -and
        [uint32]$Parent.ProcessId -eq [uint32]$Child.ParentProcessId -and
        $Parent.CreationDate -le $Child.CreationDate
}

function Get-CodeCodexRemovalProtection([object[]]$Snapshot, [uint32]$WorkerId) {
    # The menu launches this wizard from the very core we need to stop. Protect
    # the removal branch, including the sibling UI, before walking that tree.
    # No renderer-supplied PID or environment flag can grant this exclusion.
    $byId = @{}
    foreach ($entry in $Snapshot) {
        $id = [uint32]$entry.ProcessId
        if ($byId.ContainsKey($id)) { throw 'CC-UNINSTALL-PROCESS-001: duplicate process identity in removal snapshot.' }
        $byId[$id] = $entry
    }
    $current = $byId[$WorkerId]
    if ($null -eq $current -or $null -eq $current.CreationDate) {
        throw 'CC-UNINSTALL-PROCESS-001: the removal worker identity is unavailable; shutdown was not started.'
    }
    $roots = @($WorkerId)
    $visited = @{}
    while ($null -ne $current -and -not $visited.ContainsKey([uint32]$current.ProcessId)) {
        $visited[[uint32]$current.ProcessId] = $true
        if ([string]$current.Name -ieq 'Uninstall-CodeCodex.exe') { $roots += [uint32]$current.ProcessId }
        $parent = $byId[[uint32]$current.ParentProcessId]
        if (-not (Test-CodeCodexParentEdge $parent $current)) { break }
        $current = $parent
    }
    $protected = @{}
    $frontier = @($roots | Sort-Object -Unique)
    foreach ($id in $frontier) { $protected[[uint32]$id] = $true }
    while ($frontier.Count -gt 0) {
        $next = @()
        foreach ($entry in $Snapshot) {
            $id = [uint32]$entry.ProcessId
            $parentId = [uint32]$entry.ParentProcessId
            if (-not $protected.ContainsKey($id) -and $parentId -in $frontier -and
                (Test-CodeCodexParentEdge $byId[$parentId] $entry)) {
                $protected[$id] = $true
                $next += $id
            }
        }
        $frontier = $next
    }
    return $protected
}

function Get-CodeCodexOwnedDescendants([object[]]$Snapshot, [object[]]$Running, [hashtable]$Protected) {
    $byId = @{}
    foreach ($entry in $Snapshot) { $byId[[uint32]$entry.ProcessId] = $entry }
    $seen = @{}
    $frontier = @($Running | ForEach-Object { [uint32]$_.ProcessId })
    foreach ($id in $frontier) { $seen[$id] = $true }
    $depth = 1
    while ($frontier.Count -gt 0 -and $depth -le 32) {
        $next = @()
        foreach ($entry in $Snapshot) {
            $id = [uint32]$entry.ProcessId
            $parentId = [uint32]$entry.ParentProcessId
            if ($Protected.ContainsKey($id) -or $seen.ContainsKey($id) -or $parentId -notin $frontier -or
                -not (Test-CodeCodexParentEdge $byId[$parentId] $entry)) { continue }
            $seen[$id] = $true
            $next += $id
            $path = $null
            if (-not [string]::IsNullOrWhiteSpace([string]$entry.ExecutablePath)) {
                try { $path = [IO.Path]::GetFullPath([string]$entry.ExecutablePath) } catch {}
            }
            [pscustomobject]@{
                ProcessId = $id; Name = [string]$entry.Name; ExecutablePath = $path
                CreationDate = $entry.CreationDate; Depth = $depth
            }
        }
        $frontier = $next
        $depth++
    }
}
