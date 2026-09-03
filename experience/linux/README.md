# Linux and WSL2 experience

This entry prepares a clean, user-owned DeepSeek Harness web profile with the public Foggy Bundle.
It has been designed for Ubuntu 22.04/24.04 x86_64 and WSL2.

## Prerequisites

- Node.js `^22.19.0` or `>=24.0.0`
- Java 17 or newer
- Git, npm, and `tar`
- At least 4 GiB free disk space and 2 GiB available memory; 4 GiB memory is recommended

Keep the experience root on the Linux-native filesystem, such as under `$HOME`. In WSL2, do not
put DSH, `node_modules`, Foggy's private Python environment, or Foggy data under `/mnt/c` or `/mnt/d`.

## Prepare

```bash
git clone https://github.com/foggy-projects/foggy-deepseek-harness-plugin.git
cd foggy-deepseek-harness-plugin
bash experience/linux/prepare.sh --dry-run
bash experience/linux/prepare.sh
```

The script installs pinned pnpm and DeepSeek Harness versions inside
`~/.local/share/foggy-deepseek-harness-experience`, clones and packs the public Foggy Bundle, and
adds it to a clean DSH web profile. It does not use `sudo`, install operating-system packages, write
model credentials, initialize Foggy components, or start the web process.

Start the prepared profile with:

```bash
~/.local/share/foggy-deepseek-harness-experience/run.sh
```

Open the URL printed by DSH, then choose **Settings → Plugins → Foggy Data Analysis** and select
**Initialize Foggy**. Private Python, the CLI, Launcher, and analysis Skill are downloaded from their
pinned public Releases and verified before installation. A system Python is not required.

Provider configuration remains a separate DSH setup step. Store API keys in a private environment
file or secret manager; do not add them to the DSH settings document or the project repository.

## Custom roots

```bash
bash experience/linux/prepare.sh \
  --experience-root "$HOME/.local/share/my-foggy-experience" \
  --project-root "$HOME/my-foggy-workspace"
```

The script refuses a non-empty experience root. This prevents an existing profile from being
silently overwritten. Remove an abandoned test root yourself after confirming that it contains no
data you need, or choose a new root.
