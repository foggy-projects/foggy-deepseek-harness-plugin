# Foggy DeepSeek Harness plugin 0.4.6-rc.1

This candidate targets the newest published DeepSeek Harness release,
`0.2.3-alpha.2`. The previous `dsh022` tag remains on plugin `0.4.5-rc.4`;
this candidate is for DSH alpha.2.

DSH alpha.2 requires Node.js `24.22.3+` in the 24.x line or `26.13.1+` in the
26.x line. This candidate declares the same supported engine ranges and updates
the bundled Linux/WSL2 setup to install DSH `0.2.3-alpha.2`.

DSH alpha.2 moved bundle configuration from the old Settings → Built-in plugins
tab into the installed bundle's own Plugins detail page. Foggy now registers
its existing settings component in the keyed `plugins.bundle.config` slot using
the Foggy package name. Its tutorial, component version manager, diagnostics,
and uninstall action remain on that page.

Install the exact candidate into a clean DSH alpha.2 profile:

```powershell
dsh plugin --profile web add --workspace-root @foggy-projects/deepseek-harness-plugin@0.4.6-rc.1
```

After publication, the `dsh023` npm dist-tag points to this candidate. The
`dsh022` tag continues to point to the DSH 0.2.2 candidate.

## Verification

Automated checks cover the DSH alpha.2 engine decision, package versions,
Typert gateway, Cordis tool dispatch and policy denial, chat turn-tail/query
contracts, and the keyed bundle configuration slot. A live browser launch of a
clean DSH profile remains a separate manual acceptance step.
