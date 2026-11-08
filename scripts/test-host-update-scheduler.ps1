$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$template=Get-Content -LiteralPath (Join-Path $repo 'crates/launcher/src/host_updates/scheduler.ps1') -Raw
$name='Code-Codex-HostUpdates-Acceptance-'+[Guid]::NewGuid().ToString('N')
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$actualName=$name+'-'+$sid.Replace('-','_')
$marker='Code-Codex isolated scheduler acceptance'
$ps=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$folderPath=Join-Path $env:TEMP ('CodeCodex-HostUpdate-Test-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $folderPath
$script=Join-Path $folderPath 'scheduler.ps1'
$service=New-Object -ComObject 'Schedule.Service';$service.Connect();$folder=$service.GetFolder('\')
$checks=New-Object 'System.Collections.Generic.List[string]'
function Invoke-Fixture([bool]$enable,[string]$owner=$marker){
    $text=$template.Replace('__TASK_NAME__',("'"+$name+"'")).Replace('__MARKER__',("'"+$owner+"'")).Replace('__ENABLE__',$(if($enable){'$true'}else{'$false'}))
    [IO.File]::WriteAllText($script,$text,[Text.UTF8Encoding]::new($false))
    $process=Start-Process -FilePath $ps -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$script+'"')) -WindowStyle Hidden -Wait -PassThru
    return $process.ExitCode
}
try {
    if((Invoke-Fixture $true) -eq 0){throw 'Retired periodic registration must be rejected'}
    $checks.Add('Retired periodic registration is rejected')
    $definition=$service.NewTask(0);$definition.RegistrationInfo.Description=$marker;$definition.Principal.UserId=$sid;$definition.Principal.LogonType=3;$definition.Principal.RunLevel=0
    $definition.Settings.Enabled=$true;$definition.Settings.Hidden=$true
    $action=$definition.Actions.Create(0);$action.Path=$ps;$action.Arguments='-NoProfile -WindowStyle Hidden -Command exit 0'
    $null=$folder.RegisterTaskDefinition($actualName,$definition,6,$null,$null,3,$null)
    if((Invoke-Fixture $false 'foreign-owner') -eq 0){throw 'Foreign task must not be deleted'}
    if($folder.GetTask($actualName).Definition.RegistrationInfo.Description -ne $marker){throw 'Foreign rejection changed task'}
    $checks.Add('Foreign ownership refuses removal and preserves task')
    if((Invoke-Fixture $false) -ne 0){throw 'Owned removal failed'}
    $absent=$false;try{$null=$folder.GetTask($actualName)}catch{if($_.Exception.HResult -eq -2147024894){$absent=$true}else{throw}}
    if(-not $absent){throw 'Task still registered'}
    $checks.Add('Exact prior periodic task is removed without touching other tasks')
    if((Invoke-Fixture $false) -ne 0){throw 'Absent migration must succeed'}
    $checks.Add('Repeated migration with no old task is harmless')
    @{passed=$true;checks=@($checks);scope='Real Task Scheduler with unique isolated no-op task; production task and application settings unchanged.'}|ConvertTo-Json -Depth 5
} finally {
    try{$remaining=$folder.GetTask($actualName);if($remaining.Definition.RegistrationInfo.Description -eq $marker){$folder.DeleteTask($actualName,0)}}catch{}
    # Only two known fixture files are removed; no recursive deletion.
    if(Test-Path -LiteralPath $script){Remove-Item -LiteralPath $script -Force}
    Remove-Item -LiteralPath $folderPath -Force
}
