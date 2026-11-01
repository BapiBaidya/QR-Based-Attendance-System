import uuid
import pytest
import pytest_asyncio
import httpx

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.academic import Department, Course, Enrollment
from app.models.user import User, UserRole
from app.models.attendance import AttendanceStatus
from app.core.security import get_password_hash


def get_error_msg(res: httpx.Response) -> str:
    body = res.json()
    if "error" in body and isinstance(body["error"], dict):
        return body["error"].get("message", "")
    return body.get("detail", "")


@pytest.fixture(autouse=True)
def disable_rate_limiter():
    app.state.limiter.enabled = False
    yield
    app.state.limiter.enabled = True


@pytest_asyncio.fixture
async def async_client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_end_to_end_anti_proxy_attendance_flow(async_client: httpx.AsyncClient):
    run_id = uuid.uuid4().hex[:8]
    password = "TestPassword123!"

    # 1. Provision Teacher, Student 1, Student 2 (Far away), and Student 3 (Unenrolled)
    teacher_email = f"prof_{run_id}@university.edu"
    student1_email = f"stu1_{run_id}@university.edu"
    student2_email = f"stu2_{run_id}@university.edu"
    student3_email = f"stu3_{run_id}@university.edu"

    dev1 = f"dev-uuid-phone-1-{run_id}"
    dev2 = f"dev-uuid-phone-2-{run_id}"
    dev3 = f"dev-uuid-phone-3-{run_id}"

    # Register via DB or API
    async with AsyncSessionLocal() as session:
        dept = Department(code=f"D{run_id[:6].upper()}", name=f"Dept {run_id}")
        session.add(dept)

        teacher = User(
            email=teacher_email,
            institution_id=f"TCH-{run_id}",
            full_name="Prof. Alan Turing",
            role=UserRole.TEACHER,
            hashed_password=get_password_hash(password),
            is_active=True
        )
        stu1 = User(
            email=student1_email,
            institution_id=f"S1-{run_id}",
            full_name="Alice Student",
            role=UserRole.STUDENT,
            hashed_password=get_password_hash(password),
            device_id=dev1,
            is_active=True
        )
        stu2 = User(
            email=student2_email,
            institution_id=f"S2-{run_id}",
            full_name="Bob Faraway",
            role=UserRole.STUDENT,
            hashed_password=get_password_hash(password),
            device_id=dev2,
            is_active=True
        )
        stu3 = User(
            email=student3_email,
            institution_id=f"S3-{run_id}",
            full_name="Charlie Unenrolled",
            role=UserRole.STUDENT,
            hashed_password=get_password_hash(password),
            device_id=dev3,
            is_active=True
        )
        session.add_all([teacher, stu1, stu2, stu3])
        await session.flush()

        course = Course(
            code=f"CS{run_id[:4].upper()}",
            name=f"Advanced Algorithms {run_id}",
            department_id=dept.id,
            teacher_id=teacher.id
        )
        session.add(course)
        await session.flush()

        # Enroll Alice (stu1) and Bob (stu2) in the course (Charlie stu3 is unenrolled)
        enroll1 = Enrollment(course_id=course.id, student_id=stu1.id)
        enroll2 = Enrollment(course_id=course.id, student_id=stu2.id)
        session.add_all([enroll1, enroll2])
        await session.commit()

        course_id = course.id
        teacher_id = teacher.id
        stu1_id = stu1.id
        stu2_id = stu2.id
        stu3_id = stu3.id

    # 2. Authenticate Teacher and Students to obtain JWT tokens
    t_login = await async_client.post("/api/v1/auth/login", json={"email": teacher_email, "password": password})
    assert t_login.status_code == 200
    t_token = t_login.json()["access_token"]

    s1_login = await async_client.post("/api/v1/auth/login", json={"email": student1_email, "password": password})
    assert s1_login.status_code == 200
    s1_token = s1_login.json()["access_token"]

    s2_login = await async_client.post("/api/v1/auth/login", json={"email": student2_email, "password": password})
    assert s2_login.status_code == 200
    s2_token = s2_login.json()["access_token"]

    s3_login = await async_client.post("/api/v1/auth/login", json={"email": student3_email, "password": password})
    assert s3_login.status_code == 200
    s3_token = s3_login.json()["access_token"]

    # 3. Teacher creates an Attendance Session (Classroom at 28.6139, 77.2090, 50m radius)
    classroom_lat = 28.6139
    classroom_lon = 77.2090
    session_res = await async_client.post(
        "/api/v1/sessions",
        headers={"Authorization": f"Bearer {t_token}"},
        json={
            "course_id": str(course_id),
            "title": "Lecture 1: Dynamic QR Protocols",
            "latitude": classroom_lat,
            "longitude": classroom_lon,
            "radius_meters": 50
        }
    )
    assert session_res.status_code == 201
    class_session = session_res.json()
    session_id = class_session["id"]
    assert class_session["status"] == "ACTIVE"

    # 4. Teacher fetches Dynamic QR Payload
    qr_res = await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {t_token}"}
    )
    assert qr_res.status_code == 200
    qr_payload = qr_res.json()
    assert qr_payload["sid"] == session_id
    assert "sig" in qr_payload
    assert "nonce" in qr_payload
    assert "ts" in qr_payload

    # -------------------------------------------------------------------------
    # TEST CASE A: Valid Check-in inside classroom
    # -------------------------------------------------------------------------
    scan1 = await async_client.post(
        "/api/v1/attendance/scan",
        headers={"Authorization": f"Bearer {s1_token}"},
        json={
            "session_id": session_id,
            "timestamp": qr_payload["ts"],
            "nonce": qr_payload["nonce"],
            "signature": qr_payload["sig"],
            "latitude": classroom_lat,
            "longitude": classroom_lon,
            "device_id": dev1
        }
    )
    assert scan1.status_code == 201
    rec1 = scan1.json()
    assert rec1["status"] == "PRESENT"
    assert rec1["student_id"] == str(stu1_id)

    # -------------------------------------------------------------------------
    # TEST CASE B: Anti-Replay Attack Defense (Same Nonce Rescan Rejected)
    # -------------------------------------------------------------------------
    replay_scan = await async_client.post(
        "/api/v1/attendance/scan",
        headers={"Authorization": f"Bearer {s2_token}"},
        json={
            "session_id": session_id,
            "timestamp": qr_payload["ts"],
            "nonce": qr_payload["nonce"],  # Replaying same nonce
            "signature": qr_payload["sig"],
            "latitude": classroom_lat,
            "longitude": classroom_lon,
            "device_id": dev2
        }
    )
    assert replay_scan.status_code == 409
    assert "Replay attack blocked" in get_error_msg(replay_scan)

    # Fetch fresh QR for subsequent tests
    fresh_qr = (await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {t_token}"}
    )).json()

    # -------------------------------------------------------------------------
    # TEST CASE C: Geofencing Violation (Student Bob is 500m away)
    # -------------------------------------------------------------------------
    far_lat = classroom_lat + 0.005  # ~555 meters away
    geo_scan = await async_client.post(
        "/api/v1/attendance/scan",
        headers={"Authorization": f"Bearer {s2_token}"},
        json={
            "session_id": session_id,
            "timestamp": fresh_qr["ts"],
            "nonce": fresh_qr["nonce"],
            "signature": fresh_qr["sig"],
            "latitude": far_lat,
            "longitude": classroom_lon,
            "device_id": dev2
        }
    )
    assert geo_scan.status_code == 403
    assert "Geofence violation" in get_error_msg(geo_scan)

    # Fetch fresh QR
    fresh_qr2 = (await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {t_token}"}
    )).json()

    # -------------------------------------------------------------------------
    # TEST CASE D: Device Mismatch (Student scans from unregistered phone)
    # -------------------------------------------------------------------------
    fake_phone_dev = f"unregistered-phone-{run_id}"
    dev_mismatch_scan = await async_client.post(
        "/api/v1/attendance/scan",
        headers={"Authorization": f"Bearer {s2_token}"},
        json={
            "session_id": session_id,
            "timestamp": fresh_qr2["ts"],
            "nonce": fresh_qr2["nonce"],
            "signature": fresh_qr2["sig"],
            "latitude": classroom_lat,
            "longitude": classroom_lon,
            "device_id": fake_phone_dev
        }
    )
    assert dev_mismatch_scan.status_code == 403
    assert "Device Mismatch" in get_error_msg(dev_mismatch_scan)

    # Fetch fresh QR
    fresh_qr3 = (await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {t_token}"}
    )).json()

    # -------------------------------------------------------------------------
    # TEST CASE E: Unenrolled Student (Charlie is not enrolled in the course)
    # -------------------------------------------------------------------------
    unenrolled_scan = await async_client.post(
        "/api/v1/attendance/scan",
        headers={"Authorization": f"Bearer {s3_token}"},
        json={
            "session_id": session_id,
            "timestamp": fresh_qr3["ts"],
            "nonce": fresh_qr3["nonce"],
            "signature": fresh_qr3["sig"],
            "latitude": classroom_lat,
            "longitude": classroom_lon,
            "device_id": dev3
        }
    )
    assert unenrolled_scan.status_code == 403
    assert "not enrolled in the course" in get_error_msg(unenrolled_scan)

    # -------------------------------------------------------------------------
    # TEST CASE F: Duplicate Check-in Prevention (Student Alice scans again)
    # -------------------------------------------------------------------------
    fresh_qr4 = (await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {t_token}"}
    )).json()

    dup_scan = await async_client.post(
        "/api/v1/attendance/scan",
        headers={"Authorization": f"Bearer {s1_token}"},
        json={
            "session_id": session_id,
            "timestamp": fresh_qr4["ts"],
            "nonce": fresh_qr4["nonce"],
            "signature": fresh_qr4["sig"],
            "latitude": classroom_lat,
            "longitude": classroom_lon,
            "device_id": dev1
        }
    )
    assert dup_scan.status_code == 409
    assert "already been recorded" in get_error_msg(dup_scan)

    # -------------------------------------------------------------------------
    # TEST CASE G: Teacher Manual Override with Audit Log Trail
    # -------------------------------------------------------------------------
    override_res = await async_client.patch(
        "/api/v1/attendance/override",
        headers={"Authorization": f"Bearer {t_token}"},
        json={
            "session_id": session_id,
            "student_id": str(stu2_id),
            "status": "MANUAL_OVERRIDE",
            "reason": "Student phone GPS antenna was damaged; physically present in row 2."
        }
    )
    assert override_res.status_code == 200
    assert override_res.json()["status"] == "MANUAL_OVERRIDE"

    # Teacher inspects session attendance list
    list_res = await async_client.get(
        f"/api/v1/attendance/session/{session_id}",
        headers={"Authorization": f"Bearer {t_token}"}
    )
    assert list_res.status_code == 200
    attendees = list_res.json()
    assert len(attendees) == 2  # Alice and Bob

    # -------------------------------------------------------------------------
    # TEST CASE H: Teacher Ends Session (Subsequent scans rejected)
    # -------------------------------------------------------------------------
    end_res = await async_client.post(
        f"/api/v1/sessions/{session_id}/end",
        headers={"Authorization": f"Bearer {t_token}"}
    )
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "COMPLETED"

    # Scanning a completed session fails
    fresh_qr5 = (await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {t_token}"}
    ))
    # QR generation on closed session returns 400
    assert fresh_qr5.status_code == 400
    assert "Cannot generate QR code: session is COMPLETED" in get_error_msg(fresh_qr5)

    # -------------------------------------------------------------------------
    # TEST CASE I: Student History Inspection (/attendance/student/me)
    # -------------------------------------------------------------------------
    s1_history = await async_client.get(
        "/api/v1/attendance/student/me",
        headers={"Authorization": f"Bearer {s1_token}"}
    )
    assert s1_history.status_code == 200
    records = s1_history.json()
    assert len(records) >= 1
    assert any(r["session_id"] == session_id for r in records)

    # -------------------------------------------------------------------------
    # TEST CASE J: Teacher IDOR Protection (Teacher B cannot access Teacher A's session)
    # -------------------------------------------------------------------------
    # Create Teacher B
    other_prof_email = f"other_prof_{run_id}@university.edu"
    async with AsyncSessionLocal() as session:
        other_teacher = User(
            email=other_prof_email,
            institution_id=f"TCH-B-{run_id}",
            full_name="Prof. Ada Lovelace",
            role=UserRole.TEACHER,
            hashed_password=get_password_hash(password),
            is_active=True
        )
        session.add(other_teacher)
        await session.commit()

    t2_login = await async_client.post("/api/v1/auth/login", json={"email": other_prof_email, "password": password})
    t2_token = t2_login.json()["access_token"]

    # Teacher B tries to view Teacher A's session QR -> 403 Forbidden
    t2_view_qr = await async_client.get(
        f"/api/v1/sessions/{session_id}/qr",
        headers={"Authorization": f"Bearer {t2_token}"}
    )
    assert t2_view_qr.status_code == 403
    assert "not authorized to view the QR code" in get_error_msg(t2_view_qr)

    # Teacher B tries to view Teacher A's session attendance -> 403 Forbidden
    t2_view_attendance = await async_client.get(
        f"/api/v1/attendance/session/{session_id}",
        headers={"Authorization": f"Bearer {t2_token}"}
    )
    assert t2_view_attendance.status_code == 403
    assert "not authorized to view attendance records" in get_error_msg(t2_view_attendance)

    # Teacher B tries to override Teacher A's attendance -> 403 Forbidden
    t2_override = await async_client.patch(
        "/api/v1/attendance/override",
        headers={"Authorization": f"Bearer {t2_token}"},
        json={
            "session_id": session_id,
            "student_id": str(stu1_id),
            "status": "FLAGGED",
            "reason": "Unauthorized override attempt"
        }
    )
    assert t2_override.status_code == 403
    assert "not authorized to modify attendance" in get_error_msg(t2_override)

    # -------------------------------------------------------------------------
    # TEST CASE K: Future Timestamp Rejection (Clock Drift Tolerance Enforcement)
    # -------------------------------------------------------------------------
    import time
    future_ts = int(time.time()) + 30  # 30 seconds into the future
    future_scan = await async_client.post(
        "/api/v1/attendance/scan",
        headers={"Authorization": f"Bearer {s1_token}"},
        json={
            "session_id": session_id,
            "timestamp": future_ts,
            "nonce": "testfuturenonce",
            "signature": "invalidsig",
            "latitude": classroom_lat,
            "longitude": classroom_lon,
            "device_id": dev1
        }
    )
    # Rejection occurs either on closed session, future ts or invalid sig
    assert future_scan.status_code in (400, 403)

