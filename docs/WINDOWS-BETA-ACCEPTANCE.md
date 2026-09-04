# Native Windows Beta acceptance

This runbook validates DeepSeek Harness `0.1.2-rc.1` with Foggy plugin
`0.4.0-beta.13` on a clean 64-bit Windows 10 or Windows 11 machine. Use a local
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

Let DSH open the browser automatically. If it does not, copy the complete URL
printed by `dsh web`, including its `?token=...` query, into the browser. A new
browser session cannot use the bare `http://127.0.0.1:3080/` URL until that
token has established its local authentication cookie. Treat the launch URL as
temporary local access material and do not paste it into chat or diagnostics.

Configure an LLM provider, select the `C:\FoggyAcceptance` workspace, then open
**Settings → Plugins → Foggy Data Analysis** and choose **Initialize Foggy**.

Expected component state:

- Python 3.12.13, source `Foggy private`;
- CLI 0.1.23;
- Launcher 0.1.18;
- analysis Skill 0.1.17;
- onboarding Skill 0.4.0-beta.13;
- Java 17+ available;
- native DSH Skill registration available.

Runtime startup shows its current phase, elapsed time, and the 180-second
readiness deadline. Typical startup is 15–30 seconds on the validated WSL2 host
and may take up to 60 seconds on Windows with cold JVM or antivirus scanning.
The plugin monitors the Launcher PID and fails promptly when Java exits before
readiness. On failure, export diagnostics before retrying; the report includes
the startup phase, PID state, evidence directory, Runtime log locations, and
bounded sanitized log tails.

## Database and semantic-layer acceptance

Keep database credentials out of this public repository. Create a private CLI
profile outside the DSH conversation, pass only its opaque profile ID and
revision to the onboarding workflow, and use a test-only database account with
read-only permissions.

Use a natural prompt such as:

```text
请帮我用 Foggy 分析这个测试数据库。我已经按验收手册创建了私有连接
profile。请先确认连接和表结构，再围绕订单数据创建一个简单的语义层，
包含订单数量、状态和开单时间，最后执行一个不超过 20 行的只读查询。
不要修改数据库，也不要在对话或验收文件中输出密码。
```

Pass only when Runtime readiness and capabilities succeed, datasource metadata
can be discovered, TM/QM models validate and publish, the bounded read-only
query succeeds, diagnostics contain no credentials, and stopping Runtime frees
port 18066.
