import uuid
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.session import ClassSession, SessionStatus
from app.models.academic import Enrollment
from app.models.attendance import AttendanceRecord, AttendanceStatus, AuditLog
from app.schemas.attendance import AttendanceScanRequest, AttendanceResponse, ManualAttendanceOverride
from app.services.qr_service import DynamicQRService
from app.services.geo_service import is_within_geofence
from app.services.nonce_store import nonce_store
from app.services.broadcast import manager as ws_manager
from app.schemas.ws import AttendanceMarkedData, make_attendance_event

router = APIRouter(prefix="/attendance", tags=["Attendance Records"])


@router.post("/scan", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
async def scan_and_mark_attendance(
    scan_data: AttendanceScanRequest,
    current_user: Annotated[User, Depends(require_roles([UserRole.STUDENT]))],
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Production-Hardened Anti-Proxy Check-in:
    1. Device Binding Verification: Locks student to their hardware phone UUID.
    2. Session & Enrollment Validation: Verifies active session and active course enrollment.
    3. Replay Protection: Atomically burns nonce using Redis/TTLCache.
    4. Cryptographic HMAC-SHA256 Verification: Constant-time signature & timestamp drift checks.
    5. Geofencing: Verifies distance using Haversine formula against classroom center.
    6. Atomic Upsert: Uses PostgreSQL ON CONFLICT DO NOTHING to prevent race condition duplicates.
    """
    # 1. Device Binding Check
    if not current_user.device_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account has not registered a primary device. Please bind your device in settings first."
        )

    if current_user.device_id != scan_data.device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Device Mismatch: Attendance can only be recorded from your registered physical device."
        )

    # 2. Fetch Class Session
    stmt_session = select(ClassSession).where(ClassSession.id == scan_data.session_id)
    class_session = (await db.execute(stmt_session)).scalar_one_or_none()

    if not class_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session does not exist."
        )

    if class_session.status != SessionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance session is closed (Status: {class_session.status.value})."
        )

    # 3. Check Course Enrollment
    stmt_enroll = select(Enrollment).where(
        Enrollment.course_id == class_session.course_id,
        Enrollment.student_id == current_user.id
    )
    is_enrolled = (await db.execute(stmt_enroll)).scalar_one_or_none()
    if not is_enrolled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not enrolled in the course associated with this class session."
        )

    # 4. Cryptographic QR Signature & Expiry Verification (Constant-Time HMAC-SHA256)
    qr_result = DynamicQRService.verify_qr_payload(
        session_secret=class_session.qr_secret,
        session_id=str(scan_data.session_id),
        timestamp=scan_data.timestamp,
        nonce=scan_data.nonce,
        received_signature=scan_data.signature,
        burned_nonces_set=None
    )
    if not qr_result.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"QR verification failed: {qr_result.reason}"
        )

    # 5. Geofence Verification (Haversine Formula)
    is_inside, distance = is_within_geofence(
        student_lat=scan_data.latitude,
        student_lon=scan_data.longitude,
        classroom_lat=class_session.latitude,
        classroom_lon=class_session.longitude,
        allowed_radius_meters=class_session.radius_meters
    )
    if not is_inside:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Geofence violation: You are {distance}m away (Maximum allowed: {class_session.radius_meters}m)."
        )

    # 6. Atomic Nonce Burn (Redis SETNX / TTLCache)
    # Burned ONLY after signature and geofence pass, preventing DoS on valid QRs by invalid requests
    is_nonce_fresh = await nonce_store.burn_nonce(scan_data.nonce)
    if not is_nonce_fresh:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="QR code token has already been scanned. Replay attack blocked."
        )

    # 7. Atomic Insert with ON CONFLICT DO NOTHING (Race Condition Resistant)
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    insert_stmt = (
        insert(AttendanceRecord)
        .values(
            session_id=class_session.id,
            student_id=current_user.id,
            status=AttendanceStatus.PRESENT,
            distance_meters=distance,
            device_id=scan_data.device_id,
            ip_address=ip_address,
            user_agent=user_agent
        )
        .on_conflict_do_nothing(
            constraint="uq_session_student"
        )
        .returning(AttendanceRecord)
    )

    result = await db.execute(insert_stmt)
    record = result.scalar_one_or_none()

    if not record:
        # Conflict triggered: record was already inserted concurrently
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance has already been recorded for this session."
        )

    await db.commit()

    # Broadcast real-time event to all teacher WebSocket subscribers of this session
    event = make_attendance_event(
        session_id=record.session_id,
        data=AttendanceMarkedData(
            record_id=record.id,
            student_id=record.student_id,
            student_name=current_user.full_name,
            institution_id=current_user.institution_id,
            status=record.status,
            distance_meters=record.distance_meters,
            marked_at=record.marked_at,
        )
    )
    await ws_manager.broadcast(session_id=record.session_id, envelope=event)

    return record


@router.get("/session/{session_id}", response_model=List[AttendanceResponse])
async def get_session_attendance(
    session_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_roles([UserRole.TEACHER, UserRole.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Teacher/Admin views all attendance records for a given session.
    Enforces authorization: teachers can only view records for their own sessions.
    """
    stmt_session = select(ClassSession).where(ClassSession.id == session_id)
    class_session = (await db.execute(stmt_session)).scalar_one_or_none()
    if not class_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session not found"
        )

    if current_user.role == UserRole.TEACHER and class_session.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view attendance records for this session"
        )

    stmt = (
        select(AttendanceRecord)
        .where(AttendanceRecord.session_id == session_id)
        .order_by(AttendanceRecord.marked_at.desc())
    )
    records = (await db.execute(stmt)).scalars().all()
    return records


@router.patch("/override", response_model=AttendanceResponse)
async def manual_attendance_override(
    override_data: ManualAttendanceOverride,
    current_user: Annotated[User, Depends(require_roles([UserRole.TEACHER]))],
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Allows the assigned course teacher to manually correct attendance with an audit reason logged.
    Enforces authorization: teachers can only override records in their own sessions.
    """
    stmt_session = select(ClassSession).where(ClassSession.id == override_data.session_id)
    class_session = (await db.execute(stmt_session)).scalar_one_or_none()
    if not class_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class session not found"
        )

    if class_session.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to modify attendance for this class session"
        )

    stmt = select(AttendanceRecord).where(
        AttendanceRecord.session_id == override_data.session_id,
        AttendanceRecord.student_id == override_data.student_id
    )
    record = (await db.execute(stmt)).scalar_one_or_none()

    if not record:
        record = AttendanceRecord(
            session_id=override_data.session_id,
            student_id=override_data.student_id,
            status=override_data.status,
            device_id="MANUAL_OVERRIDE",
            distance_meters=0.0
        )
        db.add(record)
        # Flush to get the DB-assigned UUID before creating the audit log
        await db.flush()
    else:
        record.status = override_data.status

    audit = AuditLog(
        actor_id=current_user.id,
        action="ATTENDANCE_MANUAL_OVERRIDE",
        resource_type="attendance_records",
        resource_id=record.id,
        payload={
            "student_id": str(override_data.student_id),
            "session_id": str(override_data.session_id),
            "new_status": override_data.status.value,
            "reason": override_data.reason,
        },
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)

    await db.commit()
    await db.refresh(record)
    return record


@router.get("/student/me", response_model=List[AttendanceResponse])
async def get_my_attendance_history(
    current_user: Annotated[User, Depends(require_roles([UserRole.STUDENT]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    offset: int = 0
):
    """
    Enables authenticated students to inspect their own attendance history and verification records.
    """
    stmt = (
        select(AttendanceRecord)
        .where(AttendanceRecord.student_id == current_user.id)
        .order_by(AttendanceRecord.marked_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

