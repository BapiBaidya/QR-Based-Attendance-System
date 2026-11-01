import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CourseBase(BaseModel):
    code: str
    name: str
    department_id: uuid.UUID
    teacher_id: uuid.UUID


class CourseCreate(CourseBase):
    pass


class CourseResponse(CourseBase):
    id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
