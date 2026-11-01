"""
WebSocket Connection Manager — Session Room Pub/Sub Engine.

Design:
  - Each class session has its own isolated "room" keyed by session_id (UUID).
  - Multiple teachers / admins can subscribe to the same room (e.g., a co-teacher).
  - The broadcast() method sends a typed WSEnvelope to all active connections in a room.
  - All connections are tracked per room so that disconnects are isolated.
  - Thread-safe for a single asyncio event loop (standard FastAPI / Uvicorn setup).
  - For multi-worker deployments, replace in-process dict with Redis Pub/Sub.
"""
import asyncio
import json
import logging
import uuid
from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.schemas.ws import WSEnvelope

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages per-session WebSocket subscriber rooms.

    Usage:
        manager = ConnectionManager()        # singleton in main module
        await manager.connect(ws, session_id)
        await manager.broadcast(session_id, envelope)
        manager.disconnect(ws, session_id)
    """

    def __init__(self) -> None:
        # session_id -> set of active WebSocket connections
        self._rooms: Dict[uuid.UUID, Set[WebSocket]] = defaultdict(set)

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self, websocket: WebSocket, session_id: uuid.UUID) -> None:
        """Accept the WebSocket and register it in the session room."""
        await websocket.accept()
        self._rooms[session_id].add(websocket)
        logger.info(
            "WS CONNECT  | session=%s | connections_in_room=%d",
            session_id,
            len(self._rooms[session_id]),
        )

    def disconnect(self, websocket: WebSocket, session_id: uuid.UUID) -> None:
        """Remove the WebSocket from the session room on disconnect."""
        self._rooms[session_id].discard(websocket)
        logger.info(
            "WS DISCONNECT | session=%s | connections_in_room=%d",
            session_id,
            len(self._rooms[session_id]),
        )
        # Clean up empty rooms to prevent memory leak
        if not self._rooms[session_id]:
            del self._rooms[session_id]

    # ------------------------------------------------------------------
    # Messaging
    # ------------------------------------------------------------------

    async def broadcast(self, session_id: uuid.UUID, envelope: WSEnvelope) -> None:
        """
        Broadcasts a typed WSEnvelope to all subscribers of a session room.
        Dead connections are silently cleaned up.
        """
        room = self._rooms.get(session_id)
        if not room:
            return  # No active subscribers — nothing to do

        payload = envelope.model_dump_json()
        dead: list[WebSocket] = []

        for connection in list(room):
            if connection.client_state != WebSocketState.CONNECTED:
                dead.append(connection)
                continue
            try:
                await connection.send_text(payload)
            except Exception as exc:
                logger.warning(
                    "WS BROADCAST FAILED | session=%s | reason=%s — marking connection dead",
                    session_id,
                    exc,
                )
                dead.append(connection)

        # Clean up stale connections discovered during broadcast
        for conn in dead:
            self.disconnect(conn, session_id)

    async def send_personal(self, websocket: WebSocket, envelope: WSEnvelope) -> None:
        """Sends a message to a single connection (e.g., ACK or error)."""
        try:
            await websocket.send_text(envelope.model_dump_json())
        except Exception as exc:
            logger.warning("WS PERSONAL SEND FAILED | reason=%s", exc)

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def subscriber_count(self, session_id: uuid.UUID) -> int:
        """Returns the number of active subscribers for a session."""
        return len(self._rooms.get(session_id, set()))

    def active_rooms(self) -> list[uuid.UUID]:
        """Returns a list of all session IDs with at least one active subscriber."""
        return list(self._rooms.keys())


# ---------------------------------------------------------------------------
# Module-level singleton — imported by ws.py, attendance.py, sessions.py
# ---------------------------------------------------------------------------
manager = ConnectionManager()
