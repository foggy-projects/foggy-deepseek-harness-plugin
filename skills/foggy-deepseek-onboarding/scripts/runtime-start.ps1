$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot 'invoke-onboarding.ps1') runtime-start @args
exit $LASTEXITCODE
exit $LASTEXITCODE
