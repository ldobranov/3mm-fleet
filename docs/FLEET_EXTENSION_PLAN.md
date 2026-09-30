
В `docs\FLEET_EXTENSION_PLAN.md`:

```markdown
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

## v0.1.1 — device details

Planned:

- dedicated device detail view;
- capability list;
- recent command history;
- clearer heartbeat/inventory timestamps;
- extension version / Agent version when exposed by the generic protocol.

## v0.2.0 — management actions

Planned, subject to Core generic APIs:

- friendly display-name management;
- credential/revocation workflow;
- device recovery/reassignment UX;
- module/update management;
- diagnostics;
- command status and failures.

## Non-goals

Fleet must not:

- copy device identities into an extension-owned registry;
- store device credentials;
- create a second enrollment protocol;
- bypass Core authorization;
- directly control hardware outside generic capability contracts.