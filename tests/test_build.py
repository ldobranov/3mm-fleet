import hashlib
import json
import unittest
import zipfile
from io import BytesIO

import build_fleet_package


class FleetPackageBuildTests(unittest.TestCase):
    def test_build_is_deterministic(self):
        version = build_fleet_package.read_version()

        first = build_fleet_package.build_package(version)
        second = build_fleet_package.build_package(version)

        self.assertEqual(first, second)
        self.assertEqual(
            hashlib.sha256(first).hexdigest(),
            hashlib.sha256(second).hexdigest(),
        )

    def test_package_contains_required_files(self):
        version = build_fleet_package.read_version()
        payload = build_fleet_package.build_package(version)

        with zipfile.ZipFile(BytesIO(payload)) as archive:
            names = set(archive.namelist())

            self.assertIn("manifest.json", names)
            self.assertIn("application-extension.json", names)
            self.assertIn("compiled-ui.json", names)
            self.assertIn(
                f"service/three_mm_fleet-{version}-py3-none-any.whl",
                names,
            )
            self.assertIn("source/frontend/FleetApp.vue", names)
            self.assertIn(
                "source/frontend/NodeUpdateControl.vue",
                names,
            )

    def test_package_identity_is_consistent(self):
        version = build_fleet_package.read_version()
        payload = build_fleet_package.build_package(version)

        with zipfile.ZipFile(BytesIO(payload)) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            application = json.loads(
                archive.read("application-extension.json")
            )
            compiled_ui = json.loads(
                archive.read("compiled-ui.json")
            )

        self.assertEqual(manifest["module_id"], "org.3mm.fleet")
        self.assertEqual(application["module_id"], manifest["module_id"])
        self.assertEqual(compiled_ui["module_id"], manifest["module_id"])

        self.assertEqual(manifest["version"], version)
        self.assertEqual(application["version"], version)
        self.assertEqual(compiled_ui["version"], version)


if __name__ == "__main__":
    unittest.main()