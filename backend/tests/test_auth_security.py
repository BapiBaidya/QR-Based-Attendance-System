import pytest
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)


def test_password_hashing_and_verification():
    raw_password = "SecurePassword123!"
    hashed = get_password_hash(raw_password)

    # Hash should not equal plain text
    assert hashed != raw_password
    # Verification should succeed for correct password
    assert verify_password(raw_password, hashed) is True
    # Verification should fail for wrong password
    assert verify_password("WrongPassword!", hashed) is False


def test_jwt_token_generation_and_decoding():
    user_id = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

    # Test Access Token
    access_token = create_access_token(subject=user_id)
    payload = decode_token(access_token)
    assert payload["sub"] == user_id
    assert payload["type"] == "access"
    assert "exp" in payload

    # Test Refresh Token
    refresh_token = create_refresh_token(subject=user_id)
    refresh_payload = decode_token(refresh_token)
    assert refresh_payload["sub"] == user_id
    assert refresh_payload["type"] == "refresh"
    assert "exp" in refresh_payload
