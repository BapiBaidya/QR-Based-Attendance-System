import hmac
import hashlib
import secrets
import time
from typing import Dict, Any, Tuple
from app.core.config import settings


class QRVerificationResult:
    def __init__(self, is_valid: bool, reason: str = "", payload: Dict[str, Any] | None = None):
        self.is_valid = is_valid
        self.reason = reason
        self.payload = payload or {}

    def __bool__(self):
        return self.is_valid


class DynamicQRService:
    """
    Manages the generation and cryptographic validation of rotating dynamic QR codes.
    Uses HMAC-SHA256 signatures, nonce generation, and time-drift verification.
    """

    @staticmethod
    def generate_session_secret() -> str:
        """Generates a cryptographically strong 32-byte hexadecimal secret for a class session."""
        return secrets.token_hex(32)

    @staticmethod
    def generate_nonce(length: int = 8) -> str:
        """Generates a single-use random nonce."""
        return secrets.token_hex(length)

    @classmethod
    def compute_signature(cls, session_secret: str, session_id: str, timestamp: int, nonce: str) -> str:
        """
        Computes HMAC-SHA256 signature over: session_id:timestamp:nonce
        """
        message = f"{session_id}:{timestamp}:{nonce}".encode("utf-8")
        secret_bytes = session_secret.encode("utf-8")
        return hmac.new(secret_bytes, message, hashlib.sha256).hexdigest()

    @classmethod
    def generate_qr_payload(cls, session_id: str, session_secret: str) -> Dict[str, Any]:
        """
        Generates the current dynamic payload to be rendered as a QR code on the teacher's screen.
        Changes every 15-20 seconds.
        """
        current_ts = int(time.time())
        nonce = cls.generate_nonce()
        signature = cls.compute_signature(session_secret, session_id, current_ts, nonce)

        return {
            "sid": str(session_id),
            "ts": current_ts,
            "nonce": nonce,
            "sig": signature,
        }

    @classmethod
    def verify_qr_payload(
        cls,
        session_secret: str,
        session_id: str,
        timestamp: int,
        nonce: str,
        received_signature: str,
        burned_nonces_set: set | None = None,
    ) -> QRVerificationResult:
        """
        Validates the scanned QR payload against security rules:
        1. Expiration & Drift Check (|server_time - ts| <= limit)
        2. Nonce Replay Prevention
        3. Constant-time HMAC-SHA256 Signature Verification
        """
        current_time = int(time.time())
        allowed_window = settings.QR_EXPIRY_SECONDS + settings.QR_DRIFT_TOLERANCE_SECONDS

        # 1. Directional timestamp check
        age_seconds = current_time - timestamp
        # If timestamp is in the future beyond acceptable clock drift (e.g. > 5s)
        if age_seconds < -settings.QR_DRIFT_TOLERANCE_SECONDS:
            return QRVerificationResult(
                is_valid=False,
                reason=f"Invalid QR code: timestamp is in the future (skew: {abs(age_seconds)}s)",
            )
        # If timestamp has expired beyond allowable window
        if age_seconds > settings.QR_EXPIRY_SECONDS + settings.QR_DRIFT_TOLERANCE_SECONDS:
            return QRVerificationResult(
                is_valid=False,
                reason=f"QR code expired (age: {age_seconds}s, allowed: {settings.QR_EXPIRY_SECONDS}s)",
            )

        # 2. Nonce replay prevention (in-memory fallback or Redis)
        if burned_nonces_set is not None:
            if nonce in burned_nonces_set:
                return QRVerificationResult(
                    is_valid=False,
                    reason="QR code token has already been scanned (replay detected)",
                )
            burned_nonces_set.add(nonce)

        # 3. Recompute expected signature
        expected_sig = cls.compute_signature(session_secret, session_id, timestamp, nonce)

        # 4. Constant-time comparison to prevent timing side-channel attacks
        if not hmac.compare_digest(expected_sig, received_signature):
            return QRVerificationResult(
                is_valid=False,
                reason="Invalid cryptographic signature (QR code forged or tampered)",
            )

        return QRVerificationResult(
            is_valid=True,
            reason="Verified successfully",
            payload={
                "session_id": session_id,
                "timestamp": timestamp,
                "nonce": nonce,
            },
        )
