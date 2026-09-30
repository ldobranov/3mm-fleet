"""Forward-only storage migrations for 3mm Fleet."""

from three_mm_application_sdk import ApplicationMigration


def _revision_0001(connection):
    # Fleet v0.1.0 has no extension-owned domain tables yet.
    pass


def get_migrations():
    return [ApplicationMigration("0001", _revision_0001)]