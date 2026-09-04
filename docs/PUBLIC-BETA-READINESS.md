# Public beta readiness: 0.4.0-beta.14

Assessment date: 2026-09-04

## Verdict

`0.4.0-beta.14` is suitable for a scoped public beta on Windows 10/11 x64 and
Linux/WSL2 x64. It is not a general-availability release.

The plugin package stays small and downloads large components only during
initialization. Node.js and Java remain system prerequisites. Python 3.12.13 is
installed privately below Foggy's component directory and does not change the
system PATH, registry, or a user's existing Python installation.

## Verified behavior

- The npm tarball is about 78 KB compressed and contains no Python or Java
  runtime binary.
- Managed CPython assets are pinned by URL, byte size, and SHA256 for Windows,
  Linux, and macOS on x64 and arm64.
- The component installer code is unchanged from beta.9, whose Windows x64 run
  completed a cold Python download, checksum verification, extraction,
  initialization, forced Python repair, and doctor run.
- DeepSeek Harness `0.1.2-rc.1` loaded the beta.12 candidate Bundle, web client,
  remote status service, and native Skill provider on both Windows and WSL2.
- WSL2 reported the existing managed Python, CLI, Launcher, and analysis Skill
  as ready; an isolated Windows profile correctly reported its fresh component
  state and rejected the host's Java 12 as below the Java 17 prerequisite.
- The UI reported Python 3.12.13 as `Foggy private`, and CLI 0.1.23, Launcher
  0.1.18, analysis Skill 0.1.17, and onboarding Skill 0.4.0-beta.14 as installed.
- Runtime startup now reports the current phase, elapsed/timeout seconds, and a
  bounded progress value. A real Windows launch with Temurin 17 reached readiness
  and passed capabilities in 18.9 seconds. A controlled post-launch Java exit was
  detected after about 1 second instead of waiting for the 180-second deadline;
  a restored healthy launch then passed again in 15.9 seconds.
- Diagnostic export success remains visible alongside a prior Runtime startup
  error, including the generated local JSON path. Exported failures include
  bounded sanitized Runtime log tails and reject log paths outside the managed
  Runtime directory.
- Runtime port configuration is persisted below the private Foggy data root and
  defaults to `18166`. The settings UI validates `1024–65535`, prevents changes
  while Runtime is active, and shows port conflicts as an assertive, red bordered
  alert. Preflight now checks `0.0.0.0` with exclusive Windows binding semantics,
  matching the Java server closely enough to detect address-specific `portproxy`
  conflicts that a loopback-only probe missed.
- Interrupted downloads resume with HTTP Range when the server supports it;
  downloaded artifacts are not trusted until the complete SHA256 matches.
- Windows progress writes tolerate transient sharing violations without losing
  the previous valid progress document or leaving temporary files behind.
- Automated regression passed on Windows and Linux/WSL2: 20 Node tests and 17
  Python tests on each platform, plus shell and PowerShell syntax checks.

## Beta boundaries

- Supported public-beta targets: Windows 10/11 x64 and Linux/WSL2 x64.
- Windows users must install a supported system Node.js line (`^22.19.0` or
  `>=24.0.0`) and Java 17 or later. They do not need to install Python.
- macOS and arm64 assets are pinned and integrity-checked but have not received
  the same end-to-end host validation; treat those targets as experimental.
- DeepSeek Harness itself is consumed at `0.1.2-rc.1`. Its authenticated Web UI
  launch URL, plugin installation, and supply-chain policy behavior may change
  before a stable Harness release.
- Runtime production authentication is outside this beta's default local
  onboarding mode. The UI and doctor continue to report `productionReady=false`
  for the development-only no-auth mode.

## Release gate after publication

Before broad announcement, complete the native Windows fresh-machine checklist
in [WINDOWS-BETA-ACCEPTANCE.md](./WINDOWS-BETA-ACCEPTANCE.md). Record the exact
Node, Java, DeepSeek Harness, and plugin versions and confirm that initialization
works without a system Python executable.
