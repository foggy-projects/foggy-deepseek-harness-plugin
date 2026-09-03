# Third-party runtime notices

Foggy for DeepSeek Harness downloads a pinned CPython runtime on first
initialization. The runtime is not included in the npm package and is installed
only inside Foggy's per-user component directory.

- CPython is provided under the Python Software Foundation License Version 2.
- Portable distributions are produced by
  [astral-sh/python-build-standalone](https://github.com/astral-sh/python-build-standalone),
  whose build tooling is provided under MPL-2.0.
- The downloaded distribution contains its own license and attribution files.

The exact build release, platform assets, sizes, URLs, and SHA256 digests are
recorded in `skills/foggy-deepseek-onboarding/assets/versions.json`. Foggy
verifies the selected digest before extraction and does not add the interpreter
to `PATH` or register it as a system Python installation.
