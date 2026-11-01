import uuid
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.academic import Course, Enrollment, Department
from app.schemas.academic import CourseCreate, CourseResponse

router = APIRouter(prefix="/courses", tags=["Academic Courses"])


@router.get("", response_model=List[CourseResponse])
async def list_courses(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Returns courses accessible to the authenticated user based on role:
    - TEACHER: Returns courses assigned to this faculty member.
    - ADMIN: Returns all courses across departments.
    - STUDENT: Returns courses the student is actively enrolled in.
    """
    if current_user.role == UserRole.TEACHER:
        stmt = select(Course).where(Course.teacher_id == current_user.id).order_by(Course.code)
    elif current_user.role == UserRole.STUDENT:
        stmt = (
            select(Course)
            .join(Enrollment, Enrollment.course_id == Course.id)
            .where(Enrollment.student_id == current_user.id)
            .order_by(Course.code)
        )
    else:  # ADMIN
        stmt = select(Course).order_by(Course.code)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    course_in: CourseCreate,
    current_user: Annotated[User, Depends(require_roles([UserRole.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Administrative endpoint: Creates a new course and assigns it to a faculty member.
    Restricted to Administrators only (RBAC matrix compliance).
    """
    # Verify department exists
    dept = (await db.execute(select(Department).where(Department.id == course_in.department_id))).scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    # Verify teacher exists and has TEACHER role
    teacher = (await db.execute(select(User).where(User.id == course_in.teacher_id))).scalar_one_or_none()
    if not teacher or teacher.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The assigned user must exist and have the TEACHER role"
        )

    # Check for duplicate code
    existing = (await db.execute(select(Course).where(Course.code == course_in.code))).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A course with this code already exists"
        )

    new_course = Course(
        code=course_in.code,
        name=course_in.name,
        department_id=course_in.department_id,
        teacher_id=course_in.teacher_id,
    )
    db.add(new_course)
    await db.commit()
    await db.refresh(new_course)
    return new_course
