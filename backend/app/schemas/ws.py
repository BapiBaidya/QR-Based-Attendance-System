"""
WebSocket Message Schema Definitions.

All messages sent over the WebSocket channel follow a strict typed envelope:
{
    "event":   <string>,   # event type identifier
    "session_id": <uuid>,  # room this event belongs to
    "data":    <object>,   # event-specific payload
    "ts":      <iso8601>,  # server timestamp
}
"""
import uuid
from datetime import datetime, timezone
from typing import Any
from pydantic import BaseModel, Field

from app.models.attendance import AttendanceStatus


# ---------------------------------------------------------------------------
# Core envelope — every WS message sent to the client uses this shape
# ---------------------------------------------------------------------------

class WSEnvelope(BaseModel):
    """Generic typed message envelope for all WebSocket events."""
    event: str
    session_id: uuid.UUID
    data: Any
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Per-event data payloads
# ---------------------------------------------------------------------------

class AttendanceMarkedData(BaseModel):
    """Payload for `attendance.marked` event — fires on each successful scan."""
    record_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    institution_id: str
    status: AttendanceStatus
    distance_meters: float | None
    marked_at: datetime

    model_config = {"from_attributes": True}


class SessionEndedData(BaseModel):
    """Payload for `session.ended` event — fires when a teacher closes the session."""
    session_id: uuid.UUID
    ended_at: datetime
    total_attendees: int


class ConnectionAckData(BaseModel):
    """Payload for `session.connected` event — acknowledgement on WS handshake."""
    session_id: uuid.UUID
    message: str = "Connected to live attendance feed."
    subscribed_as: str   # role name of the subscriber


class ErrorData(BaseModel):
    """Payload for `error` events."""
    code: str
    message: str


# ---------------------------------------------------------------------------
# Typed event factories — single place to construct all outbound messages
# ---------------------------------------------------------------------------

def make_attendance_event(
    session_id: uuid.UUID,
    data: AttendanceMarkedData,
) -> WSEnvelope:
    return WSEnvelope(
        event="attendance.marked",
        session_id=session_id,
        data=data.model_dump(mode="json"),
    )


def make_session_ended_event(
    session_id: uuid.UUID,
    data: SessionEndedData,
) -> WSEnvelope:
    return WSEnvelope(
        event="session.ended",
        session_id=session_id,
        data=data.model_dump(mode="json"),
    )


def make_connection_ack_event(
    session_id: uuid.UUID,
    data: ConnectionAckData,
) -> WSEnvelope:
    return WSEnvelope(
        event="session.connected",
        session_id=session_id,
        data=data.model_dump(mode="json"),
    )


def make_error_event(
    session_id: uuid.UUID,
    code: str,
    message: str,
) -> WSEnvelope:
    return WSEnvelope(
        event="error",
        session_id=session_id,
        data=ErrorData(code=code, message=message).model_dump(),
    )
