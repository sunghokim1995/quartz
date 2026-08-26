[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateSet("Start", "Stop", "Status")]
  [string]$Command
)

$ErrorActionPreference = "Stop"

$TaskName = "Personal LLM Wiki - Research OS"
$Port = 8080
$StartScript = Join-Path $PSScriptRoot "start-research-os.ps1"
$LogDirectory = Join-Path $env:LOCALAPPDATA "PersonalLLMWiki\logs\quartz"

function Test-ResearchOsProcess {
  param([Parameter(Mandatory)][int]$ProcessId)

  $visited = @{}
  $currentProcessId = $ProcessId
  while ($currentProcessId -and -not $visited.ContainsKey($currentProcessId)) {
    $visited[$currentProcessId] = $true
    $process = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $currentProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
      return $false
    }

    if ($process.CommandLine -match "(?i)start-research-os\.ps1|llm-wiki-quartz|quartz.*build.*--serve.*C:\\Users\\sungh\\llm-wiki\\wiki.*--host 127\.0\.0\.1") {
      return $true
    }

    $currentProcessId = [int]$process.ParentProcessId
  }

  return $false
}

function Get-ResearchOsListeners {
  @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object {
    Test-ResearchOsProcess -ProcessId $_.OwningProcess
  })
}

function Get-ResearchOsTask {
  Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

switch ($Command) {
  "Start" {
    $listeners = @(Get-ResearchOsListeners)
    if ($listeners.Count -gt 0) {
      Write-Output "Research OS is already running (PID: $((@($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) -join ', '))."
      exit 0
    }

    $task = Get-ResearchOsTask
    if ($task) {
      Start-ScheduledTask -TaskName $TaskName
      Write-Output "Started scheduled task: $TaskName"
    } else {
      $hiddenPowerShellWrapper = Join-Path $PSScriptRoot "invoke-hidden-powershell.vbs"
      if (-not (Test-Path -LiteralPath $hiddenPowerShellWrapper -PathType Leaf)) {
        throw "Hidden PowerShell wrapper is missing: $hiddenPowerShellWrapper"
      }
      $wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
      Start-Process -FilePath $wscript -ArgumentList "//B `"$hiddenPowerShellWrapper`" `"$StartScript`"" -WindowStyle Hidden | Out-Null
      Write-Output "Started Research OS in the background."
    }
  }
  "Stop" {
    $task = Get-ResearchOsTask
    if ($task -and $task.State -eq "Running") {
      Stop-ScheduledTask -TaskName $TaskName
    }

    $listeners = @(Get-ResearchOsListeners)
    $ownerProcessIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($ownerProcessId in $ownerProcessIds) {
      Stop-Process -Id $ownerProcessId -ErrorAction Stop
    }

    if ($ownerProcessIds.Count -gt 0) {
      Write-Output "Stopped Research OS (PID: $($ownerProcessIds -join ', '))."
    } else {
      Write-Output "Research OS is not running."
    }
  }
  "Status" {
    $listeners = @(Get-ResearchOsListeners)
    $ownerProcessIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    $httpStatus = "Not listening"
    if ($listeners.Count -gt 0) {
      try {
        $httpStatus = "HTTP $((Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5).StatusCode)"
      } catch {
        $httpStatus = "HTTP check failed: $($_.Exception.Message)"
      }
    }

    $task = Get-ResearchOsTask
    $latestLog = Get-ChildItem -LiteralPath $LogDirectory -Filter "quartz-*.output.log" -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName

    [pscustomobject]@{
      Listening = $listeners.Count -gt 0
      ProcessId = $ownerProcessIds -join ", "
      HttpStatus = $httpStatus
      ScheduledTask = if ($task) { $task.State } else { "Not installed" }
      LatestLog = $latestLog
    } | Format-List
  }
}
