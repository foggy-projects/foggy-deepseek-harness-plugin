# Foggy DeepSeek Harness plugin 0.4.1-rc.1

This release candidate is the compatibility line for DeepSeek Harness
`0.1.5-rc.2`. It is published as a separate pre-release so the existing
`0.4.0-rc.3`/`beta` installation path remains unchanged while the new Harness
client is evaluated.

## Compatibility changes

- Align DSH peer packages with `0.1.5-rc.2` and Cordis `4.0.2`.
- Remove the obsolete `@deepseek-ai/dsh-client-runtime` injection. DSH
  `0.1.5-rc.2` does not ship that package and the plugin does not use its API.
- Require Node.js `>=24.0.0`. DSH 0.1.5 uses modern ESM entry-point behavior;
  the plugin fails early with a visible prerequisite error on older Node lines.
- Pin the onboarding manifest to DSH `0.1.5-rc.2` and keep the Foggy CLI,
  Launcher, and Skills pins unchanged.

The plugin's remote service, native Skill provider, locale registration, and
Settings → Plugins tab continue to use the same public APIs. The DSH 0.1.5
web client adds file/sidebar features, but none of those changes are required
by Foggy's integration.

## Installation

Use Node.js 24 or newer and install the exact candidate in a separate profile:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.1-rc.1
dsh web
```

The npm `dsh015` dist-tag points to this candidate. Existing users of the
stable `beta` tag are not moved automatically.

## Verification gate

The candidate must pass all of the following before it replaces the stable
baseline:

1. npm package shape and Node syntax checks;
2. the repository onboarding/unit test suite;
3. a clean DSH `0.1.5-rc.2` profile can add the package without an impossible
   `dsh-client-runtime` peer resolution;
4. `dsh --version` reports `0.1.5-rc.2` and `dsh web --no-open` starts under
   Node 24;
5. the web Settings → Plugins page loads Foggy's tab, native Skills are
   discoverable, and the plugin status remote responds;
6. Foggy initialization remains development-only and does not restart a
   healthy Runtime during datasource/model onboarding.

The candidate does not change Foggy Runtime/Launcher binaries or production
deployment policy. If a DSH profile reports
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, rebuild only that profile's lockfile
and retry the exact add command; do not disable pnpm's policy globally.

## Upstream references

- [DeepSeek Harness v0.1.5-rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)
- [DeepSeek Harness release history](https://github.com/deepseek-ai/deepseek-harness/releases)
- [Node entry-point compatibility discussion](https://github.com/deepseek-ai/deepseek-harness/discussions/6124)
