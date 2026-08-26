[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$QuartzRoot = Split-Path -Parent $PSScriptRoot
$ResearchOsConfig = Join-Path $env:LOCALAPPDATA "PersonalLLMWiki\http-mcp\config.json"
if (Test-Path -LiteralPath $ResearchOsConfig -PathType Leaf) {
  $researchOs = Get-Content -LiteralPath $ResearchOsConfig -Raw | ConvertFrom-Json
  foreach ($name in @("RESEARCH_OS_MODE", "RESEARCH_OS_VAULT_ROOT", "RESEARCH_OS_RUNTIME_ROOT", "RESEARCH_OS_DATA_ROOT", "RESEARCH_OS_HOME", "RESEARCH_OS_CODE_ROOT")) {
    if ($researchOs.PSObject.Properties[$name] -and "$($researchOs.$name)".Trim()) {
      Set-Item -Path "Env:$name" -Value "$($researchOs.$name)".Trim()
    }
  }
  if ($env:RESEARCH_OS_MODE -eq "greenfield") {
    Remove-Item Env:LLM_WIKI_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:LLM_WIKI_DB_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:RESEARCH_DB_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:RESEARCH_OS_ALLOW_CREATE_DATABASE -ErrorAction SilentlyContinue
  }
}
$CodeRoot = if ($env:RESEARCH_OS_CODE_ROOT) { $env:RESEARCH_OS_CODE_ROOT } else { "C:\Users\sungh\llm-wiki" }
$Resolver = Join-Path $CodeRoot "scripts\resolve-research-os-paths.mjs"
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

if (-not (Test-Path -LiteralPath $Resolver -PathType Leaf)) {
  Write-QuartzLog -Level ERROR -Message "ResearchOS path resolver not found: $Resolver"
  throw "ResearchOS path resolver not found: $Resolver"
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$resolvedJson = & $node $Resolver --require-vault
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($resolvedJson)) {
  Write-QuartzLog -Level ERROR -Message "ResearchOS path resolution failed: $resolvedJson"
  throw "ResearchOS path resolution failed"
}

$resolved = $resolvedJson | ConvertFrom-Json
$WikiPath = [string]$resolved.quartzContentRoot
if ([string]::IsNullOrWhiteSpace($WikiPath)) {
  $WikiPath = [string]$resolved.vaultRoot
}
if ([string]::IsNullOrWhiteSpace($WikiPath) -or -not (Test-Path -LiteralPath $WikiPath -PathType Container)) {
  Write-QuartzLog -Level ERROR -Message "Resolved Quartz content root is missing: $WikiPath"
  throw "Resolved Quartz content root is missing: $WikiPath"
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

    if ($process.CommandLine -match "(?i)start-research-os\.ps1|llm-wiki-quartz|quartz\\bootstrap-cli\.mjs build --serve") {
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

Write-QuartzLog "Starting Research OS on http://${HostAddress}:$Port mode=$($resolved.mode) vault=$WikiPath (output: $OutputLogFile)."
Push-Location -LiteralPath $QuartzRoot
try {
  $QuartzCli = Join-Path $QuartzRoot "quartz\bootstrap-cli.mjs"
  if (-not (Test-Path -LiteralPath $QuartzCli -PathType Leaf)) {
    throw "Quartz CLI not found: $QuartzCli"
  }

  & $node $QuartzCli build --serve -d $WikiPath --host $HostAddress --port $Port 2>&1 | Out-File -LiteralPath $OutputLogFile -Encoding utf8
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
