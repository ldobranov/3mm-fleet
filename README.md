# 3mm Fleet

Optional fleet-management extension for the 3mm platform.

## Purpose

3mm Fleet provides the administrator UI for managing 3mm Hub and Node devices.

Core remains the source of truth for:

- device identities;
- Node enrollment;
- credentials;
- heartbeat and online status;
- inventory;
- capabilities;
- command delivery.

Fleet does not maintain a second device registry.

## Current status

Version `0.1.0` implements:

- pending Node enrollment requests;
- administrator approval and rejection;
- registered device list;
- online/offline status;
- last-seen information;
- hardware and operating-system inventory;
- automatic refresh.

The first physical acceptance test was completed with:

- Raspberry Pi 3B+ Hub;
- Raspberry Pi Zero W Rev 1.1 Node;
- 3mm `v0.3.0-beta.22`.

The Node enrollment flow completed successfully and the Zero began authenticated
heartbeat and inventory publishing after administrator approval.

## Package

The extension uses:

- Module Manifest v2;
- application-extension v1;
- compiled-ui v1.

Build:

```powershell
python .\build_fleet_package.py