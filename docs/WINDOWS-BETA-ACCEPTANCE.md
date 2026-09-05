# Native Windows Beta acceptance

This runbook validates DeepSeek Harness `0.1.2-rc.1` with Foggy plugin
`0.4.0-beta.17` on a clean 64-bit Windows 10 or Windows 11 machine. Use a local
directory that is not synchronized by OneDrive.

## Prerequisites

Install a system Node.js matching `^22.19.0 || >=24.0.0` and a system Java 17+
JRE/JDK. Windows must also provide `tar` (included in supported Windows 10/11
versions). A system Python is neither required nor used by default.

```powershell
node --version
npm --version
java -version
tar --version
```

Foggy downloads a pinned private CPython 3.12.13 runtime during initialization.
It remains below `%LOCALAPPDATA%\Foggy\DeepSeekHarness`, is not added to `PATH`,
and is not registered as a system Python.

## Install and start

```powershell
New-Item -ItemType Directory -Force C:\FoggyAcceptance | Out-Null
Set-Location C:\FoggyAcceptance

npx --yes --package=@deepseek-ai/dsh@0.1.2-rc.1 --package=pnpm@11.7.0 `
  dsh plugin --profile web add --workspace-root `
  "@foggy-projects/deepseek-harness-plugin@beta"

npx --yes --package=@deepseek-ai/dsh@0.1.2-rc.1 --package=pnpm@11.7.0 dsh web
```

If an immediate upgrade reports
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, use the exact DSH profile directory
printed by the error, run `npx --yes pnpm@11.7.0 clean --lockfile` there, and
repeat the same plugin-add command. The failed add normally records the new
exact package version in that profile's `minimumReleaseAgeExclude`; if the
error names an older installed Beta, confirm that exact version is listed too.
Do not disable the policy globally.

Let DSH open the browser automatically. If it does not, copy the complete URL
printed by `dsh web`, including its `?token=...` query, into the browser. A new
browser session cannot use the bare `http://127.0.0.1:3080/` URL until that
token has established its local authentication cookie. Treat the launch URL as
temporary local access material and do not paste it into chat or diagnostics.

Configure an LLM provider, select the `C:\FoggyAcceptance` workspace, then open
**Settings → Plugins → Foggy Data Analysis** and choose **Initialize Foggy**.

Before starting Runtime, confirm the configured port in **Runtime connection
settings**. A fresh profile defaults to `18166`. To use another port, enter an
integer from `1024` through `65535` and choose **Save port**. The value remains
stable across DSH restarts and cannot be changed while Runtime is running.

Expected component state:

- Python 3.12.13, source `Foggy private`;
- CLI 0.1.23;
- Launcher 0.1.18;
- analysis Skill 0.1.17;
- onboarding Skill 0.4.0-beta.17;
- Java 17+ available;
- native DSH Skill registration available.

Runtime startup shows its current phase, elapsed time, and the 180-second
readiness deadline. Typical startup is 15–30 seconds on the validated WSL2 host
and may take up to 60 seconds on Windows with cold JVM or antivirus scanning.
The plugin monitors the Launcher PID and fails promptly when Java exits before
readiness. On failure, export diagnostics before retrying; the report includes
the startup phase, PID state, evidence directory, Runtime log locations, and
bounded sanitized log tails.

If the configured port is occupied, startup must fail during preflight instead
of waiting for the readiness deadline. The settings page displays a red bordered
alert naming the port conflict and tells the user to save another port or release
the conflicting application or Windows port proxy. Saving a free port and
starting again must clear the applicable conflict state.

## Database and semantic-layer acceptance

Use a development or test database. For this local acceptance run, connection
details and a password may be supplied directly in the prompt or in a local
connection JSON file. The onboarding wrapper must configure the datasource
online without stopping or restarting an already-running Runtime. It must not
copy the password into onboarding state, evidence, TM/QM files, or Git.

Use a natural prompt such as:

```text
请帮我用 Foggy 分析这个测试数据库：地址、数据库名、账号和密码分别是
<连接信息>。直接创建开发数据源并绑定一个合适的 namespace，不要重启
Runtime。读取表结构后，在当前工作目录创建订单语义模型，包含订单数量、
状态和开单时间，调试到模型通过，并执行一个不超过 20 行的只读查询。
```

Pass only when Runtime readiness and capabilities succeed, datasource setup
does not restart Runtime, metadata can be discovered, TM/QM models validate and
become effective in the local Runtime, the bounded read-only query succeeds,
diagnostics contain no credentials, and stopping Runtime frees the configured
port (default `18166`). Recommend Git management for the completed model files;
do not treat this acceptance run as production publication.
