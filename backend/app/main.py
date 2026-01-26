import os
import random
import re
import uuid
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field as PydField
from sqlmodel import Session, select

from app.auth import ClerkUser, get_current_user
from app.database import get_session, init_db
from app.models import (
    Assignment,
    AttemptStatus,
    Classroom,
    ClassroomMembership,
    Question,
    QuestionOption,
    QuestionType,
    Quiz,
    QuizAnswer,
    QuizAttempt,
    Role,
    Submission,
    User,
)

app = FastAPI(title="GradeBuddy API")

origins = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:3000,http://localhost:3001",
)
origin_list = [origin.strip() for origin in origins.split(",") if origin.strip()]

# For MVP: Allow all vercel.app subdomains
def is_allowed_origin(origin: str) -> bool:
    if not origin:
        return False
    if origin in origin_list:
        return True
    if origin.endswith(".vercel.app"):
        return True
    if "localhost" in origin:
        return True
    return False

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for MVP (credentials still checked)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


class SyncUserRequest(BaseModel):
    role: Optional[Role] = None


class ClassroomCreateRequest(BaseModel):
    name: str = PydField(min_length=1, max_length=200)


class ClassroomJoinRequest(BaseModel):
    code: str = PydField(min_length=6, max_length=6)


class AssignmentCreateRequest(BaseModel):
    classroom_id: int
    title: str = PydField(min_length=1, max_length=200)
    description: Optional[str] = None
    file_key: Optional[str] = None  # Teacher-uploaded assignment file


class PresignedUrlRequest(BaseModel):
    filename: str = PydField(min_length=1, max_length=255)
    file_type: str = PydField(min_length=1, max_length=100)
    assignment_id: Optional[int] = None  # For student submissions
    purpose: str = PydField(default="submission")  # "submission" or "assignment"


class PresignedUrlResponse(BaseModel):
    upload_url: str
    file_key: str


class UploadCompleteRequest(BaseModel):
    assignment_id: int
    file_key: str = PydField(min_length=1, max_length=1024)


class UploadCompleteResponse(BaseModel):
    submission_id: int


def _get_db_user(session: Session, clerk_id: str) -> User:
    user = session.exec(select(User).where(User.clerk_id == clerk_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not synced",
        )
    return user


def _generate_join_code(session: Session) -> str:
    for _ in range(10):
        code = f"{random.randint(0, 999999):06d}"
        existing = session.exec(
            select(Classroom).where(Classroom.join_code == code)
        ).first()
        if not existing:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unable to generate join code",
    )


def _classroom_access(
    session: Session, classroom_id: int, user: User
) -> Classroom:
    classroom = session.exec(
        select(Classroom).where(Classroom.id == classroom_id)
    ).first()
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found",
        )
    if user.role == Role.teacher and classroom.teacher_id == user.id:
        return classroom
    if user.role == Role.student:
        membership = session.exec(
            select(ClassroomMembership).where(
                ClassroomMembership.classroom_id == classroom.id,
                ClassroomMembership.student_id == user.id,
            )
        ).first()
        if membership:
            return classroom
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized for this classroom",
    )


_s3_client = None


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION"),
        )
    return _s3_client


def _get_bucket_name() -> str:
    bucket = os.getenv("S3_BUCKET_NAME")
    if not bucket:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="S3_BUCKET_NAME is not configured",
        )
    return bucket


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/sync")
def sync_user(
    payload: SyncUserRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    user = session.exec(select(User).where(User.clerk_id == clerk_user.user_id)).first()

    if not user:
        if not payload.role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role is required for new users",
            )
        if not clerk_user.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not found in token",
            )
        user = User(
            clerk_id=clerk_user.user_id,
            email=clerk_user.email,
            role=payload.role,
        )
        session.add(user)
    else:
        if payload.role:
            user.role = payload.role

    session.commit()
    session.refresh(user)

    return {
        "id": user.id,
        "clerk_id": user.clerk_id,
        "email": user.email,
        "role": user.role,
    }


@app.post("/classrooms")
def create_classroom(
    payload: ClassroomCreateRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can create classrooms",
        )

    join_code = _generate_join_code(session)
    classroom = Classroom(
        name=payload.name,
        teacher_id=user.id,
        join_code=join_code,
    )
    session.add(classroom)
    session.commit()
    session.refresh(classroom)

    return {"id": classroom.id, "name": classroom.name, "join_code": classroom.join_code}


@app.post("/classrooms/join")
def join_classroom(
    payload: ClassroomJoinRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.student:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can join classrooms",
        )

    if not re.fullmatch(r"\d{6}", payload.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Join code must be 6 digits",
        )

    classroom = session.exec(
        select(Classroom).where(Classroom.join_code == payload.code)
    ).first()
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found",
        )

    existing = session.exec(
        select(ClassroomMembership).where(
            ClassroomMembership.classroom_id == classroom.id,
            ClassroomMembership.student_id == user.id,
        )
    ).first()
    if not existing:
        membership = ClassroomMembership(
            classroom_id=classroom.id,
            student_id=user.id,
        )
        session.add(membership)
        session.commit()

    return {"classroom_id": classroom.id, "name": classroom.name}


@app.get("/classrooms")
def list_classrooms(
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict]:
    user = _get_db_user(session, clerk_user.user_id)
    if user.role == Role.teacher:
        classrooms = session.exec(
            select(Classroom).where(Classroom.teacher_id == user.id)
        ).all()
        return [
            {"id": classroom.id, "name": classroom.name, "join_code": classroom.join_code}
            for classroom in classrooms
        ]

    memberships = session.exec(
        select(ClassroomMembership).where(
            ClassroomMembership.student_id == user.id
        )
    ).all()
    classroom_ids = [membership.classroom_id for membership in memberships]
    if not classroom_ids:
        return []
    classrooms = session.exec(
        select(Classroom).where(Classroom.id.in_(classroom_ids))
    ).all()
    return [{"id": classroom.id, "name": classroom.name} for classroom in classrooms]


@app.get("/analytics/teacher")
def get_teacher_analytics(
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Get analytics for a teacher's classrooms."""
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can view analytics",
        )

    # Get all classrooms for this teacher
    classrooms = session.exec(
        select(Classroom).where(Classroom.teacher_id == user.id)
    ).all()

    total_students = 0
    total_assignments = 0
    total_submissions = 0
    classroom_stats = []

    for classroom in classrooms:
        # Count students in this classroom
        student_count = len(
            session.exec(
                select(ClassroomMembership).where(
                    ClassroomMembership.classroom_id == classroom.id
                )
            ).all()
        )
        total_students += student_count

        # Get assignments for this classroom
        assignments = session.exec(
            select(Assignment).where(Assignment.classroom_id == classroom.id)
        ).all()
        assignment_count = len(assignments)
        total_assignments += assignment_count

        # Count submissions for this classroom's assignments
        submission_count = 0
        for assignment in assignments:
            subs = session.exec(
                select(Submission).where(Submission.assignment_id == assignment.id)
            ).all()
            submission_count += len(subs)
        total_submissions += submission_count

        # Calculate submission rate
        expected_submissions = student_count * assignment_count
        submission_rate = (
            round((submission_count / expected_submissions) * 100)
            if expected_submissions > 0
            else 0
        )

        classroom_stats.append({
            "id": classroom.id,
            "name": classroom.name,
            "join_code": classroom.join_code,
            "student_count": student_count,
            "assignment_count": assignment_count,
            "submission_count": submission_count,
            "submission_rate": submission_rate,
        })

    return {
        "total_classrooms": len(classrooms),
        "total_students": total_students,
        "total_assignments": total_assignments,
        "total_submissions": total_submissions,
        "classrooms": classroom_stats,
    }


@app.post("/assignments")
def create_assignment(
    payload: AssignmentCreateRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can create assignments",
        )

    classroom = session.exec(
        select(Classroom).where(
            Classroom.id == payload.classroom_id,
            Classroom.teacher_id == user.id,
        )
    ).first()
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found",
        )

    assignment = Assignment(
        title=payload.title,
        description=payload.description,
        file_key=payload.file_key,
        classroom_id=classroom.id,
    )
    session.add(assignment)
    session.commit()
    session.refresh(assignment)

    return {
        "id": assignment.id,
        "title": assignment.title,
        "description": assignment.description,
        "file_key": assignment.file_key,
    }


@app.get("/classrooms/{classroom_id}/assignments")
def list_assignments(
    classroom_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict]:
    user = _get_db_user(session, clerk_user.user_id)
    _classroom_access(session, classroom_id, user)

    assignments = session.exec(
        select(Assignment).where(Assignment.classroom_id == classroom_id)
    ).all()
    return [
        {
            "id": assignment.id,
            "title": assignment.title,
            "description": assignment.description,
            "file_key": assignment.file_key,
        }
        for assignment in assignments
    ]


@app.get("/assignments/{assignment_id}")
def get_assignment(
    assignment_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    user = _get_db_user(session, clerk_user.user_id)

    assignment = session.exec(
        select(Assignment).where(Assignment.id == assignment_id)
    ).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    # Check user has access to this assignment's classroom
    _classroom_access(session, assignment.classroom_id, user)

    # Get classroom info
    classroom = session.exec(
        select(Classroom).where(Classroom.id == assignment.classroom_id)
    ).first()

    # Generate download URL if there's a file
    file_url = None
    if assignment.file_key:
        try:
            s3_client = _get_s3_client()
            bucket = _get_bucket_name()
            file_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": assignment.file_key},
                ExpiresIn=3600,
            )
        except (BotoCoreError, ClientError):
            pass

    return {
        "id": assignment.id,
        "title": assignment.title,
        "description": assignment.description,
        "file_key": assignment.file_key,
        "file_url": file_url,
        "classroom_id": assignment.classroom_id,
        "classroom_name": classroom.name if classroom else None,
    }


@app.get("/assignments/{assignment_id}/submissions")
def list_submissions(
    assignment_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict]:
    user = _get_db_user(session, clerk_user.user_id)

    assignment = session.exec(
        select(Assignment).where(Assignment.id == assignment_id)
    ).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    # Check classroom access
    classroom = _classroom_access(session, assignment.classroom_id, user)

    # Students can only see their own submissions
    if user.role == Role.student:
        submissions = session.exec(
            select(Submission).where(
                Submission.assignment_id == assignment_id,
                Submission.student_id == user.id,
            )
        ).all()
    else:
        # Teachers see all submissions
        submissions = session.exec(
            select(Submission).where(Submission.assignment_id == assignment_id)
        ).all()

    result = []
    s3_client = _get_s3_client()
    bucket = _get_bucket_name()

    for submission in submissions:
        # Get student info
        student = session.exec(
            select(User).where(User.id == submission.student_id)
        ).first()

        # Generate download URL
        file_url = None
        try:
            file_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": submission.file_key},
                ExpiresIn=3600,
            )
        except (BotoCoreError, ClientError):
            pass

        result.append({
            "id": submission.id,
            "student_id": submission.student_id,
            "student_email": student.email if student else None,
            "file_key": submission.file_key,
            "file_url": file_url,
        })

    return result


@app.post("/upload/presigned-url", response_model=PresignedUrlResponse)
def create_presigned_url(
    payload: PresignedUrlRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PresignedUrlResponse:
    user = _get_db_user(session, clerk_user.user_id)
    safe_name = os.path.basename(payload.filename)

    if payload.purpose == "assignment":
        # Teacher uploading assignment materials
        if user.role != Role.teacher:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only teachers can upload assignment files",
            )
        file_key = f"assignments/{user.id}/{uuid.uuid4().hex}_{safe_name}"
    else:
        # Student uploading submission
        if not payload.assignment_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="assignment_id is required for submissions",
            )
        assignment = session.exec(
            select(Assignment).where(Assignment.id == payload.assignment_id)
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assignment not found",
            )
        file_key = (
            f"submissions/{assignment.id}/{user.id}/"
            f"{uuid.uuid4().hex}_{safe_name}"
        )

    s3_client = _get_s3_client()
    bucket = _get_bucket_name()

    try:
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": file_key,
                "ContentType": payload.file_type,
            },
            ExpiresIn=900,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create presigned URL",
        ) from exc

    return PresignedUrlResponse(upload_url=upload_url, file_key=file_key)


@app.post("/upload/complete", response_model=UploadCompleteResponse)
def upload_complete(
    payload: UploadCompleteRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UploadCompleteResponse:
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.student:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can submit assignments",
        )

    assignment = session.exec(
        select(Assignment).where(Assignment.id == payload.assignment_id)
    ).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    submission = Submission(
        assignment_id=assignment.id,
        student_id=user.id,
        file_key=payload.file_key,
    )
    session.add(submission)
    session.commit()
    session.refresh(submission)

    return UploadCompleteResponse(submission_id=submission.id)


# ============== Quiz Endpoints ==============

class QuizCreateRequest(BaseModel):
    classroom_id: int
    title: str = PydField(min_length=1, max_length=200)
    description: Optional[str] = None
    time_limit_minutes: Optional[int] = None


class QuestionCreateRequest(BaseModel):
    question_text: str = PydField(min_length=1)
    question_type: QuestionType = QuestionType.multiple_choice
    points: int = 1
    options: list[dict]  # [{"text": "...", "is_correct": bool}, ...]


class QuizSubmitRequest(BaseModel):
    answers: list[dict]  # [{"question_id": int, "selected_option_id": int, "text_answer": str}, ...]


class GradeAnswerRequest(BaseModel):
    is_correct: bool
    points_earned: int


@app.post("/quizzes")
def create_quiz(
    payload: QuizCreateRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Create a new quiz (teachers only)."""
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can create quizzes",
        )

    # Verify teacher owns the classroom
    classroom = session.exec(
        select(Classroom).where(
            Classroom.id == payload.classroom_id,
            Classroom.teacher_id == user.id,
        )
    ).first()
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found",
        )

    quiz = Quiz(
        title=payload.title,
        description=payload.description,
        classroom_id=payload.classroom_id,
        time_limit_minutes=payload.time_limit_minutes,
        is_published=False,
    )
    session.add(quiz)
    session.commit()
    session.refresh(quiz)

    return {
        "id": quiz.id,
        "title": quiz.title,
        "description": quiz.description,
        "is_published": quiz.is_published,
    }


@app.get("/quizzes/{quiz_id}")
def get_quiz(
    quiz_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Get quiz details with questions."""
    user = _get_db_user(session, clerk_user.user_id)

    quiz = session.exec(select(Quiz).where(Quiz.id == quiz_id)).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found",
        )

    # Check access
    _classroom_access(session, quiz.classroom_id, user)

    # Get questions
    questions = session.exec(
        select(Question).where(Question.quiz_id == quiz_id).order_by(Question.order)
    ).all()

    questions_data = []
    for q in questions:
        options = session.exec(
            select(QuestionOption).where(QuestionOption.question_id == q.id)
        ).all()

        # For students, don't reveal correct answers
        options_data = [
            {
                "id": opt.id,
                "text": opt.option_text,
                "is_correct": opt.is_correct if user.role == Role.teacher else None,
            }
            for opt in options
        ]

        questions_data.append({
            "id": q.id,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "points": q.points,
            "options": options_data,
        })

    return {
        "id": quiz.id,
        "title": quiz.title,
        "description": quiz.description,
        "classroom_id": quiz.classroom_id,
        "time_limit_minutes": quiz.time_limit_minutes,
        "is_published": quiz.is_published,
        "questions": questions_data,
        "total_points": sum(q.points for q in questions),
    }


@app.post("/quizzes/{quiz_id}/questions")
def add_question(
    quiz_id: int,
    payload: QuestionCreateRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Add a question to a quiz (teachers only)."""
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can add questions",
        )

    quiz = session.exec(select(Quiz).where(Quiz.id == quiz_id)).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found",
        )

    # Verify ownership
    classroom = session.exec(
        select(Classroom).where(
            Classroom.id == quiz.classroom_id,
            Classroom.teacher_id == user.id,
        )
    ).first()
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    # Get current question count for ordering
    existing_count = len(
        session.exec(select(Question).where(Question.quiz_id == quiz_id)).all()
    )

    # Create question
    question = Question(
        quiz_id=quiz_id,
        question_text=payload.question_text,
        question_type=payload.question_type,
        points=payload.points,
        order=existing_count,
    )
    session.add(question)
    session.commit()
    session.refresh(question)

    # Add options
    for opt_data in payload.options:
        option = QuestionOption(
            question_id=question.id,
            option_text=opt_data.get("text", ""),
            is_correct=opt_data.get("is_correct", False),
        )
        session.add(option)
    session.commit()

    return {"id": question.id, "question_text": question.question_text}


@app.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Delete a question (teachers only)."""
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can delete questions",
        )

    question = session.exec(
        select(Question).where(Question.id == question_id)
    ).first()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found",
        )

    # Delete options first
    options = session.exec(
        select(QuestionOption).where(QuestionOption.question_id == question_id)
    ).all()
    for opt in options:
        session.delete(opt)

    session.delete(question)
    session.commit()

    return {"deleted": True}


@app.put("/quizzes/{quiz_id}/publish")
def publish_quiz(
    quiz_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Publish a quiz to make it available to students."""
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can publish quizzes",
        )

    quiz = session.exec(select(Quiz).where(Quiz.id == quiz_id)).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found",
        )

    # Check it has questions
    questions = session.exec(
        select(Question).where(Question.quiz_id == quiz_id)
    ).all()
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish quiz without questions",
        )

    quiz.is_published = True
    session.commit()
    session.refresh(quiz)

    return {"id": quiz.id, "is_published": quiz.is_published}


@app.get("/classrooms/{classroom_id}/quizzes")
def list_classroom_quizzes(
    classroom_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict]:
    """List quizzes for a classroom."""
    user = _get_db_user(session, clerk_user.user_id)
    _classroom_access(session, classroom_id, user)

    # Teachers see all, students only see published
    if user.role == Role.teacher:
        quizzes = session.exec(
            select(Quiz).where(Quiz.classroom_id == classroom_id)
        ).all()
    else:
        quizzes = session.exec(
            select(Quiz).where(
                Quiz.classroom_id == classroom_id,
                Quiz.is_published == True,
            )
        ).all()

    result = []
    for quiz in quizzes:
        # Count questions
        question_count = len(
            session.exec(select(Question).where(Question.quiz_id == quiz.id)).all()
        )

        # Check if student has attempted
        attempt = None
        if user.role == Role.student:
            attempt = session.exec(
                select(QuizAttempt).where(
                    QuizAttempt.quiz_id == quiz.id,
                    QuizAttempt.student_id == user.id,
                )
            ).first()

        result.append({
            "id": quiz.id,
            "title": quiz.title,
            "description": quiz.description,
            "is_published": quiz.is_published,
            "question_count": question_count,
            "time_limit_minutes": quiz.time_limit_minutes,
            "attempt_status": attempt.status if attempt else None,
            "attempt_score": attempt.score if attempt else None,
            "attempt_max_score": attempt.max_score if attempt else None,
        })

    return result


@app.post("/quizzes/{quiz_id}/start")
def start_quiz_attempt(
    quiz_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Start a quiz attempt (students only)."""
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.student:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can take quizzes",
        )

    quiz = session.exec(select(Quiz).where(Quiz.id == quiz_id)).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found",
        )

    if not quiz.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quiz is not available",
        )

    # Check if already attempted
    existing = session.exec(
        select(QuizAttempt).where(
            QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.student_id == user.id,
        )
    ).first()

    if existing:
        if existing.status == AttemptStatus.submitted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have already completed this quiz",
            )
        # Return existing in-progress attempt
        return {"attempt_id": existing.id, "status": existing.status}

    # Create new attempt
    attempt = QuizAttempt(
        quiz_id=quiz_id,
        student_id=user.id,
        status=AttemptStatus.in_progress,
    )
    session.add(attempt)
    session.commit()
    session.refresh(attempt)

    return {"attempt_id": attempt.id, "status": attempt.status}


@app.post("/attempts/{attempt_id}/submit")
def submit_quiz_attempt(
    attempt_id: int,
    payload: QuizSubmitRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Submit quiz answers and get score."""
    from datetime import datetime

    user = _get_db_user(session, clerk_user.user_id)

    attempt = session.exec(
        select(QuizAttempt).where(QuizAttempt.id == attempt_id)
    ).first()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found",
        )

    if attempt.student_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your attempt",
        )

    if attempt.status == AttemptStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already submitted",
        )

    # Get all questions for this quiz
    questions = session.exec(
        select(Question).where(Question.quiz_id == attempt.quiz_id)
    ).all()
    question_map = {q.id: q for q in questions}

    total_score = 0
    max_score = 0

    # Process each answer
    pending_grading = 0
    for ans_data in payload.answers:
        question_id = ans_data.get("question_id")
        selected_option_id = ans_data.get("selected_option_id")
        text_answer = ans_data.get("text_answer")

        question = question_map.get(question_id)
        if not question:
            continue

        max_score += question.points

        # Check if correct based on question type
        is_correct = None  # None means needs manual grading
        points_earned = 0

        if question.question_type == QuestionType.short_answer:
            # Short answer requires manual grading
            is_correct = None
            pending_grading += 1
        elif selected_option_id:
            # Multiple choice / true-false - auto grade
            option = session.exec(
                select(QuestionOption).where(
                    QuestionOption.id == selected_option_id,
                    QuestionOption.question_id == question_id,
                )
            ).first()
            if option and option.is_correct:
                is_correct = True
                points_earned = question.points
                total_score += points_earned
            else:
                is_correct = False

        # Save answer
        answer = QuizAnswer(
            attempt_id=attempt_id,
            question_id=question_id,
            selected_option_id=selected_option_id,
            text_answer=text_answer,
            is_correct=is_correct,
            points_earned=points_earned,
        )
        session.add(answer)

    # Update attempt
    attempt.status = AttemptStatus.submitted
    attempt.submitted_at = datetime.utcnow()
    attempt.score = total_score
    attempt.max_score = max_score

    session.commit()
    session.refresh(attempt)

    return {
        "attempt_id": attempt.id,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "percentage": round((total_score / max_score) * 100) if max_score > 0 else 0,
    }


@app.get("/attempts/{attempt_id}/results")
def get_attempt_results(
    attempt_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Get detailed results for a quiz attempt."""
    user = _get_db_user(session, clerk_user.user_id)

    attempt = session.exec(
        select(QuizAttempt).where(QuizAttempt.id == attempt_id)
    ).first()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found",
        )

    # Students can only see their own, teachers can see all
    if user.role == Role.student and attempt.student_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    quiz = session.exec(select(Quiz).where(Quiz.id == attempt.quiz_id)).first()

    # Get answers with questions
    answers = session.exec(
        select(QuizAnswer).where(QuizAnswer.attempt_id == attempt_id)
    ).all()

    answers_data = []
    for ans in answers:
        question = session.exec(
            select(Question).where(Question.id == ans.question_id)
        ).first()

        selected_option = None
        if ans.selected_option_id:
            opt = session.exec(
                select(QuestionOption).where(QuestionOption.id == ans.selected_option_id)
            ).first()
            selected_option = opt.option_text if opt else None

        # Get correct answer
        correct_option = session.exec(
            select(QuestionOption).where(
                QuestionOption.question_id == ans.question_id,
                QuestionOption.is_correct == True,
            )
        ).first()

        answers_data.append({
            "question_text": question.question_text if question else None,
            "selected_answer": selected_option,
            "correct_answer": correct_option.option_text if correct_option else None,
            "is_correct": ans.is_correct,
            "points_earned": ans.points_earned,
            "max_points": question.points if question else 0,
        })

    return {
        "quiz_title": quiz.title if quiz else None,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "percentage": round((attempt.score / attempt.max_score) * 100) if attempt.max_score else 0,
        "status": attempt.status,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "answers": answers_data,
    }


@app.get("/quizzes/{quiz_id}/results")
def get_quiz_results(
    quiz_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Get all student results for a quiz (teachers only)."""
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can view all results",
        )

    quiz = session.exec(select(Quiz).where(Quiz.id == quiz_id)).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found",
        )

    attempts = session.exec(
        select(QuizAttempt).where(QuizAttempt.quiz_id == quiz_id)
    ).all()

    results = []
    for attempt in attempts:
        student = session.exec(
            select(User).where(User.id == attempt.student_id)
        ).first()

        results.append({
            "attempt_id": attempt.id,
            "student_email": student.email if student else None,
            "status": attempt.status,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "percentage": round((attempt.score / attempt.max_score) * 100) if attempt.max_score else 0,
            "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        })

    # Calculate stats
    submitted = [r for r in results if r["status"] == AttemptStatus.submitted]
    avg_score = (
        sum(r["percentage"] for r in submitted) / len(submitted)
        if submitted
        else 0
    )

    return {
        "quiz_title": quiz.title,
        "total_attempts": len(attempts),
        "submitted_count": len(submitted),
        "average_percentage": round(avg_score),
        "results": results,
    }


@app.get("/attempts/{attempt_id}/answers")
def get_attempt_answers(
    attempt_id: int,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict]:
    """Get all answers for an attempt (for grading)."""
    user = _get_db_user(session, clerk_user.user_id)

    attempt = session.exec(
        select(QuizAttempt).where(QuizAttempt.id == attempt_id)
    ).first()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found",
        )

    # Teachers can view any, students only their own
    if user.role == Role.student and attempt.student_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    answers = session.exec(
        select(QuizAnswer).where(QuizAnswer.attempt_id == attempt_id)
    ).all()

    result = []
    for ans in answers:
        question = session.exec(
            select(Question).where(Question.id == ans.question_id)
        ).first()

        selected_text = None
        if ans.selected_option_id:
            opt = session.exec(
                select(QuestionOption).where(QuestionOption.id == ans.selected_option_id)
            ).first()
            selected_text = opt.option_text if opt else None

        correct_text = None
        if question and question.question_type != QuestionType.short_answer:
            correct_opt = session.exec(
                select(QuestionOption).where(
                    QuestionOption.question_id == ans.question_id,
                    QuestionOption.is_correct == True,
                )
            ).first()
            correct_text = correct_opt.option_text if correct_opt else None

        result.append({
            "id": ans.id,
            "question_id": ans.question_id,
            "question_text": question.question_text if question else None,
            "question_type": question.question_type if question else None,
            "max_points": question.points if question else 0,
            "selected_option_text": selected_text,
            "text_answer": ans.text_answer,
            "correct_answer": correct_text,
            "is_correct": ans.is_correct,
            "points_earned": ans.points_earned,
        })

    return result


@app.put("/answers/{answer_id}/grade")
def grade_answer(
    answer_id: int,
    payload: GradeAnswerRequest,
    clerk_user: ClerkUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Grade a short answer question (teachers only)."""
    user = _get_db_user(session, clerk_user.user_id)
    if user.role != Role.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can grade answers",
        )

    answer = session.exec(
        select(QuizAnswer).where(QuizAnswer.id == answer_id)
    ).first()
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Answer not found",
        )

    # Get the question to validate points
    question = session.exec(
        select(Question).where(Question.id == answer.question_id)
    ).first()

    if payload.points_earned > question.points:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Points cannot exceed {question.points}",
        )

    # Update the answer
    old_points = answer.points_earned
    answer.is_correct = payload.is_correct
    answer.points_earned = payload.points_earned

    # Update the attempt score
    attempt = session.exec(
        select(QuizAttempt).where(QuizAttempt.id == answer.attempt_id)
    ).first()
    if attempt and attempt.score is not None:
        attempt.score = attempt.score - old_points + payload.points_earned

    session.commit()
    session.refresh(answer)

    return {
        "id": answer.id,
        "is_correct": answer.is_correct,
        "points_earned": answer.points_earned,
    }
