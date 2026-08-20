[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$TaskName = "Personal LLM Wiki - Research OS"
$StartScript = Join-Path $PSScriptRoot "start-research-os.ps1"
$PowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$action = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output "Installed scheduled task: $TaskName"
