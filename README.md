# 3mm Fleet

Optional administrator-facing fleet-management extension for the 3mm platform.
Core owns device identities, enrollment, credentials, heartbeat, inventory,
capabilities and command delivery. Fleet does not create a second registry.

## Version 0.1.6

- Pending Node approval/rejection and device details with inventory and status.
- Agent module installation, disable and repeat enable with confirmed results.
- Capability state, freshness checks and bounded manual digital-output controls.
- One GPIO output configuration without SSH: mock/gpiod, BCM and physical pin,
  explicit wiring approval, disabled-module checks and pending-outcome recovery.
- English/Bulgarian labels and theme-aware responsive forms.

GPIO configuration requires **3mm Core and Node Agent v0.3.0-beta.24 or later
with this contract**, not only this ZIP. Update Hub, then Zero, then Fleet.
Older/missing Agent reports display an upgrade notice instead of guessed settings.
No automatic retry of an uncertain physical command is allowed.

The first paired Zero W / Pi 3B+ test passed with beta.22. The earlier Fleet 0.1.5
GPIO17 LED test passed using environment settings; 0.1.6 configuration, restart
and offline acceptance remain pending. See `docs/FLEET_EXTENSION_PLAN.md` and
the Core repository's `docs/FLEET_GPIO_CONFIGURATION.md` for limits and tests.

## Build and install

The package uses Module Manifest v2, application-extension v1 and compiled-ui v1.

```powershell
python .\build_fleet_package.py
```

Upload `dist/3mm-fleet-0.1.6.zip` through the Hub's Extensions installer and
activate it. The installer compiles the included Vue sources through the
platform compiler. Fleet does not install or update the Zero runtime itself.

## Checks

```powershell
python -m unittest discover -s tests -v
node ../3mm/frontend/node_modules/vitest/vitest.mjs run --config tests/vitest.config.mjs
```

UI checks use the sibling Core checkout's existing frontend toolchain; set
`THREE_MM_FRONTEND_DIR` when it is stored elsewhere. Releases are tag-driven,
versioned ZIPs with SHA-256 checksums, published by `.github/workflows/release.yml`.
