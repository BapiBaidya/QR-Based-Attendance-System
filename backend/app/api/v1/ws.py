"""
WebSocket Endpoint — Real-Time Attendance Feed.

Endpoint:
    WS /api/v1/ws/sessions/{session_id}?token=<JWT_ACCESS_TOKEN>

Auth:
    JWT is passed as a query parameter because browsers cannot set custom
    Authorization headers in WebSocket upgrade requests. The token is
    validated on connect; if invalid, the connection is closed with 4001.

Lifecycle:
    1. Client connects and passes JWT as ?token= query param.
    2. Server validates JWT, fetches user, checks role (TEACHER or ADMIN).
    3. Server verifies the session exists and is ACTIVE.
    4. Server verifies the teacher owns the session (unless ADMIN).
    5. ACK envelope sent to the newly connected client.
    6. Server enters heartbeat loop — pings every 30s to keep the WS alive.
    7. Client can send {"event": "ping"} and receive a pong response.
    8. On disconnect, the connection is cleanly removed from the room.

Events pushed to the teacher:
    - session.connected  (on handshake success)
    - attendance.marked  (on each new student check-in)
    - session.ended      (when the session is closed)
    - error              (auth/validation failures before close)
"""
import asyncio
import uuid
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError
from starlette.websockets import WebSocketState

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.user import User, UserRole
from app.models.session import ClassSession, SessionStatus
from app.models.attendance import AttendanceRecord
from app.services.broadcast import manager
from app.schemas.ws import (
    ConnectionAckData,
    make_connection_ack_event,
    make_error_event,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket — Real-Time Feed"])

# Heartbeat interval in seconds (keep-alive ping to prevent proxy timeouts)
HEARTBEAT_INTERVAL = 30


# ---------------------------------------------------------------------------
# WebSocket JWT Authentication Helper
# ---------------------------------------------------------------------------

async def _authenticate_ws_user(token: str, db: AsyncSession) -> User | None:
    """
    Validates a JWT access token and returns the associated User.
    Returns None if the token is invalid, expired, or user is inactive.
    """
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if not user_id or token_type != "access":
            return None
    except JWTError:
        return None

    stmt = select(User).where(User.id == uuid.UUID(user_id))
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user or not user.is_active:
        return None

    return user


# ---------------------------------------------------------------------------
# Main WebSocket Endpoint
# ---------------------------------------------------------------------------

@router.websocket("/sessions/{session_id}")
async def realtime_session_feed(
    websocket: WebSocket,
    session_id: uuid.UUID,
    token: str = Query(..., description="JWT Access Token for authentication"),
):
    """
    Real-time WebSocket endpoint for the teacher's live attendance dashboard.

    Connect:  ws://<host>/api/v1/ws/sessions/{session_id}?token=<ACCESS_TOKEN>
    """
    # Use a fresh DB session for the WebSocket lifecycle (not a request-scoped one)
    async with AsyncSessionLocal() as db:

        # ------------------------------------------------------------------
        # Step 1: Authenticate the connecting client
        # ------------------------------------------------------------------
        user = await _authenticate_ws_user(token, db)
        if not user:
            await websocket.accept()
            await websocket.send_text(
                make_error_event(
                    session_id=session_id,
                    code="AUTH_FAILED",
                    message="Invalid or expired token. Connection refused."
                ).model_dump_json()
            )
            await websocket.close(code=4001)
            logger.warning("WS AUTH FAILED | session=%s | token_prefix=%s", session_id, token[:10])
            return

        # ------------------------------------------------------------------
        # Step 2: Enforce TEACHER role
        # ------------------------------------------------------------------
        if user.role != UserRole.TEACHER:
            await websocket.accept()
            await websocket.send_text(
                make_error_event(
                    session_id=session_id,
                    code="FORBIDDEN",
                    message="Only the assigned class teacher may subscribe to the live attendance feed."
                ).model_dump_json()
            )
            await websocket.close(code=4003)
            return

        # ------------------------------------------------------------------
        # Step 3: Verify the session exists and is ACTIVE
        # ------------------------------------------------------------------
        stmt = select(ClassSession).where(ClassSession.id == session_id)
        class_session = (await db.execute(stmt)).scalar_one_or_none()

        if not class_session:
            await websocket.accept()
            await websocket.send_text(
                make_error_event(
                    session_id=session_id,
                    code="SESSION_NOT_FOUND",
                    message="The requested class session does not exist."
                ).model_dump_json()
            )
            await websocket.close(code=4004)
            return

        if class_session.status != SessionStatus.ACTIVE:
            await websocket.accept()
            await websocket.send_text(
                make_error_event(
                    session_id=session_id,
                    code="SESSION_CLOSED",
                    message=f"Session is not active (status: {class_session.status.value})."
                ).model_dump_json()
            )
            await websocket.close(code=4005)
            return

        # ------------------------------------------------------------------
        # Step 4: Verify ownership (teacher must own this session)
        # ------------------------------------------------------------------
        if class_session.teacher_id != user.id:
            await websocket.accept()
            await websocket.send_text(
                make_error_event(
                    session_id=session_id,
                    code="OWNERSHIP_DENIED",
                    message="You are not the teacher assigned to this session."
                ).model_dump_json()
            )
            await websocket.close(code=4003)
            return

        # ------------------------------------------------------------------
        # Step 5: Accept connection and register in the room
        # ------------------------------------------------------------------
        await manager.connect(websocket, session_id)

        ack = make_connection_ack_event(
            session_id=session_id,
            data=ConnectionAckData(
                session_id=session_id,
                subscribed_as=user.role.value,
                message=(
                    f"Connected to live attendance feed for '{class_session.title}'. "
                    f"Heartbeat every {HEARTBEAT_INTERVAL}s."
                )
            )
        )
        await manager.send_personal(websocket, ack)
        logger.info(
            "WS SUBSCRIBED | user=%s | role=%s | session=%s",
            user.id, user.role.value, session_id,
        )

        # ------------------------------------------------------------------
        # Step 6: Heartbeat loop with client message handling
        # ------------------------------------------------------------------
        try:
            while True:
                try:
                    # Wait for a client message with timeout = heartbeat interval
                    raw = await asyncio.wait_for(
                        websocket.receive_text(),
                        timeout=HEARTBEAT_INTERVAL,
                    )

                    # Handle client-initiated ping
                    try:
                        import json as _json
                        msg = _json.loads(raw)
                        if msg.get("event") == "ping":
                            await websocket.send_text('{"event":"pong"}')
                    except Exception:
                        pass  # Ignore malformed client messages silently

                except asyncio.TimeoutError:
                    # Heartbeat: server-initiated ping to keep connection alive
                    if websocket.client_state == WebSocketState.CONNECTED:
                        await websocket.send_text('{"event":"ping"}')
                    else:
                        break

        except WebSocketDisconnect:
            logger.info("WS NORMAL DISCONNECT | user=%s | session=%s", user.id, session_id)
        except Exception as exc:
            logger.exception("WS UNEXPECTED ERROR | user=%s | session=%s | err=%s", user.id, session_id, exc)
        finally:
            manager.disconnect(websocket, session_id)
