"""3mm Fleet application service."""

from __future__ import annotations

from three_mm_application_sdk import ApplicationContext, OperationContext


class FleetService:
    def __init__(self, application: ApplicationContext) -> None:
        self.application = application

    def handle(
        self,
        operation_id: str,
        payload: dict[str, object],
        context: OperationContext,
    ):
        handlers = {
            "health": self._health,
        }

        handler = handlers.get(operation_id)
        if handler is None:
            raise ValueError("Operation is unsupported")

        return handler(payload, context)

    def _health(self, _payload, _context):
        return {"status": "ready"}


def create_service(application: ApplicationContext):
    return FleetService(application)