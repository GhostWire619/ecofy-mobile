$defaultUrl = "http://127.0.0.1:8021/api/openapi.json"
$openApiUrl = if ($env:ECOFY_BACKEND_OPENAPI_URL) { $env:ECOFY_BACKEND_OPENAPI_URL } else { $defaultUrl }

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDirectory = Resolve-Path (Join-Path $scriptRoot "..") | ForEach-Object {
    Join-Path $_.Path "openapi"
}
$outputFile = Join-Path $outputDirectory "ecofy-backend-openapi.json"

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

Write-Host "Exporting OpenAPI schema from $openApiUrl"
Invoke-WebRequest -Uri $openApiUrl -OutFile $outputFile
Write-Host "OpenAPI schema saved to $outputFile"
