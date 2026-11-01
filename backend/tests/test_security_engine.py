import pytest
import time
from app.services.qr_service import DynamicQRService
from app.services.geo_service import haversine_distance, is_within_geofence


def test_qr_generation_and_valid_verification():
    secret = DynamicQRService.generate_session_secret()
    session_id = "test-session-uuid-1234"

    # Generate payload
    payload = DynamicQRService.generate_qr_payload(session_id, secret)

    assert "sid" in payload
    assert "ts" in payload
    assert "nonce" in payload
    assert "sig" in payload

    # Verify immediately
    burned_nonces = set()
    result = DynamicQRService.verify_qr_payload(
        session_secret=secret,
        session_id=payload["sid"],
        timestamp=payload["ts"],
        nonce=payload["nonce"],
        received_signature=payload["sig"],
        burned_nonces_set=burned_nonces,
    )
    assert result.is_valid is True
    assert result.reason == "Verified successfully"


def test_qr_tampering_fails():
    secret = DynamicQRService.generate_session_secret()
    session_id = "test-session-uuid-1234"
    payload = DynamicQRService.generate_qr_payload(session_id, secret)

    # Tamper with the timestamp
    result = DynamicQRService.verify_qr_payload(
        session_secret=secret,
        session_id=payload["sid"],
        timestamp=payload["ts"] + 1,  # modified
        nonce=payload["nonce"],
        received_signature=payload["sig"],
    )
    assert result.is_valid is False
    assert "Invalid cryptographic signature" in result.reason


def test_qr_replay_prevention():
    secret = DynamicQRService.generate_session_secret()
    session_id = "test-session-uuid-1234"
    payload = DynamicQRService.generate_qr_payload(session_id, secret)

    burned_nonces = set()
    # First scan succeeds
    res1 = DynamicQRService.verify_qr_payload(
        session_secret=secret,
        session_id=payload["sid"],
        timestamp=payload["ts"],
        nonce=payload["nonce"],
        received_signature=payload["sig"],
        burned_nonces_set=burned_nonces,
    )
    assert res1.is_valid is True

    # Second scan with identical nonce fails (prevent replay attack)
    res2 = DynamicQRService.verify_qr_payload(
        session_secret=secret,
        session_id=payload["sid"],
        timestamp=payload["ts"],
        nonce=payload["nonce"],
        received_signature=payload["sig"],
        burned_nonces_set=burned_nonces,
    )
    assert res2.is_valid is False
    assert "already been scanned" in res2.reason


def test_qr_expiration():
    secret = DynamicQRService.generate_session_secret()
    session_id = "test-session-uuid-1234"
    old_timestamp = int(time.time()) - 60  # 60 seconds ago (expired)
    nonce = DynamicQRService.generate_nonce()
    sig = DynamicQRService.compute_signature(secret, session_id, old_timestamp, nonce)

    result = DynamicQRService.verify_qr_payload(
        session_secret=secret,
        session_id=session_id,
        timestamp=old_timestamp,
        nonce=nonce,
        received_signature=sig,
    )
    assert result.is_valid is False
    assert "expired" in result.reason


def test_geofencing_haversine():
    # Classroom at (28.6139, 77.2090)
    class_lat, class_lon = 28.6139, 77.2090

    # Same location: distance is 0 meters
    dist = haversine_distance(class_lat, class_lon, class_lat, class_lon)
    assert dist == 0.0

    # Student 30 meters away (approx 0.00027 deg latitude shift)
    student_lat, student_lon = 28.61417, 77.2090
    is_valid, student_dist = is_within_geofence(
        student_lat, student_lon, class_lat, class_lon, allowed_radius_meters=50
    )
    assert is_valid is True
    assert student_dist < 50.0

    # Student far away (1 kilometer)
    student_far_lat, student_far_lon = 28.6239, 77.2090
    is_valid_far, dist_far = is_within_geofence(
        student_far_lat, student_far_lon, class_lat, class_lon, allowed_radius_meters=50
    )
    assert is_valid_far is False
    assert dist_far > 500.0
