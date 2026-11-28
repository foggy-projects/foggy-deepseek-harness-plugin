# Foggy DeepSeek Harness plugin 0.4.5-rc.1

This compatibility candidate targets DeepSeek Harness `0.2.2-rc.3`, currently
the newest npm `next` release, and requires Node.js `>=24.9.0`. Harness `0.2.2`
updates Cordis and its plugin/SDK contracts and raises the minimum Node version.
The candidate updates the DSH engine and peer dependency ranges to that release
line and aligns the Cordis peer range with `~4.1.0`.

The managed Foggy component targets remain Launcher `0.1.46`, CLI `0.1.25`, and
the `0.1.18` analysis Skills. This plugin update does not silently switch any
already installed Foggy component.

Install the packed candidate in an isolated Harness `0.2.2-rc.3` profile or
workspace:

```powershell
dsh plugin --profile web add --workspace-root ./foggy-projects-deepseek-harness-plugin-0.4.5-rc.1.tgz
```

Restart `dsh web`, open Settings → Built-in plugins → Foggy Data Analysis, and
initialize the components. Harness `0.2.2-rc.3` requires Node.js `>=24.9.0`.

## Compatibility acceptance

Accepted on 2026-11-14 against the public npm package
`@deepseek-ai/dsh@0.2.2-rc.3`, installed into an isolated profile and launched
with Node.js `24.22.1`:

- The Harness web host returned HTTP 200, and the installed plugin appeared in
  the Plugins view with version `0.4.5-rc.1`.
- Settings → Built-in plugins loaded the native **Foggy Data Analysis** tab.
  The tutorial link, Launcher/CLI version selectors, and update actions rendered.
- Automatic release checks resolved Launcher `0.1.46` and CLI `0.1.25`, matching
  the plugin-verified versions. No component download or update was triggered.
- The compatibility and package suite passed: 67 tests, 0 failures.

The current npm dist-tags are `latest: 0.2.2-rc.1` and `next: 0.2.2-rc.3`;
this candidate targets the newest `next` pre-release. No stable Harness release
was available in that channel check.

## References

- [DeepSeek Harness v0.2.2-rc.1 release notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1)
- [DeepSeek Harness v0.2.2-rc.3 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3)
- [DeepSeek Harness release history](https://github.com/deepseek-ai/deepseek-harness/releases)
