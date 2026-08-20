[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$QuartzRoot = Split-Path -Parent $PSScriptRoot
$WikiPath = "C:\Users\sungh\llm-wiki\wiki"
$HostAddress = "127.0.0.1"
$Port = 8080
$LogDirectory = Join-Path $env:LOCALAPPDATA "PersonalLLMWiki\logs\quartz"
$LogFile = Join-Path $LogDirectory ("quartz-{0}.log" -f (Get-Date -Format "yyyyMMdd"))
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$OutputLogFile = Join-Path $LogDirectory "quartz-$RunId.output.log"

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null

function Write-QuartzLog {
  param(
    [Parameter(Mandatory)]
    [string]$Message,
    [ValidateSet("INFO", "ERROR")]
    [string]$Level = "INFO"
  )

  Add-Content -LiteralPath $LogFile -Value ("{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message)
}

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

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
  $ownerProcessIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  $researchOsIsRunning = @($ownerProcessIds | Where-Object { Test-ResearchOsProcess -ProcessId $_ }).Count -eq $ownerProcessIds.Count

  if ($researchOsIsRunning) {
    Write-QuartzLog "Research OS already running on port $Port (PID: $($ownerProcessIds -join ', '))."
    exit 0
  }

  Write-QuartzLog -Level ERROR -Message "Port $Port is already in use by PID(s): $($ownerProcessIds -join ', '). Start aborted."
  exit 1
}

Write-QuartzLog "Starting Research OS on http://${HostAddress}:$Port (output: $OutputLogFile)."
Push-Location -LiteralPath $QuartzRoot
try {
  $npx = (Get-Command npx.cmd -ErrorAction Stop).Source
  & $npx quartz build --serve -d $WikiPath --host $HostAddress --port $Port 2>&1 | Out-File -LiteralPath $OutputLogFile -Encoding utf8
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Write-QuartzLog -Level ERROR -Message "Quartz exited with code $exitCode."
    exit $exitCode
  }

  Write-QuartzLog "Quartz exited normally."
} catch {
  Write-QuartzLog -Level ERROR -Message $_.Exception.Message
  exit 1
} finally {
  Pop-Location
}
