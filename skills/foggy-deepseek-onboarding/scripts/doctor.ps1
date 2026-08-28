$ErrorActionPreference = "Stop"
$pythonCommand = if ($env:FOGGY_ONBOARDING_PYTHON) { $env:FOGGY_ONBOARDING_PYTHON } else { "python" }
& $pythonCommand (Join-Path $PSScriptRoot "onboarding.py") doctor @args
exit $LASTEXITCODE
