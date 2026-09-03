# Public beta readiness: 0.4.0-beta.8

Assessment date: 2026-09-03

## Verdict

`0.4.0-beta.8` is suitable for a scoped public beta on Windows 10/11 x64 and
Linux/WSL2 x64. It is not a general-availability release.

The plugin package stays small and downloads large components only during
initialization. Node.js and Java remain system prerequisites. Python 3.12.13 is
installed privately below Foggy's component directory and does not change the
system PATH, registry, or a user's existing Python installation.

## Verified behavior

- The npm tarball is about 67 KB compressed and contains no Python or Java
  runtime binary.
- Managed CPython assets are pinned by URL, byte size, and SHA256 for Windows,
  Linux, and macOS on x64 and arm64.
- Windows x64 completed a cold Python download, checksum verification,
  extraction, initialization, forced Python repair, and doctor run.
- Linux/WSL2 x64 completed managed Python extraction, initialization, and a live
  DeepSeek Harness `0.1.1-rc.2` UI status check.
- The UI reported Python 3.12.13 as `Foggy private`, and CLI 0.1.23, Launcher
  0.1.18, analysis Skill 0.1.17, and onboarding Skill 0.4.0-beta.8 as installed.
- Interrupted downloads resume with HTTP Range when the server supports it;
  downloaded artifacts are not trusted until the complete SHA256 matches.
- Automated regression passed under Node 22.23.2: 15 Node tests and 8 Python
  tests, plus shell and PowerShell syntax checks.

## Beta boundaries

- Supported public-beta targets: Windows 10/11 x64 and Linux/WSL2 x64.
- Windows users must install a supported system Node.js line (`^22.19.0` or
  `>=24.0.0`) and Java 17 or later. They do not need to install Python.
- macOS and arm64 assets are pinned and integrity-checked but have not received
  the same end-to-end host validation; treat those targets as experimental.
- DeepSeek Harness itself is still consumed at `0.1.1-rc.2`, so its plugin
  installation and supply-chain policy behavior may change before a stable
  Harness release.
- Runtime production authentication is outside this beta's default local
  onboarding mode. The UI and doctor continue to report `productionReady=false`
  for the development-only no-auth mode.

## Release gate after publication

Before broad announcement, complete the native Windows fresh-machine checklist
in [WINDOWS-BETA-ACCEPTANCE.md](./WINDOWS-BETA-ACCEPTANCE.md). Record the exact
Node, Java, DeepSeek Harness, and plugin versions and confirm that initialization
works without a system Python executable.
