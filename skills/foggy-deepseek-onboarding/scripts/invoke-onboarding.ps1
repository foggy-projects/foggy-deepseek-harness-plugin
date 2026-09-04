param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$OnboardingArgs
)

$pythonCommand = $env:FOGGY_ONBOARDING_PYTHON
if (-not $pythonCommand) {
    $installRoot = if ($env:FOGGY_INSTALL_ROOT) {
        $env:FOGGY_INSTALL_ROOT
    } elseif ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA 'Foggy\DeepSeekHarness'
    }
    if ($installRoot) {
        $statePath = Join-Path $installRoot 'install-state.json'
        if (Test-Path -LiteralPath $statePath) {
            try {
                $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
                $pythonCommand = $state.python.command
            } catch {}
        }
    }
}

if (-not $pythonCommand -or -not (Test-Path -LiteralPath $pythonCommand)) {
    Write-Error 'Foggy private Python is unavailable. Initialize or repair it in DeepSeek Harness plugin settings, or set FOGGY_ONBOARDING_PYTHON explicitly.'
    exit 1
}

$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
& $pythonCommand (Join-Path $PSScriptRoot 'onboarding.py') @OnboardingArgs
exit $LASTEXITCODE
