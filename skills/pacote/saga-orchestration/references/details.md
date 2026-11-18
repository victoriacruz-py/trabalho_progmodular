# saga-orchestration — detailed sections

> Upstream educational sketches, not an executable bundled runtime.
> `saga_orchestrator`, stores, exceptions and publishers are application
> components to implement, not missing skill files. The examples omit atomic
> key claims, atomic state/event persistence and reliable result admission.
> Apply [the entrypoint](../SKILL.md) before reuse. Detach notifications when
> their failure must not reverse a valid purchase. Missing data is not proof
> of successful compensation; consult authoritative operation history.

## Templates

### Template 1: Order Fulfillment Saga (Orchestration)

Illustrative subclass with inventory, payment, shipping and notification steps.
See [advanced sketches](advanced-patterns.md) for the illustrative base class.

```python
from saga_orchestrator import SagaOrchestrator, SagaStep
from typing import Dict, List


class OrderFulfillmentSaga(SagaOrchestrator):
    """Orchestrates order fulfillment across four participant services."""

    @property
    def saga_type(self) -> str:
        return "OrderFulfillment"

    def define_steps(self, data: Dict) -> List[SagaStep]:
        return [
            SagaStep(
                name="reserve_inventory",
                action="InventoryService.ReserveItems",
                compensation="InventoryService.ReleaseReservation"
            ),
            SagaStep(
                name="process_payment",
                action="PaymentService.ProcessPayment",
                compensation="PaymentService.RefundPayment"
            ),
            SagaStep(
                name="create_shipment",
                action="ShippingService.CreateShipment",
                compensation="ShippingService.CancelShipment"
            ),
            SagaStep(
                name="send_confirmation",
                action="NotificationService.SendOrderConfirmation",
                compensation="NotificationService.SendCancellationNotice"
            ),
        ]


# Start a saga
async def create_order(order_data: Dict, saga_store, event_publisher):
    saga = OrderFulfillmentSaga(saga_store, event_publisher)
    return await saga.start({
        "order_id": order_data["order_id"],
        "customer_id": order_data["customer_id"],
        "items": order_data["items"],
        "payment_method": order_data["payment_method"],
        "shipping_address": order_data["shipping_address"],
    })


# Participant service — handles command and publishes reply
class InventoryService:
    async def handle_reserve_items(self, command: Dict):
        try:
            reservation = await self.reserve(command["items"], command["order_id"])
            await self.event_publisher.publish("SagaStepCompleted", {
                "saga_id": command["saga_id"],
                "step_name": "reserve_inventory",
                "result": {"reservation_id": reservation.id}
            })
        except InsufficientInventoryError as e:
            await self.event_publisher.publish("SagaStepFailed", {
                "saga_id": command["saga_id"],
                "step_name": "reserve_inventory",
                "error": str(e)
            })

    async def handle_release_reservation(self, command: Dict):
        """Illustrative compensation; requires authoritative state verification."""
        try:
            await self.release_reservation(
                command["original_result"]["reservation_id"]
            )
        except ReservationNotFoundError:
            raise  # Missing alone is ambiguous; preserve the pending outcome.
        await self.event_publisher.publish("SagaCompensationCompleted", {
            "saga_id": command["saga_id"],
            "step_name": "reserve_inventory"
        })
```

### Template 2: Choreography-Based Saga

Each service listens for the previous service's event and reacts. No central coordinator. Compensation is triggered by failure events propagating backward.

```python
from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class SagaContext:
    """Carried through all events in a choreographed saga."""
    saga_id: str
    step: int
    data: Dict[str, Any]
    completed_steps: list


class OrderChoreographySaga:
    """Choreography-based saga — services react to each other's events."""

    def __init__(self, event_bus):
        self.event_bus = event_bus
        self._register_handlers()

    def _register_handlers(self):
        # Forward path
        self.event_bus.subscribe("OrderCreated",       self._on_order_created)
        self.event_bus.subscribe("InventoryReserved",  self._on_inventory_reserved)
        self.event_bus.subscribe("PaymentProcessed",   self._on_payment_processed)
        self.event_bus.subscribe("ShipmentCreated",    self._on_shipment_created)
        # Compensation path
        self.event_bus.subscribe("PaymentFailed",      self._on_payment_failed)
        self.event_bus.subscribe("ShipmentFailed",     self._on_shipment_failed)

    async def _on_order_created(self, event: Dict):
        await self.event_bus.publish("ReserveInventory", {
            "saga_id": event["order_id"],
            "order_id": event["order_id"],
            "items": event["items"],
        })

    async def _on_inventory_reserved(self, event: Dict):
        await self.event_bus.publish("ProcessPayment", {
            "saga_id": event["saga_id"],
            "order_id": event["order_id"],
            "amount": event["total_amount"],
            "reservation_id": event["reservation_id"],
        })

    async def _on_payment_processed(self, event: Dict):
        await self.event_bus.publish("CreateShipment", {
            "saga_id": event["saga_id"],
            "order_id": event["order_id"],
            "payment_id": event["payment_id"],
        })

    async def _on_shipment_created(self, event: Dict):
        await self.event_bus.publish("OrderFulfilled", {
            "saga_id": event["saga_id"],
            "order_id": event["order_id"],
            "tracking_number": event["tracking_number"],
        })

    # Compensation handlers
    async def _on_payment_failed(self, event: Dict):
        """Payment failed — release inventory and mark order failed."""
        await self.event_bus.publish("ReleaseInventory", {
            "saga_id": event["saga_id"],
            "reservation_id": event["reservation_id"],
        })
        await self.event_bus.publish("OrderFailed", {
            "order_id": event["order_id"],
            "reason": "Payment failed",
        })

    async def _on_shipment_failed(self, event: Dict):
        """Shipment failed — refund payment and release inventory."""
        await self.event_bus.publish("RefundPayment", {
            "saga_id": event["saga_id"],
            "payment_id": event["payment_id"],
        })
        await self.event_bus.publish("ReleaseInventory", {
            "saga_id": event["saga_id"],
            "reservation_id": event["reservation_id"],
        })
```

### Template 3: Idempotent Step Guards

Every participant must guard against duplicate delivery. The sketch below
requires the reservation implementation to atomically claim a scoped key and
compare the payload. The initial lookup alone is race-prone; an existing record
may be pending rather than completed. Persist effect and reply intent together.

```python
async def handle_reserve_items(self, command: Dict):
    """Idempotency-guarded reservation step."""
    idempotency_key = f"reserve-{command['order_id']}"
    existing = await self.reservation_store.find_by_key(idempotency_key)
    if existing:
        # Already executed — return the previous result without side effects
        await self.event_publisher.publish("SagaStepCompleted", {
            "saga_id": command["saga_id"],
            "step_name": "reserve_inventory",
            "result": {"reservation_id": existing.id}
        })
        return

    # First execution
    reservation = await self.reserve(
        items=command["items"],
        order_id=command["order_id"],
        idempotency_key=idempotency_key
    )
    await self.event_publisher.publish("SagaStepCompleted", {
        "saga_id": command["saga_id"],
        "step_name": "reserve_inventory",
        "result": {"reservation_id": reservation.id}
    })
```

---


---

## Core Concepts

### Saga Pattern Types

```text
Choreography                        Orchestration
┌─────┐  ┌─────┐  ┌─────┐         ┌─────────────┐
│Svc A│─►│Svc B│─►│Svc C│         │ Orchestrator│
└─────┘  └─────┘  └─────┘         └──────┬──────┘
   │        │        │                   │
   ▼        ▼        ▼             ┌─────┼─────┐
 Event    Event    Event           ▼     ▼     ▼
                                ┌────┐┌────┐┌────┐
Each service reacts to the      │Svc1││Svc2││Svc3│
previous service's event.       └────┘└────┘└────┘
No central coordinator.    Central coordinator sends
                           commands and tracks state.
```

**Choose orchestration when:** You need explicit step tracking, retries, and centralized visibility. Easier to debug.

**Choose choreography when:** You want loose coupling and services that can evolve independently. Harder to trace.

### Saga Execution States

| State            | Description                                       |
| ---------------- | ------------------------------------------------- |
| **Started**      | Saga initiated, first step dispatched             |
| **Pending**      | Waiting for a step reply from a participant       |
| **Compensating** | A step failed; rolling back completed steps       |
| **Completed**    | All forward steps succeeded                       |
| **Failed**       | Saga failed and all compensations have finished   |

### Compensation Rules

| Situation                            | Handling                                              |
| ------------------------------------ | ----------------------------------------------------- |
| Step never started                   | No compensation needed (skip)                         |
| Step completed successfully          | Run compensation command                              |
| Step failed before completion        | Reconcile partial effects before deciding             |
| Compensation itself fails            | Retry with backoff → DLQ → manual intervention alert  |
| Step result no longer exists         | Verify authoritative history or remain pending        |

---
