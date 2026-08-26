[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$TaskName = "Personal LLM Wiki - Research OS"
$StartScript = Join-Path $PSScriptRoot "start-research-os.ps1"
$HiddenPowerShellWrapper = Join-Path $PSScriptRoot "invoke-hidden-powershell.vbs"
$WScript = Join-Path $env:SystemRoot "System32\wscript.exe"
$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath $HiddenPowerShellWrapper -PathType Leaf)) {
  throw "Hidden PowerShell wrapper is missing: $HiddenPowerShellWrapper"
}

$action = New-ScheduledTaskAction -Execute $WScript -Argument "//B `"$HiddenPowerShellWrapper`" `"$StartScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output "Installed scheduled task: $TaskName"
