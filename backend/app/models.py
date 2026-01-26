from datetime import datetime
from enum import Enum
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel


class Role(str, Enum):
    student = "student"
    teacher = "teacher"


class QuestionType(str, Enum):
    multiple_choice = "multiple_choice"
    true_false = "true_false"
    short_answer = "short_answer"


class AttemptStatus(str, Enum):
    in_progress = "in_progress"
    submitted = "submitted"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    clerk_id: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    role: Role = Field(default=Role.student)

    classrooms: List["Classroom"] = Relationship(back_populates="teacher")
    memberships: List["ClassroomMembership"] = Relationship(back_populates="student")
    submissions: List["Submission"] = Relationship(back_populates="student")


class Classroom(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    teacher_id: int = Field(foreign_key="user.id", index=True)
    join_code: str = Field(index=True, max_length=6)

    teacher: Optional[User] = Relationship(back_populates="classrooms")
    memberships: List["ClassroomMembership"] = Relationship(back_populates="classroom")
    assignments: List["Assignment"] = Relationship(back_populates="classroom")


class ClassroomMembership(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    classroom_id: int = Field(foreign_key="classroom.id", index=True)
    student_id: int = Field(foreign_key="user.id", index=True)

    classroom: Optional[Classroom] = Relationship(back_populates="memberships")
    student: Optional[User] = Relationship(back_populates="memberships")


class Assignment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: Optional[str] = Field(default=None)
    file_key: Optional[str] = Field(default=None)  # Teacher-uploaded assignment file
    classroom_id: int = Field(foreign_key="classroom.id", index=True)

    classroom: Optional[Classroom] = Relationship(back_populates="assignments")
    submissions: List["Submission"] = Relationship(back_populates="assignment")


class Submission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    file_key: str
    student_id: int = Field(foreign_key="user.id", index=True)
    assignment_id: int = Field(foreign_key="assignment.id", index=True)

    student: Optional[User] = Relationship(back_populates="submissions")
    assignment: Optional[Assignment] = Relationship(back_populates="submissions")


# ============== Quiz Models ==============

class Quiz(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: Optional[str] = Field(default=None)
    classroom_id: int = Field(foreign_key="classroom.id", index=True)
    time_limit_minutes: Optional[int] = Field(default=None)
    is_published: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    classroom: Optional[Classroom] = Relationship()
    questions: List["Question"] = Relationship(back_populates="quiz")
    attempts: List["QuizAttempt"] = Relationship(back_populates="quiz")


class Question(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    quiz_id: int = Field(foreign_key="quiz.id", index=True)
    question_text: str
    question_type: QuestionType = Field(default=QuestionType.multiple_choice)
    points: int = Field(default=1)
    order: int = Field(default=0)

    quiz: Optional[Quiz] = Relationship(back_populates="questions")
    options: List["QuestionOption"] = Relationship(back_populates="question")


class QuestionOption(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    question_id: int = Field(foreign_key="question.id", index=True)
    option_text: str
    is_correct: bool = Field(default=False)

    question: Optional[Question] = Relationship(back_populates="options")


class QuizAttempt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    quiz_id: int = Field(foreign_key="quiz.id", index=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    submitted_at: Optional[datetime] = Field(default=None)
    score: Optional[int] = Field(default=None)
    max_score: Optional[int] = Field(default=None)
    status: AttemptStatus = Field(default=AttemptStatus.in_progress)

    quiz: Optional[Quiz] = Relationship(back_populates="attempts")
    student: Optional[User] = Relationship()
    answers: List["QuizAnswer"] = Relationship(back_populates="attempt")


class QuizAnswer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    attempt_id: int = Field(foreign_key="quizattempt.id", index=True)
    question_id: int = Field(foreign_key="question.id", index=True)
    selected_option_id: Optional[int] = Field(default=None, foreign_key="questionoption.id")
    text_answer: Optional[str] = Field(default=None)  # For short answer questions
    is_correct: Optional[bool] = Field(default=None)
    points_earned: int = Field(default=0)

    attempt: Optional[QuizAttempt] = Relationship(back_populates="answers")
    question: Optional[Question] = Relationship()
    selected_option: Optional[QuestionOption] = Relationship()
