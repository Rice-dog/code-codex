$ErrorActionPreference='Stop'
$name=__TASK_NAME__
$marker=__MARKER__
$enable=__ENABLE__
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$name=$name+'-'+$sid.Replace('-','_')
$service=New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder=$service.GetFolder('\')
$prior=$null
try {$prior=$folder.GetTask($name)} catch {if ($_.Exception.HResult -ne -2147024894) {throw}}
if ($prior -and $prior.Definition.RegistrationInfo.Description -ne $marker) {throw 'HOST_UPDATE_TASK_OWNER: The task is not owned by this installation.'}
if (-not $enable) {if($prior){$folder.DeleteTask($name,0)};@{taskName=$name;enabled=$false}|ConvertTo-Json -Compress;exit 0}
throw 'HOST_UPDATE_STARTUP_ONLY: Periodic registration was retired.'
