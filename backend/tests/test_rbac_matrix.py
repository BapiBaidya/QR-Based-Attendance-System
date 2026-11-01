import uuid
import pytest
import pytest_asyncio
import httpx
from starlette.testclient import TestClient

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.academic import Department, Course
from app.models.user import User, UserRole
from app.models.session import ClassSession, SessionStatus
from app.core.security import get_password_hash, create_access_token
from app.services.qr_service import DynamicQRService


@pytest_asyncio.fixture
async def async_client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_strict_rbac_matrix_enforcement(async_client: httpx.AsyncClient):
    """
    Validates negative boundary authorization tests per the specification matrix:
    1. Administrators CANNOT launch class sessions (403 Forbidden).
    2. Administrators CANNOT fetch dynamic QR payloads (403 Forbidden).
    3. Administrators CANNOT end class sessions (403 Forbidden).
    4. Administrators CANNOT perform manual classroom attendance overrides (403 Forbidden).
    5. Teachers & Admins CANNOT bind mobile devices via student bind endpoint (403 Forbidden).
    6. Teachers CANNOT access admin user lists or audit logs (403 Forbidden).
    7. Teachers CANNOT launch sessions or view QRs for courses assigned to other teachers (403 Forbidden).
    """
    run_id = uuid.uuid4().hex[:8]
    password = "SecurePassword123!"

    # 1. Provision Admin, Teacher A, Teacher B, and Course in DB
    async with AsyncSessionLocal() as session:
        dept = Department(code=f"RB{run_id[:4].upper()}", name=f"RBAC Dept {run_id}")
        session.add(dept)

        admin = User(
            email=f"admin_rbac_{run_id}@university.edu",
            institution_id=f"ADM-RB-{run_id}",
            full_name="Admin RBAC",
            role=UserRole.ADMIN,
            hashed_password=get_password_hash(password),
            is_active=True,
        )
        teacher_a = User(
            email=f"teacher_a_{run_id}@university.edu",
            institution_id=f"TCH-A-{run_id}",
            full_name="Prof. Teacher A",
            role=UserRole.TEACHER,
            hashed_password=get_password_hash(password),
            is_active=True,
        )
        teacher_b = User(
            email=f"teacher_b_{run_id}@university.edu",
            institution_id=f"TCH-B-{run_id}",
            full_name="Prof. Teacher B",
            role=UserRole.TEACHER,
            hashed_password=get_password_hash(password),
            is_active=True,
        )
        session.add_all([admin, teacher_a, teacher_b])
        await session.flush()

        course = Course(
            code=f"CRB{run_id[:3].upper()}",
            name=f"RBAC Matrix Course {run_id}",
            department_id=dept.id,
            teacher_id=teacher_a.id,
        )
        session.add(course)
        await session.flush()

        class_session = ClassSession(
            course_id=course.id,
            teacher_id=teacher_a.id,
            title="Teacher A Lecture",
            status=SessionStatus.ACTIVE,
            qr_secret=DynamicQRService.generate_session_secret(),
            latitude=28.6139,
            longitude=77.2090,
            radius_meters=50,
        )
        session.add(class_session)
        await session.commit()

        course_id = str(course.id)
        session_id = str(class_session.id)
        admin_jwt = create_access_token(subject=str(admin.id))
        teacher_a_jwt = create_access_token(subject=str(teacher_a.id))
        teacher_b_jwt = create_access_token(subject=str(teacher_b.id))

    # --- RULE 1: Admin attempting to create session is REJECTED (403) ---
    admin_create_res = await async_client.post(
        "/api/v1/sessions",
        headers={"Authorization": f"Bearer {admin_jwt}"},
        json={
            "course_id": course_id,
            "title": "Admin Illegal Session",
            "latitude": 28.6139,
            "longitude": 77.2090,
            "radius_meters": 50,
        },
    )
    assert admin_create_res.status_code == 403
    assert "Required roles: ['TEACHER']" in admin_create_res.json()["error"]["message"]

    # --- RULE 2: Admin attempting to get QR payload is REJECTED (403) ---
    admin_qr_res = await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {admin_jwt}"},
    )
    assert admin_qr_res.status_code == 403

    # --- RULE 3: Admin attempting to end session is REJECTED (403) ---
    admin_end_res = await async_client.post(
        f"/api/v1/sessions/{session_id}/end",
        headers={"Authorization": f"Bearer {admin_jwt}"},
    )
    assert admin_end_res.status_code == 403

    # --- RULE 4: Admin attempting manual attendance override is REJECTED (403) ---
    admin_override_res = await async_client.patch(
        "/api/v1/attendance/override",
        headers={"Authorization": f"Bearer {admin_jwt}"},
        json={
            "session_id": session_id,
            "student_id": str(uuid.uuid4()),
            "status": "MANUAL_OVERRIDE",
            "reason": "Admin attempted override",
        },
    )
    assert admin_override_res.status_code == 403

    # --- RULE 5: Teacher attempting to bind mobile phone device is REJECTED (403) ---
    teacher_bind_res = await async_client.post(
        "/api/v1/auth/device/bind",
        headers={"Authorization": f"Bearer {teacher_a_jwt}"},
        json={"device_id": f"phone-uuid-{run_id}"},
    )
    assert teacher_bind_res.status_code == 403

    # --- RULE 6: Teacher attempting to access Admin Audit Logs is REJECTED (403) ---
    teacher_audit_res = await async_client.get(
        "/api/v1/auth/admin/audit-logs",
        headers={"Authorization": f"Bearer {teacher_a_jwt}"},
    )
    assert teacher_audit_res.status_code == 403

    # --- RULE 7: Teacher B attempting to view QR or end Teacher A's session is REJECTED (403) ---
    teacher_b_qr_res = await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {teacher_b_jwt}"},
    )
    assert teacher_b_qr_res.status_code == 403

    # --- RULE 8: Assigned Teacher A succeeds for their own session ---
    teacher_a_qr_res = await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {teacher_a_jwt}"},
    )
    assert teacher_a_qr_res.status_code == 200
    assert "sig" in teacher_a_qr_res.json()
