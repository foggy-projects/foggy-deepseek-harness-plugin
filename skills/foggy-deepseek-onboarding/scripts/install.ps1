$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot 'invoke-onboarding.ps1') install @args
exit $LASTEXITCODE
exit $LASTEXITCODE
