# 3mm Fleet extension plan

## Architecture rule

3mm Fleet is an optional application extension.

3mm Core owns the generic device-management primitives. Core must not depend on
the Fleet extension and must not contain Fleet-specific UI behavior.

Fleet consumes the generic Core device APIs and provides administrator-facing
management workflows.

Fleet must not duplicate the Core device registry in its own database.

## v0.1.0 — enrollment and registry

Implemented:

- list pending Node enrollment requests;
- approve Node enrollment;
- reject Node enrollment;
- list registered devices;
- display online/offline state;
- display last heartbeat time;
- display latest hardware and OS inventory;
- automatic refresh.

Physical acceptance:

- Hub: Raspberry Pi 3 Model B Plus Rev 1.4;
- Node: Raspberry Pi Zero W Rev 1.1;
- Node request appeared in Fleet;
- administrator approval succeeded;
- Node disappeared from pending requests;
- Node appeared in registered devices;
- authenticated heartbeat succeeded;
- inventory succeeded;
- Node reported online;
- no duplicate device was created.

## Device details and module actions — implemented in the checkout

Implemented:

- dedicated device detail view;
- capability list;
- recent command history;
- clearer heartbeat/inventory timestamps;
- Agent package installation/update/disable through the existing Core API;
- independent section loading, request timeouts and cancellation on unmount;
- revoked status and application-language BG/EN translations;
- queued/delivered actions remain pending until a terminal command result;
- command history reads the Core response's `items` list correctly;
- lost POST replies are checked against the existing idempotency identity.

Accepted on 2026-09-30: user's screenshot confirms Mock GPIO 1.0.6 remote install
on Zero with an `active` result. Pending: separate real disable/update/reinstall
acceptance, Agent/runtime version reporting when exposed by the protocol, and
the device disconnect/restart acceptance cycle.
If a lost POST cannot be found in the recent command history, Fleet keeps it
unconfirmed rather than claiming success or automatically repeating it.

Run UI checks with the sibling Core checkout's installed toolchain:
`node ../3mm/frontend/node_modules/vitest/vitest.mjs run --config tests/vitest.config.mjs`.
Set `THREE_MM_FRONTEND_DIR` when the Core frontend is elsewhere.

## v0.1.5 — capability state and bounded manual controls

- Read the existing authenticated capability-state snapshots, with timestamps
  and a 90-second freshness gate; missing/failed reads never become false values.
- Render channels/actions from registration metadata (`automation_channels`,
  `automation_actions`), not concrete module names. Current controls support the
  digital `set_output` and `pulse_output` contracts. Other capabilities stay readable.
- Require wiring/driver confirmation and an online, non-revoked device.
- Use the existing administrator command endpoint, `capability.invoke`, a
  client-owned idempotency identity and a five-second command TTL.
- Wait for terminal command status. Persist pending intent across page reload,
  reconcile lost replies, and never automatically replay unknown physical work.
  Explicit operator review unlocks the browser only; it does not change Core jobs.
- Test pulse range is 50–10000 ms; Agent's configured module limits remain authoritative.
- BG/EN controls and responsive theme-aware forms. No Core/Agent change required.

User screenshots confirm live controls, reported state, stale-state blocking and
command outcomes in desktop dark mode. On 2026-09-30 the user confirmed a physical
LED test after selecting the gpiod driver and mapping `gpio.output.1` to GPIO17
(physical pin 11), with a series resistor and GND on physical pin 30.
An output-only Agent package was supplied so no input mapping is needed.
This was user acceptance, not an independently measured hardware test.
Physical pulse timing, offline/reboot/disable, latency and mobile/light-mode review
remain pending. Updating the Fleet ZIP on the Hub does not upgrade the Node runtime.

## v0.1.6 — GPIO output configuration without SSH

Implemented locally; not deployed or hardware-accepted:

- Reported driver/mapping and BCM-to-physical-header positions, BG/EN labels.
- One active-high output with inactive initial/safe state, mock or gpiod.
- Require disabled GPIO modules, explicit wiring confirmation, fresh online
  report and matching configuration revision; no optimistic success.
- Generic `agent.gpio.configure` command through the existing administrator
  queue, ten-second expiry and durable no-replay execution journal.
- Agent-owned configuration survives restart; failed apply restores the previous
  mapping or explicitly blocks control if rollback also fails.
- UI preserves pending configuration intent across reload/lost response;
  changing reported revision resets the form and requires confirmation again.
- Enable an installed module using its installed package version. New scoped
  Idempotency-Key identities support repeat disable/re-enable cycles.

Requires updated Core and Node Agent, not only a Fleet ZIP. First native boards:
Zero W Rev 1.x and Pi 3 Model B Plus; fixed `/dev/gpiochip0`, BCM selections
17/18/22/23/24/25/27, one output channel. Input/multi-channel setup is not replaced.
Managed mode rejects unsafe module defaults and a second active output owner.
No root-file editor, device restart, cloud or second Node command authority.

Verification: 13 UI tests, type-check and ZIP production build passed.
Core/Agent contract, failure tests, limits and physical acceptance steps are in
the sibling Core checkout's `docs/FLEET_GPIO_CONFIGURATION.md`.
Next: deploy compatible Core/Agent/Fleet, then configure GPIO17 without SSH and
test output, disable, restart and reconnection. Milestone 13 remains open.

## v0.2.0 — management actions

Planned, subject to Core generic APIs:

- friendly display-name management;
- credential/revocation workflow;
- device recovery/reassignment UX;
- Node runtime OTA management (distinct from Agent module package updates);
- diagnostics;
- command status and failures.

## Non-goals

Fleet must not:

- copy device identities into an extension-owned registry;
- store device credentials;
- create a second enrollment protocol;
- bypass Core authorization;
- directly control hardware outside generic capability contracts.
