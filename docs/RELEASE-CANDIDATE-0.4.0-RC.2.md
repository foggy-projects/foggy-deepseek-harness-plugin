# Foggy DeepSeek Harness plugin 0.4.0-rc.2 release candidate

Assessment date: 2026-09-06

## Decision

This build is a public preview for Windows 10/11 x64 and Linux/WSL2 x64. It
remains a development and evaluation plugin; the bundled Runtime defaults are
not a production security profile.

No Java engine or `foggy-runtime-cli` source was changed for this candidate.
The plugin consumes the independently accepted CLI 0.1.23, Runtime Launcher
0.1.21, foggy-ai-analysis Skill 0.1.18, and foggy-semantic-query Skill 0.1.18
public releases.

## Delta from rc.1

- Upgrade Runtime Launcher from 0.1.20 to 0.1.21.
- Upgrade foggy-ai-analysis from 0.1.17 to 0.1.18.
- Install and register foggy-semantic-query 0.1.18 as a second managed Skill.
- Keep DeepSeek Harness 0.1.2-rc.1, managed Python 3.12.13, CLI 0.1.23, and the
  default Runtime port 18166 unchanged.

The new public assets and their nested Skill manifests were independently
checksum-verified. Runtime acceptance covered automatic static-dictionary
captions, label-to-code filtering, dictionary member enumeration, self-date
dimensions, and the `$year`, `$month`, and `$yearMonth` describe/query path.

## Publication gate

The plugin's existing automated tests and npm tarball inspection must pass.
The Runtime functional matrix is not repeated because the exact public
Launcher and Skill assets were accepted independently before this pin update.

DeepSeek Harness minimum-release-age policy can reject a recently published
version still present in a profile lockfile. Users should inspect and rebuild
the profile lockfile or wait for the policy window rather than weakening
plugin integrity checks.
