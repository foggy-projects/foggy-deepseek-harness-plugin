$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot 'invoke-onboarding.ps1') runtime-stop @args
exit $LASTEXITCODE
exit $LASTEXITCODE
