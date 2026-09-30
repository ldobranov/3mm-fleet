#!/usr/bin/env python3
"""Build deterministic 3mm Fleet application-extension package."""

from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parent
FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def read_version() -> str:
    return (ROOT / "VERSION").read_text(encoding="utf-8").strip()


def wheel_name(version: str) -> str:
    return f"three_mm_fleet-{version}-py3-none-any.whl"


def package_name(version: str) -> str:
    return f"3mm-fleet-{version}.zip"


def _write(archive: zipfile.ZipFile, name: str, payload: bytes) -> None:
    info = zipfile.ZipInfo(name, FIXED_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, payload)


def build_wheel(version: str) -> bytes:
    output = io.BytesIO()

    package_root = ROOT / "service" / "three_mm_fleet"

    with zipfile.ZipFile(output, "w") as archive:
        for path in sorted(package_root.glob("*.py")):
            _write(
                archive,
                f"three_mm_fleet/{path.name}",
                path.read_bytes(),
            )

        dist_info = f"three_mm_fleet-{version}.dist-info"

        _write(
            archive,
            f"{dist_info}/METADATA",
            (
                "Metadata-Version: 2.1\n"
                "Name: three-mm-fleet\n"
                f"Version: {version}\n"
                "Summary: Fleet management extension for 3mm\n"
            ).encode("utf-8"),
        )

        _write(
            archive,
            f"{dist_info}/WHEEL",
            (
                "Wheel-Version: 1.0\n"
                "Generator: 3mm Fleet\n"
                "Root-Is-Purelib: true\n"
                "Tag: py3-none-any\n"
            ).encode("utf-8"),
        )

        _write(
            archive,
            f"{dist_info}/RECORD",
            b"",
        )

    return output.getvalue()


def build_package(version: str) -> bytes:
    manifest = json.loads(
        (ROOT / "manifest.json").read_text(encoding="utf-8")
    )
    manifest["version"] = version

    definition = json.loads(
        (ROOT / "application-extension.json").read_text(encoding="utf-8")
    )
    definition["version"] = version

    compiled_ui = json.loads(
        (ROOT / "compiled-ui.json").read_text(encoding="utf-8")
    )
    compiled_ui["version"] = version

    wheel = build_wheel(version)

    definition["service"]["artifact"] = f"service/{wheel_name(version)}"
    definition["service"]["artifact_sha256"] = hashlib.sha256(wheel).hexdigest()

    output = io.BytesIO()

    with zipfile.ZipFile(output, "w") as archive:
        _write(
            archive,
            "manifest.json",
            json.dumps(
                manifest,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8"),
        )

        _write(
            archive,
            "application-extension.json",
            json.dumps(
                definition,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8"),
        )

        _write(
            archive,
            "compiled-ui.json",
            json.dumps(
                compiled_ui,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8"),
        )

        _write(
            archive,
            f"service/{wheel_name(version)}",
            wheel,
        )

        frontend_root = ROOT / "frontend" / "src"

        for path in sorted(frontend_root.rglob("*")):
            if path.is_file():
                relative = path.relative_to(frontend_root)
                _write(
                    archive,
                    f"source/frontend/{relative.as_posix()}",
                    path.read_bytes(),
                )

    return output.getvalue()


def main() -> None:
    version = read_version()

    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)

    payload = build_package(version)

    output_path = dist / package_name(version)
    output_path.write_bytes(payload)

    digest = hashlib.sha256(payload).hexdigest()

    print(f"Built: {output_path}")
    print(f"SHA256: {digest}")


if __name__ == "__main__":
    main()