$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot 'invoke-onboarding.ps1') @args
exit $LASTEXITCODE
exit $LASTEXITCODE
