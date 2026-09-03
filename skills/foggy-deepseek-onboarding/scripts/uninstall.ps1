$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot 'invoke-onboarding.ps1') uninstall @args
exit $LASTEXITCODE
exit $LASTEXITCODE
