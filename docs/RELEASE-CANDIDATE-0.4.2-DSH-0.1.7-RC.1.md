# Foggy DeepSeek Harness plugin 0.4.2-rc.1

This isolated compatibility candidate targets DeepSeek Harness `0.1.7-rc.2`.
It requires system Node.js `>=24.0.0`. It is deliberately published under a
dedicated npm dist-tag so the existing `beta`, `rc`, and `dsh015` installation
channels remain unchanged.

## Compatibility changes

- Adapt strict Typert codecs to the `create()` schema factory required by DSH
  `0.1.7`, while retaining the `schema` property used by the earlier `0.1.5`
  loader.
- Align DeepSeek Harness peer-package ranges and the onboarding manifest with
  `0.1.7-rc.2`.
- Keep Foggy CLI, Launcher, Skills, Runtime behavior, and the development-only
  product boundary unchanged.

## Installation

Use Node.js 24 or newer and a separate Harness profile:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.2-rc.1
dsh web
```

The same candidate is available through the dedicated `dsh017` npm dist-tag.
Do not use this candidate to replace a stable `beta` installation unless the
profile is intended to run DSH `0.1.7-rc.2`.

## Compatibility acceptance (2026-09-25)

- `npm run check`, all 23 Node tests, and all 29 Python tests passed on Node
  `24.19.0`.
- Packed and installed this exact candidate into a fresh temporary DSH Web
  profile running `0.1.7-rc.2`. The package manager completed installation;
  DSH emitted no plugin/Typert registration error at startup.
- The authenticated Web boot graph included the Foggy client bundle. Fetching
  the served bundle returned HTTP 200 and confirmed the `settings.plugins.tab`
  contribution is present.
- Invoked Foggy `status` and `plan` through DSH's Remote HTTP transport. Both
  returned successful structured results with package version `0.4.2-rc.1`.
- Created a temporary session and called DSH's native `skills/list` Remote. It
  returned `foggy-deepseek-onboarding` from the installed plugin package and
  `modelInvocable: true`. The host also exposes separately installed user-level
  Foggy skills; the package-provided onboarding Skill remained individually
  discoverable.
- Used Plugin Manager to disable and re-enable the bundle. Both changes
  reported `application: applied`; while disabled, the Foggy strict Remote
  correctly returned `gateway/definition-unavailable`, and after re-enabling
  `status` succeeded again. The final bundle state is enabled and installed.
- No Runtime was started, no component update/repair was requested, and no
  database connection or query was made. The status read observed the host's
  existing Foggy component state; it did not change it. Full component
  installation and Runtime behavior remain outside this DSH protocol smoke
  test.

## Upstream references

- [DeepSeek Harness v0.1.7-rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2)
- [DeepSeek Harness v0.1.7-rc.1 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1)
- [DeepSeek Harness release history](https://github.com/deepseek-ai/deepseek-harness/releases)
