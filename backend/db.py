from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./workout.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

from sqlalchemy import event  # noqa: E402

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

def init_db():
    from models import Base as ModelsBase
    ModelsBase.metadata.create_all(bind=engine)
