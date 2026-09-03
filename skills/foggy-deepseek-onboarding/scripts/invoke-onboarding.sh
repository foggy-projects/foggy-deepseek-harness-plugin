#!/usr/bin/env bash
set -euo pipefail

python_command="${FOGGY_ONBOARDING_PYTHON:-}"
if [[ -z "$python_command" ]]; then
  if [[ -n "${FOGGY_INSTALL_ROOT:-}" ]]; then
    install_root="$FOGGY_INSTALL_ROOT"
  elif [[ -n "${XDG_DATA_HOME:-}" ]]; then
    install_root="$XDG_DATA_HOME/foggy/deepseek-harness"
  else
    install_root="$HOME/.local/share/foggy/deepseek-harness"
  fi
  state_path="$install_root/install-state.json"
  if [[ -f "$state_path" ]]; then
    python_command="$(node -e 'const fs=require("node:fs"); const state=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(state.python?.command || "")' "$state_path")"
  fi
fi

if [[ -z "$python_command" || ! -x "$python_command" ]]; then
  echo 'Foggy private Python is unavailable. Initialize or repair it in DeepSeek Harness plugin settings, or set FOGGY_ONBOARDING_PYTHON explicitly.' >&2
  exit 1
fi

exec "$python_command" "$(dirname "$0")/onboarding.py" "$@"
