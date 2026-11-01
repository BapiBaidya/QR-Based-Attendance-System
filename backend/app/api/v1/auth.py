import uuid
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from jose import JWTError

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.attendance import AuditLog
from app.schemas.auth import (
    Token,
    LoginRequest,
    RefreshTokenRequest,
    UserCreate,
    UserResponse,
    DeviceBindRequest,
)
from app.schemas.attendance import AuditLogResponse
from app.core.limiter import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_in: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Registers a new user (Student, Teacher, or Admin).
    Verifies that email and institution_id are unique.
    """
    # Check if email exists
    stmt_email = select(User).where(User.email == user_in.email)
    existing_email = (await db.execute(stmt_email)).scalar_one_or_none()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists."
        )

    # Check if institution_id exists
    stmt_inst = select(User).where(User.institution_id == user_in.institution_id)
    existing_inst = (await db.execute(stmt_inst)).scalar_one_or_none()
    if existing_inst:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this institution ID already exists."
        )

    # Hash password with Argon2
    hashed_pw = get_password_hash(user_in.password)

    new_user = User(
        email=user_in.email,
        institution_id=user_in.institution_id,
        full_name=user_in.full_name,
        role=user_in.role,
        hashed_password=hashed_pw,
        is_active=True
    )
    try:
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email or institution ID already exists."
        )
    return new_user


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Authenticates a user via email and password.
    Rate limited: 5 requests per minute per IP to prevent brute-force attacks.
    Returns JWT Access Token (short-lived) and Refresh Token (long-lived).
    """
    stmt = select(User).where(User.email == login_data.email)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is deactivated"
        )

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_in: RefreshTokenRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Issues a new access and refresh token pair using a valid refresh token.
    """
    try:
        payload = decode_token(refresh_in.refresh_token)
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expired or malformed refresh token",
        )

    stmt = select(User).where(User.id == uuid.UUID(user_id))
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    new_access_token = create_access_token(subject=user.id)
    new_refresh_token = create_refresh_token(subject=user.id)

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/device/bind", response_model=UserResponse)
async def bind_device(
    bind_data: DeviceBindRequest,
    current_user: Annotated[User, Depends(require_roles([UserRole.STUDENT]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Binds the current student's account to a physical mobile hardware device ID.
    If the account is already bound to a different device, rejects to prevent proxy sharing.
    """
    # Check if already bound to another phone
    if current_user.device_id and current_user.device_id != bind_data.device_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account is already registered to another device. Contact your administrator to reset your device binding."
        )

    current_user.device_id = bind_data.device_id
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Returns the profile and role details of the authenticated user.
    """
    return current_user


@router.post("/admin/users/{user_id}/reset-device", response_model=UserResponse)
async def admin_reset_device(
    user_id: uuid.UUID,
    admin_user: Annotated[User, Depends(require_roles([UserRole.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Administrative endpoint: resets a student's bound hardware device UUID.
    Restricted to Admins only.
    Emits an immutable audit log entry for compliance.
    """
    stmt = select(User).where(User.id == user_id)
    target_user = (await db.execute(stmt)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    prev_device_id = target_user.device_id
    target_user.device_id = None

    audit = AuditLog(
        actor_id=admin_user.id,
        action="DEVICE_RESET",
        resource_type="USER",
        resource_id=target_user.id,
        payload={"previous_device_id": prev_device_id, "admin_email": admin_user.email}
    )
    db.add(audit)
    await db.commit()
    await db.refresh(target_user)
    return target_user


@router.get("/admin/users", response_model=List[UserResponse])
async def list_users(
    admin_user: Annotated[User, Depends(require_roles([UserRole.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    role: UserRole | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Administrative endpoint: Lists system users with optional role filter.
    Enables tracking of registered students, faculty, and their device bindings.
    """
    stmt = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    if role:
        stmt = stmt.where(User.role == role)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/admin/audit-logs", response_model=List[AuditLogResponse])
async def list_audit_logs(
    admin_user: Annotated[User, Depends(require_roles([UserRole.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Administrative endpoint: Inspects system audit trail for security compliance and audit readiness.
    """
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


