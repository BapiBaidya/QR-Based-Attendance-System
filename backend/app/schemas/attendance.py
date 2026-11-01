import uuid
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from app.models.attendance import AttendanceStatus


class AttendanceScanRequest(BaseModel):
    session_id: uuid.UUID
    timestamp: int
    nonce: str
    signature: str
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    device_id: str = Field(..., min_length=4, max_length=128)


class AttendanceResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    student_id: uuid.UUID
    status: AttendanceStatus
    marked_at: datetime
    distance_meters: float | None
    device_id: str

    model_config = ConfigDict(from_attributes=True)


class ManualAttendanceOverride(BaseModel):
    session_id: uuid.UUID
    student_id: uuid.UUID
    status: AttendanceStatus
    reason: str = Field(..., min_length=5, max_length=255)


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None = None
    action: str
    resource_type: str
    resource_id: uuid.UUID | None = None
    payload: dict | None = None
    ip_address: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

