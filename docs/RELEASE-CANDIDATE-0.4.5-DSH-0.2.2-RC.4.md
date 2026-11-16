# Foggy DeepSeek Harness plugin 0.4.5-rc.4

This candidate adds an uninstall action to the Foggy settings page for DeepSeek
Harness `0.2.2-rc.3`.

After the user confirms, the plugin validates the managed installation, stops
the recorded Foggy Runtime, and removes the managed component directory after
the stop command succeeds. It keeps the local data directory, including CLI
profiles and operation records. It also leaves the DeepSeek Harness plugin
package installed; the user can remove that separately through the Harness
plugin manager.

If the installation cannot be validated, managed Python is unavailable, or the
Runtime stop command fails, the operation reports a failure and leaves the
component directory in place. It does not purge local data.

The compatibility target remains DeepSeek Harness `0.2.2-rc.3`, with system
Node.js `>=24.9.0`, Java 17+, managed Python `3.12.13`, Launcher `0.1.46`, CLI
`0.1.25`, and Foggy Skills `0.1.18`.

Install the exact candidate in a clean Harness profile:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.5-rc.4
```

For the DSH `0.2.2-rc.3` channel, `@dsh022` points to this candidate after
publication.

## Verification

This candidate has not yet received a clean-machine UI acceptance run. Review
the uninstall confirmation and verify that the local data directory and Harness
plugin remain available after removing Foggy components before considering the
flow accepted.
