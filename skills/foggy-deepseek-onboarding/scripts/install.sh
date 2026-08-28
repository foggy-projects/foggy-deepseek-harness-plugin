#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_COMMAND="${FOGGY_ONBOARDING_PYTHON:-python3}"
exec "$PYTHON_COMMAND" "$SCRIPT_DIR/onboarding.py" install "$@"
