import uuid
from datetime import datetime, timezone
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.academic import Course
from app.models.session import ClassSession, SessionStatus
from app.models.attendance import AttendanceRecord
from app.schemas.session import SessionCreate, SessionResponse, QRPayloadResponse
from app.services.qr_service import DynamicQRService
from app.services.broadcast import manager as ws_manager
from app.schemas.ws import SessionEndedData, make_session_ended_event

router = APIRouter(prefix="/sessions", tags=["Class Sessions"])


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_in: SessionCreate,
    current_user: Annotated[User, Depends(require_roles([UserRole.TEACHER]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Teacher creates a new attendance session with classroom GPS coordinates and geofence radius.
    Generates a secure cryptographic secret for dynamic QR rotations.
    """
    # Verify course exists
    stmt_course = select(Course).where(Course.id == session_in.course_id)
    course = (await db.execute(stmt_course)).scalar_one_or_none()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # If teacher, verify they teach this course
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned as the teacher for this course"
        )

    # Generate cryptographic secret for this session
    qr_secret = DynamicQRService.generate_session_secret()

    new_session = ClassSession(
        course_id=session_in.course_id,
        teacher_id=current_user.id,
        title=session_in.title,
        status=SessionStatus.ACTIVE,
        qr_secret=qr_secret,
        latitude=session_in.latitude,
        longitude=session_in.longitude,
        radius_meters=session_in.radius_meters,
        started_at=datetime.now(timezone.utc),
    )

    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session


@router.get("/{session_id}/qr", response_model=QRPayloadResponse)
async def get_dynamic_qr_payload(
    session_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_roles([UserRole.TEACHER]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Returns the latest time-drifting, HMAC-signed dynamic QR code payload.
    The teacher dashboard polls this or receives it via WebSocket every 15-20s.
    """
    stmt = select(ClassSession).where(ClassSession.id == session_id)
    class_session = (await db.execute(stmt)).scalar_one_or_none()

    if not class_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session not found"
        )

    # Ownership check: Teacher can only project QR for their own sessions
    if class_session.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view the QR code for this session"
        )

    if class_session.status != SessionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot generate QR code: session is {class_session.status.value}"
        )

    payload = DynamicQRService.generate_qr_payload(
        session_id=str(class_session.id),
        session_secret=class_session.qr_secret
    )

    return QRPayloadResponse(
        sid=payload["sid"],
        ts=payload["ts"],
        nonce=payload["nonce"],
        sig=payload["sig"],
        expires_in_seconds=settings.QR_EXPIRY_SECONDS
    )


@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_roles([UserRole.TEACHER]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Teacher ends the session. Attendance submissions are locked.
    """
    stmt = select(ClassSession).where(ClassSession.id == session_id)
    class_session = (await db.execute(stmt)).scalar_one_or_none()

    if not class_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session not found"
        )

    # Ownership check: Teacher can only end their own sessions
    if class_session.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to end this class session"
        )

    if class_session.status != SessionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is already closed or not active"
        )

    class_session.status = SessionStatus.COMPLETED
    class_session.ended_at = datetime.now(timezone.utc)

    # Count total attendees for the session-ended broadcast payload
    count_stmt = select(func.count(AttendanceRecord.id)).where(
        AttendanceRecord.session_id == session_id
    )
    total_attendees = (await db.execute(count_stmt)).scalar() or 0

    await db.commit()
    await db.refresh(class_session)

    # Broadcast session.ended to all subscribed teacher/admin dashboards
    ended_event = make_session_ended_event(
        session_id=session_id,
        data=SessionEndedData(
            session_id=session_id,
            ended_at=class_session.ended_at,
            total_attendees=total_attendees,
        )
    )
    await ws_manager.broadcast(session_id=session_id, envelope=ended_event)

    return class_session
