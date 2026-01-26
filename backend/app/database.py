import os

from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import QueuePool

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://gradebuddy:gradebuddy@localhost:5432/gradebuddy",
)
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() == "true"

# Production settings (Aurora requires SSL)
IS_PRODUCTION = os.getenv("ENVIRONMENT", "dev") == "prod"
USE_SSL = os.getenv("DATABASE_SSL", "false").lower() == "true"

# Connection pool settings optimized for serverless
POOL_SIZE = int(os.getenv("DATABASE_POOL_SIZE", "5"))
MAX_OVERFLOW = int(os.getenv("DATABASE_MAX_OVERFLOW", "10"))
POOL_TIMEOUT = int(os.getenv("DATABASE_POOL_TIMEOUT", "30"))

# Build connection arguments
connect_args = {}
if USE_SSL or IS_PRODUCTION:
    # Aurora PostgreSQL requires SSL in production
    connect_args["sslmode"] = "require"

engine = create_engine(
    DATABASE_URL,
    echo=SQL_ECHO,
    pool_pre_ping=True,  # Verify connections are alive before use
    poolclass=QueuePool,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_recycle=300,  # Recycle connections every 5 minutes
    connect_args=connect_args,
)


def init_db() -> None:
    """Create database tables."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Provide a transactional scope around a series of operations."""
    with Session(engine) as session:
        yield session
