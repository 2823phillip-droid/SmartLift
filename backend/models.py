from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Enum, Boolean, UniqueConstraint, JSON
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime
import enum

Base = declarative_base()

class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    token_hash = Column(String, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    failed_login_count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    fitness_profile = Column(JSON, nullable=True)

    # reverse relationships
    contexts = relationship("Context", back_populates="user", cascade="all, delete-orphan")
    templates = relationship("WorkoutTemplate", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("WorkoutSession", back_populates="user", cascade="all, delete-orphan")
    exercise_entries = relationship("ExerciseEntry", back_populates="user", cascade="all, delete-orphan")
    set_logs = relationship("SetLog", back_populates="user", cascade="all, delete-orphan")
    coach_messages = relationship("CoachMessage", back_populates="user", cascade="all, delete-orphan")
    cardio_logs = relationship("CardioLog", back_populates="user", cascade="all, delete-orphan")
    algorithm_states = relationship("AlgorithmState", back_populates="user", cascade="all, delete-orphan")
    ai_trainer_adjustments = relationship("AITrainerAdjustment", back_populates="user", cascade="all, delete-orphan")
    body_weight_logs = relationship("BodyWeightLog", back_populates="user", cascade="all, delete-orphan")
    workout_libraries = relationship("WorkoutLibrary", back_populates="user", cascade="all, delete-orphan")
    workout_library_exercises = relationship("WorkoutLibraryExercise", back_populates="user", cascade="all, delete-orphan")

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
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(String)
    equipment_tags = Column(String)  # JSON array string
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    default_rest_seconds = Column(Integer, default=90)
    order = Column(Integer, default=0, server_default='0')

    user = relationship("User", back_populates="contexts")
    templates = relationship("WorkoutTemplate", back_populates="context", cascade="all, delete-orphan")

class WorkoutTemplate(Base):
    __tablename__ = "workout_templates"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    context_id = Column(Integer, ForeignKey("contexts.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(Enum(RoutineType), default=RoutineType.strength)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    default_rest_seconds = Column(Integer, nullable=True)
    coach_rules = Column(Text, nullable=True)  # JSON: {"muscle_group": "progression_type"}

    user = relationship("User", back_populates="templates")
    context = relationship("Context", back_populates="templates")
    exercises = relationship("ExerciseEntry", back_populates="template", cascade="all, delete-orphan", order_by="ExerciseEntry.order")
    sessions = relationship("WorkoutSession", back_populates="template", cascade="all, delete-orphan")

class ExerciseLibrary(Base):
    __tablename__ = "exercise_library"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    muscle_group = Column(String)  # bodyPart
    equipment = Column(String)
    default_rest_seconds = Column(Integer, default=90)
    video_url = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    gif_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ExerciseDB fields
    exercise_db_id = Column(String, unique=True, index=True, nullable=True)
    target = Column(String, nullable=True)
    secondary_muscles = Column(Text, nullable=True)  # JSON array
    instructions = Column(Text, nullable=True)  # JSON array
    difficulty = Column(String, nullable=True)
    category = Column(String, nullable=True)
    similar_exercises = Column(Text, nullable=True)  # JSON array
    substitutions = Column(Text, nullable=True)  # JSON array
    progressions = Column(Text, nullable=True)  # JSON array
    regressions = Column(Text, nullable=True)  # JSON array
    program_worthy = Column(Boolean, default=True, nullable=False)

class ExerciseEntry(Base):
    __tablename__ = "exercise_entries"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
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
    progression_type = Column(String, nullable=True)
    deload_override = Column(Integer, nullable=True, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="exercise_entries")
    template = relationship("WorkoutTemplate", back_populates="exercises")
    exercise_library = relationship("ExerciseLibrary")
    session_logs = relationship("SetLog", back_populates="exercise_entry", passive_deletes=True)

class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    template_id = Column(Integer, ForeignKey("workout_templates.id", ondelete="CASCADE"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    pre_workout_mood = Column(Text)
    pre_workout_tags = Column(String)  # JSON array string
    status = Column(Enum(SessionStatus), default=SessionStatus.active)

    user = relationship("User", back_populates="sessions")
    template = relationship("WorkoutTemplate", back_populates="sessions")
    set_logs = relationship("SetLog", back_populates="session", cascade="all, delete-orphan", order_by="SetLog.set_index")
    coach_messages = relationship("CoachMessage", back_populates="session", cascade="all, delete-orphan")
    cardio_logs = relationship("CardioLog", back_populates="session", cascade="all, delete-orphan")

class SetLog(Base):
    __tablename__ = "set_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(Integer, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False)
    exercise_entry_id = Column(Integer, ForeignKey("exercise_entries.id", ondelete="CASCADE"), nullable=False)
    set_index = Column(Integer, nullable=False)
    suggested_weight = Column(Float, nullable=True)
    suggested_reps = Column(Integer, nullable=True)
    actual_weight = Column(Float, nullable=True)
    actual_reps = Column(Integer, nullable=True)
    effort = Column(Integer, nullable=True)  # 1-5
    rir = Column(Integer, nullable=True)  # Reps in Reserve: 0=failure, 1+=easy
    notes = Column(Text)
    is_seeded = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="set_logs")
    session = relationship("WorkoutSession", back_populates="set_logs")
    exercise_entry = relationship("ExerciseEntry", back_populates="session_logs")

class CoachMessage(Base):
    __tablename__ = "coach_messages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(Integer, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(CoachRole), nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="coach_messages")
    session = relationship("WorkoutSession", back_populates="coach_messages")


class CardioLog(Base):
    __tablename__ = "cardio_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(Integer, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=True)
    exercise_library_id = Column(Integer, ForeignKey("exercise_library.id"), nullable=True)
    cardio_type = Column(String, default="run")  # run, bike, walk, hiit, row, etc.
    duration_minutes = Column(Integer, nullable=False)
    distance_miles = Column(Float, nullable=True)
    calories = Column(Integer, nullable=True)
    avg_heart_rate = Column(Integer, nullable=True)
    notes = Column(Text)
    completed_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="cardio_logs")
    session = relationship("WorkoutSession", back_populates="cardio_logs")
    exercise_library = relationship("ExerciseLibrary")

class AlgorithmState(Base):
    __tablename__ = "algorithm_state"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    exercise_entry_id = Column(Integer, ForeignKey("exercise_entries.id", ondelete="CASCADE"), nullable=False, unique=True)
    current_week = Column(Integer, default=1)
    last_suggested_weight = Column(Float, nullable=True)
    last_suggested_reps = Column(Integer, nullable=True)
    last_effort_avg = Column(Float, nullable=True)
    progression_type = Column(String, default="linear")  # linear, double, reverse
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="algorithm_states")
    exercise_entry = relationship("ExerciseEntry")


class ProgressionTransition(Base):
    __tablename__ = "progression_transitions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    exercise_entry_id = Column(Integer, ForeignKey("exercise_entries.id", ondelete="CASCADE"), nullable=False)
    from_phase = Column(String, nullable=False)
    to_phase = Column(String, nullable=False)
    week_in_block = Column(Integer, default=1)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
    exercise_entry = relationship("ExerciseEntry")


class AppSetting(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    value = Column(String, nullable=True)
    __table_args__ = (UniqueConstraint("key", "user_id", name="uq_user_setting"),)

class WorkoutLibrary(Base):
    __tablename__ = "workout_library"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    difficulty = Column(String, nullable=False, default="intermediate")
    description = Column(String, nullable=True)
    estimated_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="workout_libraries")
    exercises = relationship("WorkoutLibraryExercise", back_populates="workout", cascade="all, delete-orphan", order_by="WorkoutLibraryExercise.order")


class WorkoutLibraryExercise(Base):
    __tablename__ = "workout_library_exercises"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
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

    user = relationship("User", back_populates="workout_library_exercises")
    workout = relationship("WorkoutLibrary", back_populates="exercises")

class BodyWeightLog(Base):
    __tablename__ = "body_weight_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    weight_lbs = Column(Float, nullable=False)
    logged_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    user = relationship("User", back_populates="body_weight_logs")


class AITrainerAdjustment(Base):
    __tablename__ = "ai_trainer_adjustments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(Integer, ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(Integer, ForeignKey("workout_templates.id", ondelete="SET NULL"), nullable=True)
    exercise_entry_id = Column(Integer, ForeignKey("exercise_entries.id", ondelete="SET NULL"), nullable=True)
    exercise_name = Column(String, nullable=False)
    proposed_weight = Column(Float, nullable=True)
    proposed_reps = Column(Integer, nullable=True)
    proposed_sets = Column(Integer, nullable=True)
    proposed_rest_seconds = Column(Integer, nullable=True)
    proposed_order = Column(Integer, nullable=True)
    effort_avg = Column(Float, nullable=True)
    progression_type = Column(String, nullable=True)
    applied = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="ai_trainer_adjustments")
