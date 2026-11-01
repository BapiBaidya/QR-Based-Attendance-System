import uuid
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from app.models.session import SessionStatus


class SessionCreate(BaseModel):
    course_id: uuid.UUID
    title: str = Field(..., min_length=2, max_length=128)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    radius_meters: int = Field(50, ge=10, le=500)


class SessionResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    status: SessionStatus
    latitude: float
    longitude: float
    radius_meters: int
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QRPayloadResponse(BaseModel):
    sid: str
    ts: int
    nonce: str
    sig: str
    expires_in_seconds: int
