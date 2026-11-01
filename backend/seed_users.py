import asyncio
import uuid
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.academic import Department, Course, Enrollment
from app.core.security import get_password_hash


async def seed_default_users():
    """
    Seeds standard demo users and an active course for immediate login and testing:
    - Teacher: teacher@university.edu / TeacherPass123!
    - Admin:   admin@university.edu / AdminPass123!
    - Student: student@university.edu / StudentPass123!
    """
    async with AsyncSessionLocal() as session:
        # 1. Seed or get Department
        dept_stmt = select(Department).where(Department.code == "CS-CORE")
        dept = (await session.execute(dept_stmt)).scalar_one_or_none()
        if not dept:
            dept = Department(code="CS-CORE", name="Computer Science & Engineering")
            session.add(dept)
            await session.flush()

        # 2. Seed Teacher
        t_stmt = select(User).where(User.email == "teacher@university.edu")
        teacher = (await session.execute(t_stmt)).scalar_one_or_none()
        if not teacher:
            teacher = User(
                email="teacher@university.edu",
                institution_id="FAC-001",
                full_name="Prof. Alan Turing",
                role=UserRole.TEACHER,
                hashed_password=get_password_hash("TeacherPass123!"),
                is_active=True,
            )
            session.add(teacher)
            await session.flush()
            print("Created: teacher@university.edu (TeacherPass123!)")
        else:
            print("Teacher already exists: teacher@university.edu")

        # 3. Seed Admin
        a_stmt = select(User).where(User.email == "admin@university.edu")
        admin = (await session.execute(a_stmt)).scalar_one_or_none()
        if not admin:
            admin = User(
                email="admin@university.edu",
                institution_id="ADM-001",
                full_name="Dr. Ada Lovelace",
                role=UserRole.ADMIN,
                hashed_password=get_password_hash("AdminPass123!"),
                is_active=True,
            )
            session.add(admin)
            await session.flush()
            print("Created: admin@university.edu (AdminPass123!)")
        else:
            print("Admin already exists: admin@university.edu")

        # 4. Seed Student
        s_stmt = select(User).where(User.email == "student@university.edu")
        student = (await session.execute(s_stmt)).scalar_one_or_none()
        if not student:
            student = User(
                email="student@university.edu",
                institution_id="STU-2026-001",
                full_name="Alex Rivera",
                role=UserRole.STUDENT,
                hashed_password=get_password_hash("StudentPass123!"),
                device_id="demo-device-uuid-phone-001",
                is_active=True,
            )
            session.add(student)
            await session.flush()
            print("Created: student@university.edu (StudentPass123!)")
        else:
            print("Student already exists: student@university.edu")

        # 5. Seed Course & Enrollment
        course_stmt = select(Course).where(Course.code == "CS401")
        course = (await session.execute(course_stmt)).scalar_one_or_none()
        if not course:
            course = Course(
                code="CS401",
                name="Anti-Proxy Systems & Distributed Computing",
                department_id=dept.id,
                teacher_id=teacher.id,
            )
            session.add(course)
            await session.flush()

            enrollment = Enrollment(course_id=course.id, student_id=student.id)
            session.add(enrollment)
            print(f"Created course: CS401 (Enrolled: Alex Rivera)")

        await session.commit()
        print("\nAll demo users successfully initialized!")


if __name__ == "__main__":
    asyncio.run(seed_default_users())
