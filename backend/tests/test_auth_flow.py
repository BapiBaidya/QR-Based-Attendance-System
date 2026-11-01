import uuid
import pytest
import pytest_asyncio
import httpx
from app.main import app


@pytest.fixture(autouse=True)
def disable_rate_limiter():
    """Disable rate limiting during test execution to prevent test throttling."""
    app.state.limiter.enabled = False
    yield
    app.state.limiter.enabled = True


@pytest_asyncio.fixture
async def async_client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def get_error_msg(res: httpx.Response) -> str:
    body = res.json()
    if "error" in body and isinstance(body["error"], dict):
        return body["error"].get("message", "")
    return body.get("detail", "")


@pytest.mark.asyncio
async def test_full_auth_rbac_and_device_binding_lifecycle(async_client: httpx.AsyncClient):
    # Unique IDs for test run
    run_id = uuid.uuid4().hex[:8]
    student_email = f"student_{run_id}@university.edu"
    student_inst_id = f"STU-{run_id}"
    student_password = "StudentStrongPass123!"

    admin_email = f"admin_{run_id}@university.edu"
    admin_inst_id = f"ADM-{run_id}"
    admin_password = "AdminStrongPass123!"

    # -------------------------------------------------------------
    # 1. User Registration (Student & Admin)
    # -------------------------------------------------------------
    stu_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": student_email,
            "institution_id": student_inst_id,
            "full_name": "Test Student",
            "role": "STUDENT",
            "password": student_password,
        },
    )
    assert stu_res.status_code == 201
    stu_data = stu_res.json()
    student_id = stu_data["id"]
    assert stu_data["email"] == student_email
    assert stu_data["role"] == "STUDENT"
    assert stu_data["device_id"] is None

    # Register Admin
    adm_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": admin_email,
            "institution_id": admin_inst_id,
            "full_name": "Test Administrator",
            "role": "ADMIN",
            "password": admin_password,
        },
    )
    assert adm_res.status_code == 201
    admin_data = adm_res.json()
    assert admin_data["role"] == "ADMIN"

    # -------------------------------------------------------------
    # 2. Duplicate Registration Rejection
    # -------------------------------------------------------------
    dup_email_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": student_email,
            "institution_id": f"DIFF-{run_id}",
            "full_name": "Duplicate Student",
            "role": "STUDENT",
            "password": "Password123!",
        },
    )
    assert dup_email_res.status_code == 400
    assert "email address already exists" in get_error_msg(dup_email_res)

    dup_inst_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"diff_{run_id}@university.edu",
            "institution_id": student_inst_id,
            "full_name": "Duplicate Student",
            "role": "STUDENT",
            "password": "Password123!",
        },
    )
    assert dup_inst_res.status_code == 400
    assert "institution ID already exists" in get_error_msg(dup_inst_res)

    # -------------------------------------------------------------
    # 3. Login & Credential Verification
    # -------------------------------------------------------------
    # Invalid password fails
    bad_login_res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": student_email, "password": "WrongPassword!"},
    )
    assert bad_login_res.status_code == 401
    assert "Incorrect email or password" in get_error_msg(bad_login_res)

    # Valid Student Login
    stu_login_res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": student_email, "password": student_password},
    )
    assert stu_login_res.status_code == 200
    stu_tokens = stu_login_res.json()
    assert "access_token" in stu_tokens
    assert "refresh_token" in stu_tokens
    stu_access = stu_tokens["access_token"]
    stu_refresh = stu_tokens["refresh_token"]

    # Valid Admin Login
    adm_login_res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": admin_password},
    )
    assert adm_login_res.status_code == 200
    adm_access = adm_login_res.json()["access_token"]

    # -------------------------------------------------------------
    # 4. Token Refresh Lifecycle
    # -------------------------------------------------------------
    refresh_res = await async_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": stu_refresh},
    )
    assert refresh_res.status_code == 200
    new_tokens = refresh_res.json()
    assert "access_token" in new_tokens
    assert "refresh_token" in new_tokens

    # Attempting to use an access token as refresh token should be rejected
    invalid_refresh = await async_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": stu_access},
    )
    assert invalid_refresh.status_code == 401

    # -------------------------------------------------------------
    # 5. Authenticated Profile Inspection (/me)
    # -------------------------------------------------------------
    # Unauthorized without header
    unauth_me = await async_client.get("/api/v1/auth/me")
    assert unauth_me.status_code == 401

    # Authorized with Student token
    stu_me = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {stu_access}"},
    )
    assert stu_me.status_code == 200
    assert stu_me.json()["email"] == student_email
    assert stu_me.json()["role"] == "STUDENT"

    # -------------------------------------------------------------
    # 6. Hardware Device Binding (Anti-Proxy Protocol)
    # -------------------------------------------------------------
    first_device_id = f"device-uuid-{run_id}-phone-alpha"
    second_device_id = f"device-uuid-{run_id}-phone-beta"

    # Initial device bind succeeds
    bind_res1 = await async_client.post(
        "/api/v1/auth/device/bind",
        headers={"Authorization": f"Bearer {stu_access}"},
        json={"device_id": first_device_id},
    )
    assert bind_res1.status_code == 200
    assert bind_res1.json()["device_id"] == first_device_id

    # Re-binding identical device is idempotent and succeeds
    bind_same = await async_client.post(
        "/api/v1/auth/device/bind",
        headers={"Authorization": f"Bearer {stu_access}"},
        json={"device_id": first_device_id},
    )
    assert bind_same.status_code == 200

    # Attempting to bind from a different device is REJECTED (409 Conflict)
    bind_conflict = await async_client.post(
        "/api/v1/auth/device/bind",
        headers={"Authorization": f"Bearer {stu_access}"},
        json={"device_id": second_device_id},
    )
    assert bind_conflict.status_code == 409
    assert "already registered to another device" in get_error_msg(bind_conflict)

    # -------------------------------------------------------------
    # 7. Role-Based Access Control (RBAC) & Admin Reset
    # -------------------------------------------------------------
    # Student attempting to access Admin endpoint -> 403 FORBIDDEN
    stu_reset_attempt = await async_client.post(
        f"/api/v1/auth/admin/users/{student_id}/reset-device",
        headers={"Authorization": f"Bearer {stu_access}"},
    )
    assert stu_reset_attempt.status_code == 403
    assert "Operation not permitted" in get_error_msg(stu_reset_attempt)

    # Admin resetting student device -> 200 SUCCESS
    adm_reset = await async_client.post(
        f"/api/v1/auth/admin/users/{student_id}/reset-device",
        headers={"Authorization": f"Bearer {adm_access}"},
    )
    assert adm_reset.status_code == 200
    assert adm_reset.json()["device_id"] is None

    # Student can now successfully bind to their new device
    bind_new_phone = await async_client.post(
        "/api/v1/auth/device/bind",
        headers={"Authorization": f"Bearer {stu_access}"},
        json={"device_id": second_device_id},
    )
    assert bind_new_phone.status_code == 200
    assert bind_new_phone.json()["device_id"] == second_device_id

    # -------------------------------------------------------------
    # 8. Password Strength & Input Constraints
    # -------------------------------------------------------------
    short_pw_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"short_{run_id}@university.edu",
            "institution_id": f"SHORT-{run_id}",
            "full_name": "Short Password User",
            "role": "STUDENT",
            "password": "short",  # < 8 chars
        },
    )
    assert short_pw_res.status_code == 422

    # -------------------------------------------------------------
    # 9. Admin User Management & Audit Log Trail Inspection
    # -------------------------------------------------------------
    # Student forbidden from viewing user list
    stu_users_forbidden = await async_client.get(
        "/api/v1/auth/admin/users",
        headers={"Authorization": f"Bearer {stu_access}"},
    )
    assert stu_users_forbidden.status_code == 403

    # Admin successfully lists users
    adm_users_res = await async_client.get(
        "/api/v1/auth/admin/users?limit=10",
        headers={"Authorization": f"Bearer {adm_access}"},
    )
    assert adm_users_res.status_code == 200
    users_list = adm_users_res.json()
    assert len(users_list) >= 2
    assert any(u["id"] == student_id for u in users_list)

    # Admin inspects audit trail and finds the DEVICE_RESET entry
    adm_audit_res = await async_client.get(
        "/api/v1/auth/admin/audit-logs?limit=20",
        headers={"Authorization": f"Bearer {adm_access}"},
    )
    assert adm_audit_res.status_code == 200
    audit_logs = adm_audit_res.json()
    assert len(audit_logs) >= 1
    assert any(
        log["action"] == "DEVICE_RESET" and log["resource_id"] == student_id
        for log in audit_logs
    )


