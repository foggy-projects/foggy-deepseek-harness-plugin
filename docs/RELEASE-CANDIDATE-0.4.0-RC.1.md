# Foggy DeepSeek Harness plugin 0.4.0-rc.1 release candidate

Assessment date: 2026-09-05

## Decision

The implementation is ready for a public release-candidate build on Windows
10/11 x64 and Linux/WSL2 x64. It remains a development and evaluation plugin;
the bundled Runtime defaults are not a production security profile.

No Java engine or `foggy-runtime-cli` source was changed for this candidate.
The plugin consumes the independently accepted Runtime Launcher 0.1.20 and CLI
0.1.23 releases.

## Rehearsed chain

1. Installed DeepSeek Harness 0.1.2-rc.1 and the packed plugin in isolated
   Windows and WSL profiles.
2. Downloaded and verified the managed Python 3.12.13 distribution, CLI 0.1.23,
   Runtime Launcher 0.1.20, and analysis Skill 0.1.17.
3. Started Java Runtime instances on both hosts and passed readiness checks.
4. Connected the LAN MySQL demo database without restarting the active
   development Runtime, created namespace `tms_beta18`, inspected 127 tables,
   and selected `eo_express_order` as the waybill fact table.
5. Validated and published one TM and one QM with 29 query fields. Eight
   executable question-bank cases passed; three additional cases remained
   explicit clarification or capability-gap cases.
6. Verified Runtime 0.1.20 WARN behavior with unknown `groupBy[].grain`: the
   query continued, and the plugin surfaced the warning code, JSON path,
   normalized fragment, allowed properties, documentation reference, and
   suggested action.
7. Delivered the model as a Git bundle to `dev-kvm-jdk17`, installed a private
   Temurin JRE 17, Python 3.12.13, CLI 0.1.23, and Launcher 0.1.20, then bound
   the remote namespace and passed the same eight executable questions.
8. Published model commit `3f2a019`, verified a remote query, rolled back to
   baseline `bf6b70e`, and verified another remote query. The remote model was
   left at the baseline revision.

## Compatibility and operating boundaries

- Unknown Query DSL input warnings are visible in both command output and the
  plugin settings contract. IGNORE and STRICT remain Runtime policy choices;
  protected authorization, datasource, namespace, model, and governance fields
  continue to fail closed.
- Datasource passwords are accepted directly for development experience and
  are excluded from plugin onboarding state, evidence, TM/QM source, and Git.
  Runtime 0.1.20 persists them in its private datasource registry; production
  publication must use target-environment credential controls.
- Copying a JRE from a newer Linux distribution failed on Ubuntu 22.04 because
  of glibc compatibility. Remote deployment therefore uses an official
  target-compatible Temurin archive with checksum verification.
- DeepSeek Harness minimum-release-age policy can reject an immediately
  preceding plugin version recorded in its lockfile. The documented recovery
  is to inspect and rebuild the profile lockfile or wait for the policy window;
  this is not handled by weakening plugin integrity checks.

## Remaining publication gate

The package must pass the final automated test and tarball inspection, then be
published to npm and tagged as a GitHub prerelease from the same commit. npm and
GitHub artifacts must be checked against the local tarball before announcement.
