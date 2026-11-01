import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.models.user import UserRole


# Token Schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenPayload(BaseModel):
    sub: str | None = None
    type: str | None = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    institution_id: str = Field(..., min_length=2, max_length=64, description="Student / Faculty ID")
    full_name: str = Field(..., min_length=2, max_length=128, description="User full display name")
    role: UserRole = UserRole.STUDENT


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128, description="Minimum 8 characters password")


class UserResponse(UserBase):
    id: uuid.UUID
    device_id: str | None = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class DeviceBindRequest(BaseModel):
    device_id: str = Field(..., min_length=4, max_length=128)
