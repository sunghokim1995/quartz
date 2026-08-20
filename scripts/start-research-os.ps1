$ErrorActionPreference = "Stop"

$QuartzRoot = Split-Path -Parent $PSScriptRoot
$WikiPath = "C:\Users\sungh\llm-wiki\wiki"

Set-Location -LiteralPath $QuartzRoot
Write-Host "Research OS: http://localhost:8080"

& npx quartz build --serve -d $WikiPath --host 127.0.0.1 --port 8080
