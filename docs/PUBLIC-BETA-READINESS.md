# Public beta readiness: 0.4.0-beta.16

Assessment date: 2026-09-05

## Verdict

`0.4.0-beta.16` is suitable for a scoped public beta on Windows 10/11 x64 and
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
- Onboarding is development-first: a direct password or Agent environment
  variable is submitted to the public datasource API of an already-running
  Runtime. The password is excluded from onboarding state and evidence, and
  datasource setup does not trigger Runtime restart. Opaque profiles remain an
  optional advanced path.
- A real Launcher 0.1.18 smoke on Java 17 accepted a synthetic inline-password
  datasource through the public Runtime API while retaining the same Java PID.
  The isolated registry confirmed the documented local-development plaintext
  persistence boundary; the test datasource was then removed and the temporary
  Runtime stopped.
- A full isolated `onboard-datasource-run` then created, tested, bound, and
  inspected a SQLite datasource containing one table. Runtime retained the same
  PID, while the persisted onboarding state and command evidence contained no
  copy of the synthetic password.
- The package and settings contract report Python 3.12.13 as `Foggy private`,
  CLI 0.1.23, Launcher 0.1.18, analysis Skill 0.1.17, and onboarding Skill
  0.4.0-beta.16; the same component display was accepted in the preceding
  native Windows beta run.
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
- Current automated regression passes 20 Node tests and 23 Python tests. The
  new datasource tests cover secret-free persisted state, direct Runtime API
  submission, CLI bypass for inline development credentials, stable inline
  credential resumption, bounded transient connection retry, and output redaction.
- A real Java 17 / Launcher 0.1.18 regression resumed the same completed inline
  datasource composite twice, retained the Runtime PID, and emitted a complete
  `01` through `06` workspace evidence sequence without falling back to granular
  commands.

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
- Direct development passwords are stored by the current Runtime in its private
  local datasource registry. Production publication is a separate manual or
  future dedicated deployment workflow and should use the target environment's
  credential controls.

## Release gate after publication

Before broad announcement, complete the native Windows fresh-machine checklist
in [WINDOWS-BETA-ACCEPTANCE.md](./WINDOWS-BETA-ACCEPTANCE.md). Record the exact
Node, Java, DeepSeek Harness, and plugin versions and confirm that initialization
works without a system Python executable.
