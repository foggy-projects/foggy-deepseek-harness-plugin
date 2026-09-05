#!/usr/bin/env bash
set -euo pipefail

DSH_VERSION="0.1.2-rc.1"
PNPM_VERSION="11.7.0"
PLUGIN_VERSION="0.4.0-beta.17"
PLUGIN_REF="v${PLUGIN_VERSION}"
PLUGIN_REPOSITORY="https://github.com/foggy-projects/foggy-deepseek-harness-plugin.git"

experience_root="${HOME}/.local/share/foggy-deepseek-harness-experience"
project_root="${HOME}/foggy-deepseek-experience-workspace"
dry_run=0

usage() {
  cat <<'EOF'
Usage: prepare.sh [options]

Options:
  --experience-root PATH  DSH and plugin installation root under the Linux-native filesystem
  --project-root PATH     Workspace that receives Foggy Skills and onboarding artifacts
  --dry-run               Validate prerequisites and print the plan without changing files
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --experience-root)
      [[ $# -ge 2 ]] || { echo "--experience-root requires a value" >&2; exit 2; }
      experience_root="$2"
      shift 2
      ;;
    --project-root)
      [[ $# -ge 2 ]] || { echo "--project-root requires a value" >&2; exit 2; }
      project_root="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

fail() {
  echo "Foggy Linux experience preflight failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

[[ "$(uname -s)" == "Linux" ]] || fail "this entry supports Linux and WSL2 only"
case "$(uname -m)" in
  x86_64|amd64|aarch64|arm64) ;;
  *) fail "supported architectures are x86_64 and arm64; detected $(uname -m)" ;;
esac

require_command node
require_command npm
require_command java
require_command git
require_command df
require_command tar

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 22 && minor >= 19) || major >= 24)) process.exit(1)' \
  || fail "Node ^22.19.0 or >=24 required; detected $(node --version 2>/dev/null || echo unknown)"

java_major="$(java -version 2>&1 | awk -F'[\".]' '/version/ { print $2; exit }')"
[[ "$java_major" =~ ^[0-9]+$ ]] || fail "could not detect Java version"
(( java_major >= 17 )) || fail "Java 17+ required; detected major version $java_major"

case "$experience_root" in
  /*) ;;
  *) fail "--experience-root must be an absolute path" ;;
esac
case "$project_root" in
  /*) ;;
  *) fail "--project-root must be an absolute path" ;;
esac

if grep -qi microsoft /proc/version 2>/dev/null; then
  case "$experience_root" in
    /mnt/*) fail "WSL2 experience root must be on the Linux-native filesystem, not under /mnt/" ;;
  esac
  case "$project_root" in
    /mnt/*) fail "WSL2 project root must be on the Linux-native filesystem, not under /mnt/" ;;
  esac
fi

available_kib="$(df -Pk "$HOME" | awk 'NR==2 { print $4 }')"
[[ "$available_kib" =~ ^[0-9]+$ ]] || fail "could not determine free disk space"
(( available_kib >= 4 * 1024 * 1024 )) || fail "at least 4 GiB free disk space is required"

memory_kib="$(awk '/^MemTotal:/ { print $2; exit }' /proc/meminfo)"
[[ "$memory_kib" =~ ^[0-9]+$ ]] || fail "could not determine available memory"
(( memory_kib >= 2 * 1024 * 1024 )) || fail "at least 2 GiB memory is required"
if (( memory_kib < 4 * 1024 * 1024 )); then
  echo "Warning: less than 4 GiB memory detected; DSH and the Java Runtime may start slowly." >&2
fi

if [[ -d "$experience_root" ]] && [[ -n "$(find "$experience_root" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  fail "experience root is not empty: $experience_root"
fi

cat <<EOF
Foggy Linux experience plan
  DSH:              $DSH_VERSION
  pnpm:             $PNPM_VERSION
  Foggy Bundle:     $PLUGIN_VERSION
  Python:           private managed 3.12.13 (downloaded during Foggy initialization)
  Experience root:  $experience_root
  Project root:     $project_root
  Filesystem:       Linux-native
  Model secrets:    not configured
EOF

if [[ "$dry_run" == "1" ]]; then
  echo "Dry run passed; no files were changed."
  exit 0
fi

pnpm_prefix="$experience_root/pnpm"
dsh_install="$experience_root/dsh-install"
dsh_home="$experience_root/dsh-home"
dsh_agents_home="$experience_root/dsh-agents-home"
plugin_source="$experience_root/plugin-source"
packages_dir="$experience_root/packages"
dsh_command="$dsh_install/node_modules/.bin/dsh"

mkdir -p "$experience_root" "$project_root" "$pnpm_prefix" "$dsh_install" "$dsh_home" "$dsh_agents_home/skills" "$packages_dir"
chmod 700 "$experience_root" "$dsh_home" "$dsh_agents_home"

npm install --prefix "$pnpm_prefix" --no-audit --no-fund "pnpm@$PNPM_VERSION"
pnpm_command="$pnpm_prefix/node_modules/.bin/pnpm"

printf '%s\n' 'onlyBuiltDependencies:' '  - sharp' > "$dsh_install/pnpm-workspace.yaml"
"$pnpm_command" add --dir "$dsh_install" --save-exact "@deepseek-ai/dsh@$DSH_VERSION"

git clone --depth 1 --branch "$PLUGIN_REF" "$PLUGIN_REPOSITORY" "$plugin_source"
(
  cd "$plugin_source"
  npm pack --pack-destination "$packages_dir"
)

plugin_package="$packages_dir/foggy-projects-deepseek-harness-plugin-$PLUGIN_VERSION.tgz"
[[ -f "$plugin_package" ]] || fail "packed Foggy Bundle not found: $plugin_package"

(
  cd "$project_root"
  DSH_HOME="$dsh_home" DSH_AGENTS_HOME="$dsh_agents_home" \
    "$dsh_command" plugin --profile web add --workspace-root "$plugin_package"
)

run_script="$experience_root/run.sh"
{
  printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail'
  printf 'export DSH_HOME=%q\n' "$dsh_home"
  printf 'export DSH_AGENTS_HOME=%q\n' "$dsh_agents_home"
  printf 'export FOGGY_PROJECT_ROOT=%q\n' "$project_root"
  printf 'cd %q\n' "$project_root"
  printf 'exec %q web\n' "$dsh_command"
} > "$run_script"
chmod 700 "$run_script"

state_file="$experience_root/experience.env"
{
  printf 'DSH_VERSION=%q\n' "$DSH_VERSION"
  printf 'PLUGIN_VERSION=%q\n' "$PLUGIN_VERSION"
  printf 'DSH_COMMAND=%q\n' "$dsh_command"
  printf 'DSH_HOME=%q\n' "$dsh_home"
  printf 'DSH_AGENTS_HOME=%q\n' "$dsh_agents_home"
  printf 'FOGGY_PROJECT_ROOT=%q\n' "$project_root"
} > "$state_file"
chmod 600 "$state_file"

echo "Experience prepared. DeepSeek Harness and Foggy have not been started."
echo "Run: $run_script"
