# 3mm Fleet

Optional administrator-facing fleet-management extension for the 3mm platform.

Core owns device identities, enrollment, credentials, heartbeat, inventory,
capabilities, command delivery and Node update state. Fleet does not create a
second registry or duplicate Core state.

## Version 0.1.10

- Fleet uses the Core capability registry v3, including provider identity,
  registration state and capability availability.
- Versioned capability commands are pinned to the Core-provided contract
  version while legacy capabilities keep their existing command behavior.
- Capability controls respect Core-owned availability state and do not expose
  controls for capabilities that are not registered.
- Capability entries are provider-aware, allowing multiple providers to expose
  the same capability without UI identity collisions.

## Version 0.1.9

- Internal Fleet navigation uses the host SPA router instead of reloading the
  whole document.
- Fleet routes no longer add themselves automatically to the main menu.
- Administrators can add `/fleet` explicitly from Menu settings.
- Package tests protect the Fleet route navigation policy from regressions.

## Version 0.1.8

- Fleet shows the Core-owned current Node release and latest Beta release.
- Fleet reports whether a Node update is available without starting a prepare.
- Fleet does not offer Node prepare when Core reports that the selected release
  is already installed.
- Node release state is refreshed after a successful OTA installation.
- Reloading Fleet after a completed update preserves the correct up-to-date
  state instead of offering the same release again.

## Version 0.1.7

- Pending Node approval/rejection and device details with inventory and status.
- Agent module installation, disable and repeat enable with confirmed results.
- Capability state, freshness checks and bounded manual digital-output controls.
- One GPIO output configuration without SSH: mock/gpiod, BCM and physical pin,
  explicit wiring approval, disabled-module checks and pending-outcome recovery.
- Node OTA controls for prepare, explicit install approval and update status.
- Lost prepare replies are reconciled against Core command history without
  automatically sending a second prepare request.
- Lost install replies are recovered from the persisted update operation without
  automatically sending a second install request.
- An update is shown as successful only after Core reports a final successful
  installation outcome from the Node.
- Node updates and physical hardware commands mutually block each other in the
  Fleet UI while an operation is pending.
- English/Bulgarian labels and theme-aware responsive forms.

GPIO configuration requires a compatible 3mm Core and Node Agent implementing
the GPIO configuration contract. Older or missing Agent reports display an
upgrade notice instead of guessed settings. No automatic retry of an uncertain
physical command is allowed.

Node OTA requires a compatible Core and Node Agent implementing the Node update
contract. Fleet only operates the Core-owned update workflow: Core selects and
stages the release, authorizes the installation, records the durable operation
state and receives the final installation or rollback result from the Node.

Fleet stores the current update operation locally only to recover the UI after
reload or an uncertain browser response. Core remains the source of truth for
the update state.

The first paired Zero W / Pi 3B+ Fleet test passed with beta.22. The earlier
Fleet 0.1.5 GPIO17 LED test passed using environment settings. GPIO configuration
and Node OTA physical acceptance should be completed against the corresponding
Core and Agent builds before those paths are considered production-validated.

See `docs/FLEET_EXTENSION_PLAN.md` and the Core repository documentation for
the platform contracts, limits and acceptance tests.

## Build and install

The package uses Module Manifest v2, application-extension v1 and compiled-ui v1.

```powershell
python .\build_fleet_package.py