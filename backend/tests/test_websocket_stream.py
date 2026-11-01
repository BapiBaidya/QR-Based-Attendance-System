import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from starlette.websockets import WebSocketState

from app.services.broadcast import ConnectionManager
from app.schemas.ws import (
    make_attendance_event,
    make_session_ended_event,
    make_connection_ack_event,
    AttendanceMarkedData,
    SessionEndedData,
    ConnectionAckData,
)
from app.models.attendance import AttendanceStatus
from datetime import datetime, timezone


@pytest.mark.asyncio
async def test_websocket_room_lifecycle_and_broadcast():
    """
    Tests ConnectionManager room isolation, connection registration,
    and multi-subscriber broadcast distribution.
    """
    mgr = ConnectionManager()
    session1 = uuid.uuid4()
    session2 = uuid.uuid4()

    # Mock WebSockets
    ws1 = MagicMock()
    ws1.client_state = WebSocketState.CONNECTED
    ws1.accept = AsyncMock()
    ws1.send_text = AsyncMock()

    ws2 = MagicMock()
    ws2.client_state = WebSocketState.CONNECTED
    ws2.accept = AsyncMock()
    ws2.send_text = AsyncMock()

    ws3 = MagicMock()
    ws3.client_state = WebSocketState.CONNECTED
    ws3.accept = AsyncMock()
    ws3.send_text = AsyncMock()

    # Connect ws1 and ws2 to session1 room
    await mgr.connect(ws1, session1)
    await mgr.connect(ws2, session1)
    # Connect ws3 to session2 room
    await mgr.connect(ws3, session2)

    assert mgr.subscriber_count(session1) == 2
    assert mgr.subscriber_count(session2) == 1
    assert set(mgr.active_rooms()) == {session1, session2}

    # Broadcast an attendance.marked event to session1
    event = make_attendance_event(
        session_id=session1,
        data=AttendanceMarkedData(
            record_id=uuid.uuid4(),
            student_id=uuid.uuid4(),
            student_name="Alice Student",
            institution_id="STU-101",
            status=AttendanceStatus.PRESENT,
            distance_meters=14.2,
            marked_at=datetime.now(timezone.utc),
        )
    )

    await mgr.broadcast(session1, event)

    # ws1 and ws2 received the message
    assert ws1.send_text.called
    assert ws2.send_text.called
    # ws3 (session2) did NOT receive the message (room isolation)
    assert not ws3.send_text.called

    # Disconnect ws1
    mgr.disconnect(ws1, session1)
    assert mgr.subscriber_count(session1) == 1

    # Disconnect remaining
    mgr.disconnect(ws2, session1)
    assert mgr.subscriber_count(session1) == 0
    assert session1 not in mgr.active_rooms()


@pytest.mark.asyncio
async def test_websocket_dead_connection_cleanup():
    """
    Tests that dead or dropped connections are pruned automatically during broadcast.
    """
    mgr = ConnectionManager()
    session_id = uuid.uuid4()

    # Normal connected client
    alive_ws = MagicMock()
    alive_ws.client_state = WebSocketState.CONNECTED
    alive_ws.accept = AsyncMock()
    alive_ws.send_text = AsyncMock()

    # Dead client
    dead_ws = MagicMock()
    dead_ws.client_state = WebSocketState.DISCONNECTED
    dead_ws.accept = AsyncMock()
    dead_ws.send_text = AsyncMock()

    await mgr.connect(alive_ws, session_id)
    await mgr.connect(dead_ws, session_id)
    assert mgr.subscriber_count(session_id) == 2

    event = make_session_ended_event(
        session_id=session_id,
        data=SessionEndedData(
            session_id=session_id,
            ended_at=datetime.now(timezone.utc),
            total_attendees=42,
        )
    )

    await mgr.broadcast(session_id, event)

    # The dead client is detected and removed from the room automatically
    assert mgr.subscriber_count(session_id) == 1
    assert alive_ws in mgr._rooms[session_id]
    assert dead_ws not in mgr._rooms[session_id]
