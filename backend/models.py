from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Enum, Boolean
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime
import enum

Base = declarative_base()

class RoutineType(str, enum.Enum):
    strength = "strength"
    hiit = "hiit"
    active_rest = "active_rest"

class SessionStatus(str, enum.Enum):
    active = "active"
    completed = "completed"

class CoachRole(str, enum.Enum):
    pre_workout = "pre_workout"
    in_workout = "in_workout"
    post_workout = "post_workout"

class Context(Base):
    __tablename__ = "contexts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    equipment_tags = Column(String)  # JSON array string
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    default_rest_seconds = Column(Integer, default=90)

    templates = relationship("WorkoutTemplate", back_populates="context", cascade="all, delete-orphan")

class WorkoutTemplate(Base):
    __tablename__ = "workout_templates"
    id = Column(Integer, primary_key=True, index=True)
    context_id = Column(Integer, ForeignKey("contexts.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(Enum(RoutineType), default=RoutineType.strength)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    default_rest_seconds = Column(Integer, nullable=True)

    context = relationship("Context", back_populates="templates")
    exercises = relationship("ExerciseEntry", back_populates="template", cascade="all, delete-orphan", order_by="ExerciseEntry.order")
    sessions = relationship("WorkoutSession", back_populates="template", cascade="all, delete-orphan")

class ExerciseLibrary(Base):
    __tablename__ = "exercise_library"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    muscle_group = Column(String)
    equipment = Column(String)
    default_rest_seconds = Column(Integer, default=90)
    created_at = Column(DateTime, default=datetime.utcnow)

class ExerciseEntry(Base):
    __tablename__ = "exercise_entries"
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("workout_templates.id", ondelete="CASCADE"), nullable=False)
    exercise_library_id = Column(Integer, ForeignKey("exercise_library.id"), nullable=True)
    name = Column(String, nullable=False)
    sets_target = Column(Integer, nullable=False, default=3)
    reps_target = Column(Integer, nullable=False, default=10)
    start_weight = Column(Float, nullable=False, default=0.0)
    rest_seconds = Column(Integer, nullable=False, default=90)
    order = Column(Integer, default=0)
    notes = Column(Text)
    per_set_data = Column(String, nullable=True)  # JSON: [{weight, reps, effort}, ...]
    created_at = Column(DateTime, default=datetime.utcnow)

    template = relationship("WorkoutTemplate", back_populates="exercises")
    exercise_library = relationship("ExerciseLibrary")
    session_logs = relationship("SetLog", back_populates="exercise_entry", passive_deletes=True)

class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("workout_templates.id", ondelete="CASCADE"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    pre_workout_mood = Column(Text)
    pre_workout_tags = Column(String)  # JSON array string
    status = Column(Enum(SessionStatus), default=SessionStatus.active)

    template = relationship("WorkoutTemplate", back_populates="sessions")
    set_logs = relationship("SetLog", back_populates="session", cascade="all, delete-orphan", order_by="SetLog.set_index")
    coach_messages = relationship("CoachMessage", back_populates="session", cascade="all, delete-orphan")

class SetLog(Base):
    __tablename__ = "set_logs"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False)
    exercise_entry_id = Column(Integer, ForeignKey("exercise_entries.id", ondelete="CASCADE"), nullable=False)
    set_index = Column(Integer, nullable=False)
    suggested_weight = Column(Float, nullable=True)
    suggested_reps = Column(Integer, nullable=True)
    actual_weight = Column(Float, nullable=True)
    actual_reps = Column(Integer, nullable=True)
    effort = Column(Integer, nullable=True)  # 1-5
    notes = Column(Text)
    completed_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("WorkoutSession", back_populates="set_logs")
    exercise_entry = relationship("ExerciseEntry", back_populates="session_logs")

class CoachMessage(Base):
    __tablename__ = "coach_messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(CoachRole), nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    session = relationship("WorkoutSession", back_populates="coach_messages")

class AlgorithmState(Base):
    __tablename__ = "algorithm_state"
    id = Column(Integer, primary_key=True, index=True)
    exercise_entry_id = Column(Integer, ForeignKey("exercise_entries.id", ondelete="CASCADE"), nullable=False, unique=True)
    current_week = Column(Integer, default=1)
    last_suggested_weight = Column(Float, nullable=True)
    last_suggested_reps = Column(Integer, nullable=True)
    last_effort_avg = Column(Float, nullable=True)
    progression_type = Column(String, default="linear")  # linear, double, reverse
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    exercise_entry = relationship("ExerciseEntry")

class AppSetting(Base):
    __tablename__ = "app_settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)


class WorkoutLibrary(Base):
    __tablename__ = "workout_library"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    difficulty = Column(String, nullable=False, default="intermediate")
    description = Column(String, nullable=True)
    estimated_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    exercises = relationship("WorkoutLibraryExercise", back_populates="workout", cascade="all, delete-orphan", order_by="WorkoutLibraryExercise.order")


class WorkoutLibraryExercise(Base):
    __tablename__ = "workout_library_exercises"
    id = Column(Integer, primary_key=True, index=True)
    workout_library_id = Column(Integer, ForeignKey("workout_library.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    muscle_group = Column(String, nullable=True)
    equipment = Column(String, nullable=True)
    sets_target = Column(Integer, nullable=False, default=3)
    reps_target = Column(Integer, nullable=False, default=10)
    start_weight = Column(Float, nullable=False, default=0.0)
    rest_seconds = Column(Integer, nullable=False, default=90)
    order = Column(Integer, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    workout = relationship("WorkoutLibrary", back_populates="exercises")
