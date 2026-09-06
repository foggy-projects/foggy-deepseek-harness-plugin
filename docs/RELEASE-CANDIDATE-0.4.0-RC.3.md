# Foggy DeepSeek Harness plugin 0.4.0-rc.3 release candidate

Assessment date: 2026-09-06

## Delta from rc.2

- Add a single **Initialize and start** action for first use.
- Add **Update components** and **Update and start** actions for managed CLI,
  Launcher, and Skill assets after a plugin-package upgrade.
- Show current versus target component versions and an explicit update banner.
- Block component update/repair while Runtime is running; the active Launcher
  process must not diverge from the persisted next-launcher version.
- Keep Refresh, diagnostics, and component-specific repair actions in the
  secondary/advanced action areas.
- Add public documentation, plugin repository, release, and Runtime project
  links to the settings page.

No Java engine or `foggy-runtime-cli` source was changed.
