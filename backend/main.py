from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, ConfigDict, field_validator, model_serializer
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Union, cast, Any
import json
import os
import logging
import time
import traceback
import secrets
import hashlib
import httpx
import asyncio
import dataclasses
from collections import defaultdict
from logging.handlers import RotatingFileHandler
from passlib.context import CryptContext

# Load backend .env manually
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_ENV_PATH = os.path.join(_BACKEND_DIR, ".env")
if os.path.exists(_ENV_PATH):
    with open(_ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

from db import SessionLocal, init_db
from models import (
    User, UserRole, Context, WorkoutTemplate, ExerciseLibrary, ExerciseEntry,
    WorkoutSession, SetLog, CoachMessage, AlgorithmState, ProgressionTransition, RoutineType, SessionStatus, CoachRole, AppSetting,
    WorkoutLibrary, WorkoutLibraryExercise, BodyWeightLog, AITrainerAdjustment, CoachUsageLog,
    AiCoachConversation, AiCoachMessage
)
from rules import compute_prescription, RuleInput, SetRecord, Prescription, WorkloadStatus, ProgressionType, compute_coach_state, CoachState
from services.generation import build_full_draft
from exercise_whitelist import _canonical_name

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
AUTH_TOKEN_PREFIX = "Bearer "


def _normalize_gif_url(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    if raw.startswith("/api/"):
        return raw
    # Convert local filesystem paths like /.../exercisedb_gifs/180/0001.gif
    # or C:\...\exercisedb_gifs\180\0001.gif into /api/exercisedb/gifs/0001.gif
    norm = raw.replace("\\", "/")
    marker = "/exercisedb_gifs/"
    idx = norm.rfind(marker)
    if idx >= 0:
        filename = norm[idx + len(marker):]
        # drop angle folder if present (180/ or 360/)
        if "/" in filename:
            filename = filename.split("/", 1)[1]
        return f"/api/exercisedb/gifs/{filename}"
    return None


def _canonical_name_for_exercise(name: Optional[Any]) -> str:
    """Return canonical display name if matched, otherwise original."""
    if not name or not isinstance(name, str):
        return str(name) if name is not None else ""
    canon = _canonical_name(name)
    return canon.name if canon else name


app = FastAPI(title="Workout Logger")


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
class _RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}

    def _clean(self, key: str, window: float) -> None:
        cutoff = time.time() - window
        self._hits[key] = [t for t in self._hits.get(key, []) if t > cutoff]

    def check(self, key: str, limit: int, window: float) -> None:
        self._clean(key, window)
        times = self._hits.get(key, [])
        if len(times) >= limit:
            raise HTTPException(status_code=429, detail="Too many requests")
        times.append(time.time())
        self._hits[key] = times

_auth_rate_limiter = _RateLimiter()

def _get_client_ip(request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

# Structured logging setup
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_PATH = os.path.join(LOG_DIR, "workout.log")

logger = logging.getLogger("workout")
logger.setLevel(logging.DEBUG)

_handler = RotatingFileHandler(LOG_PATH, maxBytes=5_000_000, backupCount=5, encoding="utf-8")
_handler.setFormatter(logging.Formatter("%(message)s"))
logger.addHandler(_handler)
logger.addHandler(logging.StreamHandler())  # also echo to console/systemd

# Coach LLM pricing for Hermes 4 70B via NousResearch
# Source: public provider pricing pages (Nebius/OpenRouter), $0.13/M input, $0.40/M output
_COACH_INPUT_COST_PER_M = 0.13
_COACH_OUTPUT_COST_PER_M = 0.40

def _estimate_coach_cost(prompt_tokens: Optional[int], completion_tokens: Optional[int]) -> Optional[float]:
    if prompt_tokens is None and completion_tokens is None:
        return None
    return round(
        ((prompt_tokens or 0) / 1_000_000) * _COACH_INPUT_COST_PER_M
        + ((completion_tokens or 0) / 1_000_000) * _COACH_OUTPUT_COST_PER_M,
        6,
    )

# Middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(json.dumps({
            "type": "request",
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query),
            "status": 500,
            "latency_ms": round((time.perf_counter() - start) * 1000),
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }))
        raise
    latency = round((time.perf_counter() - start) * 1000)
    logger.info(json.dumps({
        "type": "request",
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "latency_ms": latency,
    }))
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8100",
        "http://localhost:5173",
        "http://localhost:4173",
        "capacitor://localhost",
        "ionic://localhost",
        "http://192.168.1.111:5173",
        "http://192.168.1.111:4173",
    ],
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "*"],
    expose_headers=["*"],
    max_age=600,
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(json.dumps({
        "type": "unhandled_exception",
        "method": request.method,
        "path": str(request.url.path),
        "error": str(exc),
        "traceback": traceback.format_exc(),
    }))
    return JSONResponse(status_code=500, content={"detail": "internal_server_error"})

@app.middleware("http")
async def timeout_middleware(request, call_next):
    try:
        return await asyncio.wait_for(call_next(request), timeout=20)
    except asyncio.TimeoutError:
        logger.error(json.dumps({
            "type": "timeout",
            "method": request.method,
            "path": str(request.url.path),
        }))
        return JSONResponse(status_code=504, content={"detail": "gateway_timeout"})

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/readyz")
async def readyz():
    return {"status": "ready"}

@app.get("/roadmap")
async def roadmap():
    with open("roadmap.html", "r") as f:
        html = f.read()
    served_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    html = html.replace(
        '<div class="legend-item" style="margin-left:auto;color:var(--muted)" id="deploy-ts"></div>',
        f'<div class="legend-item" style="margin-left:auto;color:var(--muted)" id="deploy-ts">Deployed: {served_at}</div>',
    )
    return HTMLResponse(content=html, media_type="text/html")

@app.get("/architecture")
async def architecture():
    with open("architecture.html", "r") as f:
        html = f.read()
    served_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    html = html.replace(
        "Last updated: 2026-08-03",
        f"Last updated: 2026-08-03 — Served: {served_at}",
    )
    return HTMLResponse(content=html, media_type="text/html")

@app.get("/flowchart")
async def flowchart():
    with open("flowchart.html", "r") as f:
        html = f.read()
    served_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    html = html.replace(
        "2026-08-04",
        f"2026-08-04 — Served: {served_at}",
    )
    return HTMLResponse(content=html, media_type="text/html")

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
def on_startup():
    init_db()
    _run_migrations()

import json as _json

def _run_migrations():
    try:
        from sqlalchemy import text as _text
        from db import engine
        with engine.connect() as conn:
            dialect = conn.dialect.name
            if dialect == "sqlite":
                def cols(table):
                    return [row[1] for row in conn.execute(_text(f"PRAGMA table_info({table})"))]
                date_type = "DATETIME"
            else:
                def cols(table):
                    return [row[0] for row in conn.execute(_text(
                        "SELECT column_name FROM information_schema.columns WHERE table_name = :t"
                    ), {"t": table})]
                date_type = "TIMESTAMP"

            if "coach_rules" not in cols("workout_templates"):
                conn.execute(_text("ALTER TABLE workout_templates ADD COLUMN coach_rules TEXT"))
                conn.commit()

            if "fitness_profile" not in cols("users"):
                conn.execute(_text("ALTER TABLE users ADD COLUMN fitness_profile JSONB"))
                conn.commit()

            ucols = cols("users")
            if "failed_login_count" not in ucols:
                conn.execute(_text("ALTER TABLE users ADD COLUMN failed_login_count INTEGER DEFAULT 0 NOT NULL"))
                conn.commit()
            if "locked_until" not in ucols:
                conn.execute(_text(f"ALTER TABLE users ADD COLUMN locked_until {date_type}"))
                conn.commit()
            if "token_expires_at" not in ucols:
                conn.execute(_text(f"ALTER TABLE users ADD COLUMN token_expires_at {date_type}"))
                conn.commit()

            ecols = cols("exercise_entries")
            if "progression_type" not in ecols:
                conn.execute(_text("ALTER TABLE exercise_entries ADD COLUMN progression_type TEXT"))
                conn.commit()
            if "deload_override" not in ecols:
                conn.execute(_text("ALTER TABLE exercise_entries ADD COLUMN deload_override INTEGER DEFAULT 0"))
                conn.commit()
            if "group_id" not in ecols:
                conn.execute(_text("ALTER TABLE exercise_entries ADD COLUMN group_id TEXT"))
                conn.execute(_text("CREATE INDEX IF NOT EXISTS ix_exercise_entries_group_id ON exercise_entries (group_id)"))
                conn.commit()

            scolumns = cols("set_logs")
            if "rir" not in scolumns:
                conn.execute(_text("ALTER TABLE set_logs ADD COLUMN rir INTEGER"))
                conn.commit()

            if "actual_weight_left" not in scolumns:
                conn.execute(_text("ALTER TABLE set_logs ADD COLUMN actual_weight_left FLOAT"))
                conn.commit()
            if "actual_weight_right" not in scolumns:
                conn.execute(_text("ALTER TABLE set_logs ADD COLUMN actual_weight_right FLOAT"))
                conn.commit()

            if "rpe" not in scolumns:
                conn.execute(_text("ALTER TABLE set_logs ADD COLUMN rpe INTEGER"))
                conn.commit()
            if "form_quality" not in scolumns:
                conn.execute(_text("ALTER TABLE set_logs ADD COLUMN form_quality INTEGER"))
                conn.commit()

            if "coach_usage_logs" not in cols("coach_usage_logs"):
                from models import Base
                Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables["coach_usage_logs"]])
                conn.commit()
                logging.info("Created coach_usage_logs table")

            # Migrate exercise_library to ExerciseDB schema
            elib_cols = cols("exercise_library")
            if "program_worthy" not in elib_cols:
                # Drop old table (CASCADE removes dependent FKs from exercise_entries/cardio_logs)
                # then recreate exercise_library + dependent tables
                if dialect == "sqlite":
                    conn.execute(_text("DROP TABLE IF EXISTS exercise_library"))
                else:
                    conn.execute(_text("DROP TABLE IF EXISTS exercise_library CASCADE"))
                conn.commit()
                from models import Base
                # Recreate exercise_library first (FKs reference it)
                Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables["exercise_library"]])
                # Then recreate dependent tables
                for dep in ["exercise_entries", "cardio_logs"]:
                    if dep in Base.metadata.tables:
                        Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables[dep]])
                logging.info("Recreated exercise_library table with ExerciseDB schema")
    except Exception:
        pass

# --- Schemas ---

class ContextCreate(BaseModel):
    name: str
    description: Optional[str] = None
    equipment_tags: Optional[List[str]] = []
    default_rest_seconds: Optional[int] = 90
    order: Optional[int] = 0

class ContextUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    equipment_tags: Optional[List[str]] = None
    default_rest_seconds: Optional[int] = None
    order: Optional[int] = None

class ContextOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    equipment_tags: List[str]
    is_active: bool
    default_rest_seconds: int = 90
    order: int = 0

    class Config:
        from_attributes = True

class ExerciseLibraryOut(BaseModel):
    id: int
    name: str
    muscle_group: Optional[str]
    equipment: Optional[str]
    default_rest_seconds: int
    video_url: Optional[str] = None
    image_url: Optional[str] = None
    gif_url: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def _title_case_name(cls, value: Optional[str]) -> str:
        if isinstance(value, str) and value and value == value.lower():
            return value.title()
        return value or ""

    class Config:
        from_attributes = True

class ExerciseEntryCreate(BaseModel):
    template_id: Optional[int] = None
    exercise_library_id: Optional[int] = None
    name: Optional[str] = None
    sets_target: Optional[int] = None
    reps_target: Optional[int] = None
    start_weight: Optional[float] = None
    rest_seconds: Optional[int] = None
    order: Optional[int] = None
    notes: Optional[str] = None
    per_set_data: Optional[str] = None  # JSON string
    progression_type: Optional[str] = None
    deload_override: Optional[bool] = None
    group_id: Optional[str] = None

class ExerciseEntryOut(BaseModel):
    id: int
    template_id: int
    exercise_library_id: Optional[int]
    name: str
    sets_target: int
    reps_target: int
    start_weight: float
    rest_seconds: int
    order: int
    notes: Optional[str]
    per_set_data: Optional[str] = None
    progression_type: Optional[str] = None
    deload_override: Optional[bool] = None
    gif_url: Optional[str] = None
    group_id: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def _title_case_name(cls, value: Optional[str]) -> str:
        if isinstance(value, str) and value and value == value.lower():
            return value.title()
        return value or ""

    class Config:
        from_attributes = True

class WorkoutTemplateCreate(BaseModel):
    context_id: int
    name: str
    type: RoutineType = RoutineType.strength
    order: int = 0
    default_rest_seconds: Optional[int] = None
    coach_rules: Optional[str] = None  # JSON: {"muscle_group": "progression_type"}

class WorkoutTemplateOut(BaseModel):
    id: int
    context_id: int
    name: str
    type: str
    order: int
    default_rest_seconds: Optional[int] = None
    coach_rules: Optional[str] = None
    exercises: List[ExerciseEntryOut] = []

    class Config:
        from_attributes = True

class WorkoutTemplateUpdate(BaseModel):
    name: str
    type: Optional[str] = None
    order: Optional[int] = None
    default_rest_seconds: Optional[int] = None
    coach_rules: Optional[str] = None

class ApiBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode='plain')
    def serialize_model(self):
        return {
            k: (
                v.replace(tzinfo=timezone.utc).isoformat()
                if isinstance(v, datetime) and v.tzinfo is None else v
            )
            for k, v in self.__dict__.items()
            if not k.startswith("_")
        }


class SessionCreate(BaseModel):
    template_id: Optional[int] = None
    pre_workout_mood: Optional[str] = None
    pre_workout_tags: Optional[List[str]] = []


class SessionOut(ApiBaseModel):
    id: int
    template_id: Optional[int]
    started_at: datetime
    ended_at: Optional[datetime]
    pre_workout_mood: Optional[str]
    pre_workout_tags: List[str]
    status: str

    class Config:
        from_attributes = True

class SetLogCreate(BaseModel):
    session_id: int
    exercise_entry_id: int
    set_index: int
    suggested_weight: Optional[float] = None
    suggested_reps: Optional[int] = None
    actual_weight: Optional[float] = None
    actual_weight_left: Optional[float] = None
    actual_weight_right: Optional[float] = None
    actual_reps: Optional[int] = None
    effort: Optional[int] = None
    rir: Optional[int] = None
    rpe: Optional[int] = None
    form_quality: Optional[int] = None
    notes: Optional[str] = None

class SetLogOut(BaseModel):
    id: int
    session_id: int
    exercise_entry_id: int
    set_index: int
    suggested_weight: Optional[float]
    suggested_reps: Optional[int]
    actual_weight: Optional[float]
    actual_weight_left: Optional[float]
    actual_weight_right: Optional[float]
    actual_reps: Optional[int]
    effort: Optional[int]
    rir: Optional[int]
    rpe: Optional[int]
    form_quality: Optional[int]
    notes: Optional[str]

    class Config:
        from_attributes = True

class SessionHistoryOut(ApiBaseModel):
    id: int
    template_id: Optional[int]
    started_at: datetime
    ended_at: Optional[datetime]
    pre_workout_mood: Optional[str]
    pre_workout_tags: List[str]
    status: str
    template_name: Optional[str] = None
    context_name: Optional[str] = None

class SetLogUpdate(BaseModel):
    actual_weight: Optional[float] = None
    actual_reps: Optional[int] = None
    effort: Optional[int] = None
    rir: Optional[int] = None
    rpe: Optional[int] = None
    form_quality: Optional[int] = None
    notes: Optional[str] = None

class ExerciseProgressPoint(BaseModel):
    date: str
    weight: float
    reps: int

class ExerciseProgressResponse(BaseModel):
    exercise_entry_id: int
    name: str
    points: List[ExerciseProgressPoint]

class ExerciseNameProgressResponse(BaseModel):
    name: str
    points: List[ExerciseProgressPoint]
    seeded: bool = False

class CoachMessageCreate(BaseModel):
    session_id: int
    role: CoachRole
    content: str

class CoachMessageOut(ApiBaseModel):
    id: int
    session_id: int
    role: str
    content: str
    timestamp: datetime

    class Config:
        from_attributes = True

class BodyWeightLogCreate(BaseModel):
    weight_lbs: float
    notes: Optional[str] = None

class BodyWeightLogOut(ApiBaseModel):
    id: int
    weight_lbs: float
    logged_at: datetime
    notes: Optional[str]

    class Config:
        from_attributes = True

# --- Auth ---

class UserCreate(BaseModel):
    email: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class UserOut(BaseModel):
    id: int
    email: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    fitness_profile: Optional[dict] = None

    class Config:
        from_attributes = True

class TokenOut(BaseModel):
    token: str
    user: UserOut

class LoginIn(BaseModel):
    email: str
    password: str

class GoogleLoginIn(BaseModel):
    id_token: str

class AppleLoginIn(BaseModel):
    identity_token: str

def _find_or_create_user_by_email(db: Session, email: str, preferred_role: str = "user", first_name: Optional[str] = None, last_name: Optional[str] = None) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        updated = False
        if first_name and not user.first_name:
            user.first_name = first_name
            updated = True
        if last_name and not user.last_name:
            user.last_name = last_name
            updated = True
        if updated:
            db.commit()
            db.refresh(user)
        return user
    user = User(
        email=email,
        hashed_password="",
        role=preferred_role,
        first_name=first_name,
        last_name=last_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def _issue_token_for_user(user: User) -> TokenOut:
    token = _make_token()
    user.token_hash = _token_hash(token)
    user.token_expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    if not user.hashed_password:
        user.hashed_password = ""
    return TokenOut(
        token=token,
        user=UserOut(
            id=user.id,
            email=user.email,
            role=user.role.value,
            first_name=user.first_name,
            last_name=user.last_name,
        ),
    )

def _verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

def _make_token() -> str:
    raw = secrets.token_urlsafe(32)
    return raw

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

@app.post("/api/auth/signup", response_model=TokenOut)
def signup(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    ip = _get_client_ip(request)
    _auth_rate_limiter.check(f"signup:{ip}", 5, 60)
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        hashed_password=pwd_context.hash(payload.password),
        role="user",
        first_name=payload.first_name,
        last_name=payload.last_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = _make_token()
    user.token_hash = _token_hash(token)
    user.token_expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(
        token=token,
        user=UserOut(id=user.id, email=user.email, role=user.role.value, first_name=user.first_name, last_name=user.last_name),
    )

@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = _get_client_ip(request)
    _auth_rate_limiter.check(f"login:{ip}", 10, 60)
    logger.info(json.dumps({"type": "login", "email": payload.email, "password_length": len(payload.password), "password_prefix": payload.password[:2]}))
    user = db.query(User).filter(User.email == payload.email).first()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if user and user.locked_until and user.locked_until > now:
        raise HTTPException(status_code=429, detail="Account locked. Try again later.")
    if not user or not _verify_password(payload.password, user.hashed_password):
        if user:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= 5:
                user.locked_until = now + timedelta(minutes=5)
            db.add(user)
            db.commit()
            db.refresh(user)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = _make_token()
    user.token_hash = _token_hash(token)
    user.token_expires_at = now + timedelta(days=7)
    user.failed_login_count = 0
    user.locked_until = None
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(
        token=token,
        user=UserOut(id=user.id, email=user.email, role=user.role.value, first_name=user.first_name, last_name=user.last_name),
    )

@app.post("/api/auth/google", response_model=TokenOut)
async def google_login(payload: GoogleLoginIn, db: Session = Depends(get_db)):
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": payload.id_token})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    data = resp.json()
    email = data.get("email")
    if not email or not data.get("email_verified"):
        raise HTTPException(status_code=400, detail="Google account missing verified email")
    given_name = data.get("given_name")
    family_name = data.get("family_name")
    user = _find_or_create_user_by_email(db, email, preferred_role="user", first_name=given_name, last_name=family_name)
    token_out = _issue_token_for_user(user)
    db.add(user)
    db.commit()
    db.refresh(user)
    return token_out

@app.post("/api/auth/apple", response_model=TokenOut)
async def apple_login(payload: AppleLoginIn):
    raise HTTPException(status_code=501, detail="Apple login is not configured yet")

class RefreshIn(BaseModel):
    token: str

class LogoutResponse(BaseModel):
    ok: bool = True

@app.post("/api/auth/refresh", response_model=TokenOut)
def refresh_token(payload: RefreshIn, db: Session = Depends(get_db)):
    user = _user_from_token(payload.token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    token = _make_token()
    user.token_hash = _token_hash(token)
    user.token_expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(
        token=token,
        user=UserOut(id=user.id, email=user.email, role=user.role.value, first_name=user.first_name, last_name=user.last_name),
    )

@app.post("/api/auth/logout", response_model=LogoutResponse)
def logout(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        user = _user_from_token(token, db)
        if user:
            user.token_hash = None
            user.token_expires_at = None
            db.add(user)
            db.commit()
            db.refresh(user)
    return {"ok": True}

def _user_from_token(token: str, db: Session) -> User | None:
    token_hash = _token_hash(token)
    user = db.query(User).filter(User.token_hash == token_hash).first()
    if not user:
        return None
    if user.token_expires_at and datetime.now(timezone.utc).replace(tzinfo=None) > user.token_expires_at:
        user.token_hash = None
        user.token_expires_at = None
        db.add(user)
        db.commit()
        db.refresh(user)
        return None
    return user

@app.get("/api/auth/me", response_model=UserOut)
def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1]
    user = _user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return UserOut(
        id=user.id,
        email=user.email,
        role=user.role.value,
        first_name=user.first_name,
        last_name=user.last_name,
        fitness_profile=user.fitness_profile,
    )

def get_current_user_dep(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1]
    user = _user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

class ProfileUpdateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class FitnessProfileIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    sex: Optional[str] = None
    activity_level: Optional[str] = None
    current_training_status: Optional[str] = None
    goal: Optional[List[str]] = []
    equipment: Optional[Union[str, List[str]]] = None
    days_per_week: Optional[int] = None
    minutes_per_session: Optional[int] = None
    experience: Optional[str] = None
    focus: Optional[str] = None
    limitations: Optional[List[str]] = []
    workout_modality: Optional[str] = None
    modality_secondary: Optional[List[str]] = []
    modality_mix: Optional[str] = None
    training_history: Optional[str] = None
    progression_type: Optional[str] = None
    workout_location: Optional[str] = None
    gym_type: Optional[str] = None
    cardio_preference: Optional[str] = None
    cardio_timing: Optional[str] = None
    cardio_type: Optional[str] = None
    incorporated_cardio_type: Optional[str] = None
    cardio_days_per_week: Optional[int] = None

class TrainerGenerateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    sex: Optional[str] = None
    activity_level: Optional[str] = None
    current_training_status: Optional[str] = None
    goal: Optional[List[str]] = []
    equipment: Optional[Union[str, List[str]]] = None
    days_per_week: Optional[int] = None
    minutes_per_session: Optional[int] = None
    experience: Optional[str] = None
    focus: Optional[str] = None
    limitations: Optional[List[str]] = []
    workout_modality: Optional[str] = None
    modality_secondary: Optional[List[str]] = []
    modality_mix: Optional[str] = None
    training_history: Optional[str] = None
    progression_type: Optional[str] = None
    workout_location: Optional[str] = None
    gym_type: Optional[str] = None
    cardio_preference: Optional[str] = None
    cardio_timing: Optional[str] = None
    cardio_type: Optional[str] = None
    incorporated_cardio_type: Optional[str] = None
    cardio_days_per_week: Optional[int] = None

class WorkoutDraftExercise(BaseModel):
    name: str
    muscle_group: Optional[str] = None
    equipment: Optional[str] = None
    target: Optional[str] = None
    sets_target: int
    reps_target: int
    start_weight: float
    rest_seconds: int
    order: int
    notes: Optional[str] = None
    gif_url: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    movement_pattern: Optional[str] = None
    modality_fit: Optional[str] = None
    difficulty: Optional[str] = None
    compound_rank: Optional[int] = None
    progression_type: Optional[str] = None
    slot_type: Optional[str] = None
    exercise_library_id: Optional[int] = None

class WorkoutDraftGroup(BaseModel):
    name: str
    exercises: List[WorkoutDraftExercise]

class WorkoutDraft(BaseModel):
    name: str
    description: str
    groups: List[WorkoutDraftGroup]

class MealTargets(BaseModel):
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int

class MealPlanDraft(BaseModel):
    name: str
    targets: MealTargets
    days: List[dict]

class TrainerGenerateOut(BaseModel):
    workout_draft: WorkoutDraft
    meal_plan_draft: Optional[MealPlanDraft] = None

@app.put("/api/auth/profile", response_model=UserOut)
def update_profile(payload: ProfileUpdateIn, current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    if payload.first_name is not None:
        current_user.first_name = payload.first_name
    if payload.last_name is not None:
        current_user.last_name = payload.last_name
    db.commit()
    db.refresh(current_user)
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role.value,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        fitness_profile=current_user.fitness_profile,
    )

@app.get("/api/profile/fitness")
def get_fitness_profile(current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user.id).first()
    return user.fitness_profile or {}

@app.put("/api/profile/fitness")
def put_fitness_profile(payload: FitnessProfileIn, current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user.id).first()
    user.fitness_profile = json.loads(json.dumps(payload.model_dump(exclude_none=True)))
    db.commit()
    db.refresh(user)
    return user.fitness_profile or {}

@app.post("/api/trainer/generate", response_model=TrainerGenerateOut)
def trainer_generate(payload: Optional[TrainerGenerateIn] = None, current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    # Merge request overrides with saved profile
    saved = current_user.fitness_profile or {}
    overrides = json.loads(json.dumps(payload.model_dump(exclude_none=True))) if payload else {}
    merged = {**saved, **overrides}
    # Map frontend field name to backend expected field
    if not merged.get("activity_level") and merged.get("current_training_status"):
        merged["activity_level"] = merged.pop("current_training_status")
    profile = merged

    workout_draft, meal_plan_draft = build_full_draft(db, merged, current_user.id)
    return TrainerGenerateOut(workout_draft=workout_draft, meal_plan_draft=meal_plan_draft)

# --- Body Weight ---

@app.get("/api/body-weight", response_model=List[BodyWeightLogOut])
def list_body_weight_logs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    return db.query(BodyWeightLog).filter(BodyWeightLog.user_id == current_user.id).order_by(BodyWeightLog.logged_at.asc()).all()

@app.post("/api/body-weight", response_model=BodyWeightLogOut)
def create_body_weight_log(payload: BodyWeightLogCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    log = BodyWeightLog(weight_lbs=payload.weight_lbs, notes=payload.notes, user_id=current_user.id)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log

@app.delete("/api/body-weight/{log_id}")
def delete_body_weight_log(log_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    log = db.query(BodyWeightLog).filter(BodyWeightLog.id == log_id, BodyWeightLog.user_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Body weight log not found")
    db.delete(log)
    db.commit()
    return {"ok": True}

# --- Contexts ---

@app.post("/api/contexts", response_model=ContextOut)
def create_context(payload: ContextCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    ctx = Context(
        name=payload.name,
        description=payload.description,
        equipment_tags=json.dumps(payload.equipment_tags or []),
        default_rest_seconds=payload.default_rest_seconds,
        user_id=current_user.id,
        order=payload.order or 0,
    )
    db.add(ctx)
    db.commit()
    db.refresh(ctx)
    return ContextOut(
        id=ctx.id,
        name=ctx.name,
        description=ctx.description,
        equipment_tags=json.loads(ctx.equipment_tags or "[]"),
        is_active=ctx.is_active,
        default_rest_seconds=ctx.default_rest_seconds,
    )

@app.get("/api/contexts", response_model=List[ContextOut])
def list_contexts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    contexts = db.query(Context).filter(Context.user_id == current_user.id).order_by(Context.order).all()
    return [
        ContextOut(
            id=c.id,
            name=c.name,
            description=c.description,
            equipment_tags=json.loads(c.equipment_tags or "[]"),
            is_active=c.is_active,
            default_rest_seconds=c.default_rest_seconds,
            order=getattr(c, "order", 0),
        )
        for c in contexts
    ]

@app.get("/api/contexts/{context_id}", response_model=ContextOut)
def get_context(context_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    c = db.query(Context).filter(Context.id == context_id, Context.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Context not found")
    return ContextOut(
        id=c.id,
        name=c.name,
        description=c.description,
        equipment_tags=json.loads(c.equipment_tags or "[]"),
        is_active=c.is_active,
        default_rest_seconds=c.default_rest_seconds,
    )

@app.delete("/api/contexts/{context_id}")
def delete_context(context_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    c = db.query(Context).filter(Context.id == context_id, Context.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Context not found")
    db.delete(c)
    db.commit()
    return {"ok": True}

@app.put("/api/contexts/{context_id}", response_model=ContextOut)
def update_context(context_id: int, payload: ContextUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    c = db.query(Context).filter(Context.id == context_id, Context.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Context not found")
    if payload.name is not None:
        c.name = payload.name
    if payload.description is not None:
        c.description = payload.description
    if payload.equipment_tags is not None:
        c.equipment_tags = json.dumps(payload.equipment_tags)
    if payload.default_rest_seconds is not None:
        c.default_rest_seconds = payload.default_rest_seconds
    if payload.order is not None:
        c.order = payload.order
    db.commit()
    db.refresh(c)
    return ContextOut(
        id=c.id,
        name=c.name,
        description=c.description,
        equipment_tags=json.loads(c.equipment_tags or "[]"),
        is_active=c.is_active,
        order=getattr(c, "order", 0),
    )


def _template_out(tpl: WorkoutTemplate) -> WorkoutTemplateOut:
    exercises = sorted(tpl.exercises or [], key=lambda e: e.order)
    return WorkoutTemplateOut(
        id=tpl.id,
        context_id=tpl.context_id,
        name=tpl.name,
        type=tpl.type,
        order=tpl.order,
        default_rest_seconds=tpl.default_rest_seconds,
        coach_rules=tpl.coach_rules,
        exercises=[
            ExerciseEntryOut(
                id=e.id,
                template_id=e.template_id,
                exercise_library_id=e.exercise_library_id,
                name=_canonical_name_for_exercise(e.name),
                sets_target=e.sets_target,
                reps_target=e.reps_target,
                start_weight=e.start_weight,
                rest_seconds=e.rest_seconds,
                order=e.order,
                notes=e.notes,
                per_set_data=e.per_set_data,
                progression_type=getattr(e, "progression_type", None),
                deload_override=getattr(e, "deload_override", None),
                gif_url=_normalize_gif_url(getattr(getattr(e, "exercise_library", None), "gif_url", None)),
            )
            for e in exercises
        ],
    )


# --- Templates ---

def _next_unique_template_name(db: Session, user_id: int, context_id: int, name: str) -> str:
    existing = (
        db.query(WorkoutTemplate)
        .filter(
            WorkoutTemplate.user_id == user_id,
            WorkoutTemplate.context_id == context_id,
        )
        .all()
    )
    base = name
    max_suffix = -1
    for t in existing:
        if str(t.name) == base:
            max_suffix = max(max_suffix, 0)
        elif str(t.name).startswith(base + " "):
            suffix_part = str(t.name)[len(base) + 1 :]
            if suffix_part.isdigit():
                max_suffix = max(max_suffix, int(suffix_part))
    if max_suffix < 0:
        return base
    return f"{base} {max_suffix + 1}"


@app.post("/api/templates", response_model=WorkoutTemplateOut)
def create_template(payload: WorkoutTemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    name = _next_unique_template_name(db, cast(int, current_user.id), payload.context_id, payload.name)
    for _ in range(20):
        try:
            tpl = WorkoutTemplate(
                context_id=payload.context_id,
                name=name,
                type=payload.type,
                order=payload.order,
                default_rest_seconds=payload.default_rest_seconds,
                coach_rules=payload.coach_rules,
                user_id=current_user.id,
            )
            db.add(tpl)
            db.commit()
            db.refresh(tpl)
            return _template_out(tpl)
        except IntegrityError:
            db.rollback()
            name = _next_unique_template_name(db, cast(int, current_user.id), payload.context_id, payload.name)
    raise HTTPException(status_code=409, detail="Could not create unique template name")

@app.get("/api/templates/{template_id}", response_model=WorkoutTemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    tpl = db.query(WorkoutTemplate).filter(WorkoutTemplate.id == template_id, WorkoutTemplate.user_id == current_user.id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_out(tpl)

@app.get("/api/contexts/{context_id}/templates", response_model=List[WorkoutTemplateOut])
def list_templates(context_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    tpls = db.query(WorkoutTemplate).filter(WorkoutTemplate.context_id == context_id, WorkoutTemplate.user_id == current_user.id).order_by(WorkoutTemplate.order).all()
    return [_template_out(t) for t in tpls]

@app.get("/api/templates", response_model=List[WorkoutTemplateOut])
def list_all_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    tpls = db.query(WorkoutTemplate).filter(WorkoutTemplate.user_id == current_user.id).order_by(WorkoutTemplate.context_id, WorkoutTemplate.order).all()
    return [_template_out(t) for t in tpls]

@app.put("/api/templates/{template_id}", response_model=WorkoutTemplateOut)
def update_template(template_id: int, payload: WorkoutTemplateUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    tpl = db.query(WorkoutTemplate).filter(WorkoutTemplate.id == template_id, WorkoutTemplate.user_id == current_user.id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    tpl.name = payload.name
    if payload.type is not None:
        tpl.type = payload.type
    if payload.order is not None:
        tpl.order = payload.order
    if payload.default_rest_seconds is not None:
        tpl.default_rest_seconds = payload.default_rest_seconds
    if payload.coach_rules is not None:  # pyright: ignore [reportAttributeAccessIssue]
        tpl.coach_rules = payload.coach_rules
    db.commit()
    db.refresh(tpl)
    return _template_out(tpl)

@app.delete("/api/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    tpl = db.query(WorkoutTemplate).filter(WorkoutTemplate.id == template_id, WorkoutTemplate.user_id == current_user.id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tpl)
    db.commit()
    return {"ok": True}

# --- Exercises ---

@app.post("/api/exercises", response_model=ExerciseEntryOut)
def create_exercise(payload: ExerciseEntryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    allowed = {k: v for k, v in payload.dict(exclude_unset=True).items() if k in {
        "template_id","exercise_library_id","name","sets_target","reps_target","start_weight","rest_seconds","order","notes","per_set_data","group_id"
    }}
    ex = ExerciseEntry(**allowed, user_id=current_user.id)
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex

@app.put("/api/exercises/{exercise_id}", response_model=ExerciseEntryOut)
def update_exercise(exercise_id: int, payload: ExerciseEntryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    ex = db.query(ExerciseEntry).filter(ExerciseEntry.id == exercise_id, ExerciseEntry.user_id == current_user.id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    allowed = {k: v for k, v in payload.dict(exclude_unset=True).items() if k in {
        "template_id","exercise_library_id","name","sets_target","reps_target","start_weight","rest_seconds","order","notes","per_set_data","group_id"
    }}
    for field, value in allowed.items():
        setattr(ex, field, value)
    db.commit()
    db.refresh(ex)
    return ex

@app.delete("/api/exercises/{exercise_id}")
def delete_exercise(exercise_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    ex = db.query(ExerciseEntry).filter(ExerciseEntry.id == exercise_id, ExerciseEntry.user_id == current_user.id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    db.delete(ex)
    db.commit()
    return {"ok": True}

@app.get("/api/exercises", response_model=List[ExerciseEntryOut])
def list_exercises(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    entries = db.query(ExerciseEntry).filter(ExerciseEntry.user_id == current_user.id).all()
    return [
        ExerciseEntryOut(
            id=e.id,
            template_id=e.template_id,
            exercise_library_id=e.exercise_library_id,
            name=_canonical_name_for_exercise(e.name),
            sets_target=e.sets_target,
            reps_target=e.reps_target,
            start_weight=e.start_weight,
            rest_seconds=e.rest_seconds,
            order=e.order,
            notes=e.notes,
            per_set_data=e.per_set_data,
            progression_type=getattr(e, "progression_type", None),
            deload_override=getattr(e, "deload_override", None),
            group_id=e.group_id,
            gif_url=_normalize_gif_url(getattr(getattr(e, "exercise_library", None), "gif_url", None)),
        )
        for e in entries
    ]

@app.get("/api/templates/{template_id}/exercises", response_model=List[ExerciseEntryOut])
def list_template_exercises(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    entries = db.query(ExerciseEntry).filter(ExerciseEntry.template_id == template_id, ExerciseEntry.user_id == current_user.id).order_by(ExerciseEntry.order).all()
    return [
        ExerciseEntryOut(
            id=e.id,
            template_id=e.template_id,
            exercise_library_id=e.exercise_library_id,
            name=_canonical_name_for_exercise(e.name),
            sets_target=e.sets_target,
            reps_target=e.reps_target,
            start_weight=e.start_weight,
            rest_seconds=e.rest_seconds,
            order=e.order,
            notes=e.notes,
            per_set_data=e.per_set_data,
            progression_type=getattr(e, "progression_type", None),
            deload_override=getattr(e, "deload_override", None),
            group_id=e.group_id,
            gif_url=_normalize_gif_url(getattr(getattr(e, "exercise_library", None), "gif_url", None)),
        )
        for e in entries
    ]

# --- Exercise Library ---

@app.get("/api/exercise-library", response_model=List[ExerciseLibraryOut])
def search_exercise_library(q: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    query = db.query(ExerciseLibrary)
    if q:
        query = query.filter(ExerciseLibrary.name.ilike(f"%{q}%"))
    return [
        ExerciseLibraryOut(
            id=e.id,
            name=_canonical_name_for_exercise(e.name),
            muscle_group=e.muscle_group,
            equipment=e.equipment,
            default_rest_seconds=e.default_rest_seconds,
            video_url=e.video_url,
            image_url=e.image_url,
            gif_url=_normalize_gif_url(e.gif_url),
        )
        for e in query.all()
    ]

@app.post("/api/exercise-library/sync")
def sync_exercise_library(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    """Re-seed exercise_library from local ExerciseDB JSON."""
    path = os.path.join(os.path.dirname(__file__), "exercisedb_data.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail="Local exercise dataset not found")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    synced = 0
    for item in data:
        name = item.get("name")
        if not name:
            continue
        existing = db.query(ExerciseLibrary).filter(ExerciseLibrary.name == name).first()
        gifs_dir = os.path.join(os.path.dirname(__file__), "exercisedb_gifs")
        ex_id = item.get("id", "")
        gif_180 = os.path.join(gifs_dir, "180", f"{ex_id}.gif")
        gif_360 = os.path.join(gifs_dir, "360", f"{ex_id}.gif")
        local_gif = gif_180 if os.path.exists(gif_180) else (gif_360 if os.path.exists(gif_360) else None)
        if local_gif:
            gif_url = f"/api/exercisedb/gifs/{ex_id}.gif"
        else:
            gif_url = None

        if existing:
            changed = False
            for field, val in [
                ("muscle_group", item.get("bodyPart")),
                ("equipment", item.get("equipment")),
                ("target", item.get("target")),
                ("secondary_muscles", json.dumps(item.get("secondaryMuscles", [])) if item.get("secondaryMuscles") else None),
                ("instructions", json.dumps(item.get("instructions", [])) if item.get("instructions") else None),
                ("difficulty", item.get("difficulty")),
                ("category", item.get("category")),
                ("similar_exercises", json.dumps(item.get("similarExercises", [])) if item.get("similarExercises") else None),
                ("substitutions", json.dumps(item.get("substitutions", [])) if item.get("substitutions") else None),
                ("progressions", json.dumps(item.get("progressions", [])) if item.get("progressions") else None),
                ("regressions", json.dumps(item.get("regressions", [])) if item.get("regressions") else None),
                ("exercise_db_id", ex_id),
                ("gif_url", gif_url),
            ]:
                if val is not None and getattr(existing, field) != val:
                    setattr(existing, field, val)
                    changed = True
            if changed:
                synced += 1
            continue
        db.add(ExerciseLibrary(
            name=name,
            muscle_group=item.get("bodyPart"),
            equipment=item.get("equipment"),
            target=item.get("target"),
            secondary_muscles=json.dumps(item.get("secondaryMuscles", [])),
            instructions=json.dumps(item.get("instructions", [])),
            difficulty=item.get("difficulty"),
            category=item.get("category"),
            similar_exercises=json.dumps(item.get("similarExercises", [])),
            substitutions=json.dumps(item.get("substitutions", [])),
            progressions=json.dumps(item.get("progressions", [])),
            regressions=json.dumps(item.get("regressions", [])),
            exercise_db_id=ex_id,
            gif_url=gif_url,
            default_rest_seconds=90,
        ))
        synced += 1
    db.commit()
    return {"synced": synced}


@app.get("/api/exercisedb/gifs/{filename}")
def serve_exercisedb_gif(filename: str):
    """Serve ExerciseDB GIFs from local filesystem."""
    gifs_dir = os.path.join(os.path.dirname(__file__), "exercisedb_gifs")
    # Try 180 first, then 360
    for angle in ("180", "360"):
        path = os.path.join(gifs_dir, angle, filename)
        if os.path.exists(path):
            return FileResponse(path, media_type="image/gif")
    raise HTTPException(status_code=404, detail="GIF not found")

# --- Sessions ---

@app.post("/api/sessions", response_model=SessionOut)
def create_session(payload: SessionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    session = WorkoutSession(
        user_id=current_user.id,
        template_id=payload.template_id,
        started_at=datetime.now(timezone.utc),
        pre_workout_mood=payload.pre_workout_mood,
        pre_workout_tags=json.dumps(payload.pre_workout_tags or []),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(json.dumps({
        "type": "session",
        "event": "created",
        "session_id": session.id,
        "template_id": session.template_id,
        "pre_workout_mood": session.pre_workout_mood,
    }))
    return SessionOut(
        id=session.id,
        template_id=session.template_id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        pre_workout_mood=session.pre_workout_mood,
        pre_workout_tags=json.loads(session.pre_workout_tags or "[]"),
        status=session.status.value,
    )

@app.get("/api/sessions", response_model=List[SessionHistoryOut])
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.status != SessionStatus.cancelled)
        .order_by(WorkoutSession.started_at.desc())
        .limit(50)
        .all()
    )
    out = []
    for s in sessions:
        template_name = None
        context_name = None
        if s.template:
            template_name = s.template.name
            if s.template.context:
                context_name = s.template.context.name
        out.append(
            SessionHistoryOut(
                id=s.id,
                template_id=s.template_id,
                started_at=s.started_at,
                ended_at=s.ended_at,
                pre_workout_mood=s.pre_workout_mood,
                pre_workout_tags=json.loads(s.pre_workout_tags or "[]"),
                status=s.status.value,
                template_name=template_name,
                context_name=context_name,
            )
        )
    return out

@app.get("/api/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    s = db.query(WorkoutSession).filter(WorkoutSession.id == session_id, WorkoutSession.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionOut(
        id=s.id,
        template_id=s.template_id,
        started_at=s.started_at,
        ended_at=s.ended_at,
        pre_workout_mood=s.pre_workout_mood,
        pre_workout_tags=json.loads(s.pre_workout_tags or "[]"),
        status=s.status.value,
    )

@app.post("/api/sessions/{session_id}/end", response_model=SessionOut)
def end_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    s = db.query(WorkoutSession).filter(WorkoutSession.id == session_id, WorkoutSession.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    s.ended_at = datetime.now(timezone.utc)
    s.status = SessionStatus.completed
    db.commit()
    db.refresh(s)
    logger.info(json.dumps({
        "type": "session",
        "event": "ended",
        "session_id": s.id,
        "started_at": str(s.started_at),
        "ended_at": str(s.ended_at),
    }))
    return SessionOut(
        id=s.id,
        template_id=s.template_id,
        started_at=s.started_at,
        ended_at=s.ended_at,
        pre_workout_mood=s.pre_workout_mood,
        pre_workout_tags=json.loads(s.pre_workout_tags or "[]"),
        status=s.status.value,
    )

@app.post("/api/sessions/{session_id}/cancel")
def cancel_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    s = db.query(WorkoutSession).filter(WorkoutSession.id == session_id, WorkoutSession.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    s.status = SessionStatus.cancelled
    db.commit()
    logger.info(json.dumps({"type": "session", "event": "cancelled", "session_id": session_id}))
    return {"ok": True}

# --- Set Logs ---

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    s = db.query(WorkoutSession).filter(WorkoutSession.id == session_id, WorkoutSession.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(s)
    db.commit()
    logger.info(json.dumps({"type": "session", "event": "deleted", "session_id": session_id}))
    return {"ok": True}


@app.delete("/api/sessions/{session_id}/set-logs/{log_id}")
def delete_set_log(session_id: int, log_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    log = db.query(SetLog).filter(SetLog.id == log_id, SetLog.session_id == session_id, SetLog.user_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Set log not found")
    db.delete(log)
    db.commit()
    logger.info(json.dumps({"type": "set_log", "event": "deleted", "log_id": log_id, "session_id": session_id}))
    return {"ok": True}


@app.put("/api/sessions/{session_id}/set-logs/{log_id}", response_model=SetLogOut)
def update_set_log(session_id: int, log_id: int, payload: SetLogUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    log = db.query(SetLog).filter(SetLog.id == log_id, SetLog.session_id == session_id, SetLog.user_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Set log not found")
    if payload.actual_weight is not None:
        log.actual_weight = payload.actual_weight
    if payload.actual_weight_left is not None:
        log.actual_weight_left = payload.actual_weight_left
    if payload.actual_weight_right is not None:
        log.actual_weight_right = payload.actual_weight_right
    if payload.actual_reps is not None:
        log.actual_reps = payload.actual_reps
    if payload.effort is not None:
        log.effort = payload.effort
    if payload.rir is not None:
        log.rir = payload.rir
    if payload.rpe is not None:
        log.rpe = payload.rpe
    if payload.form_quality is not None:
        log.form_quality = payload.form_quality
    if payload.notes is not None:
        log.notes = payload.notes
    db.commit()
    db.refresh(log)
    logger.info(json.dumps({"type": "set_log", "event": "updated", "log_id": log_id, "session_id": session_id}))
    return log


@app.post("/api/set-logs", response_model=SetLogOut)
def create_set_log(payload: SetLogCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    data = payload.model_dump()
    data["user_id"] = current_user.id
    log = SetLog(**data)
    db.add(log)
    db.commit()
    db.refresh(log)
    logger.info(json.dumps({
        "type": "set_log",
        "event": "created",
        "session_id": payload.session_id,
        "exercise_entry_id": payload.exercise_entry_id,
        "set_index": payload.set_index,
        "actual_weight": payload.actual_weight,
        "actual_reps": payload.actual_reps,
        "effort": payload.effort,
    }))
    return log

@app.get("/api/sessions/{session_id}/set-logs", response_model=List[SetLogOut])
def list_session_set_logs(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    return db.query(SetLog).filter(SetLog.user_id == current_user.id).filter(SetLog.session_id == session_id, SetLog.user_id == current_user.id).order_by(SetLog.set_index).all()

@app.get("/api/exercises/{exercise_entry_id}/progress", response_model=ExerciseProgressResponse)
def get_exercise_progress(exercise_entry_id: int, limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    entry = db.query(ExerciseEntry).get(exercise_entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Exercise entry not found")
    logs = (
        db.query(SetLog).filter(SetLog.user_id == current_user.id)
        .filter(SetLog.exercise_entry_id == exercise_entry_id, SetLog.actual_weight.is_not(None))
        .order_by(SetLog.completed_at.desc())
        .limit(limit)
        .all()
    )
    points = [
        ExerciseProgressPoint(
            date=log.completed_at.replace(tzinfo=timezone.utc).isoformat() if log.completed_at else None,
            weight=float(log.actual_weight or 0),
            reps=int(log.actual_reps or 0),
        )
        for log in reversed(logs)
    ]
    return ExerciseProgressResponse(exercise_entry_id=exercise_entry_id, name=entry.name, points=points)


@app.get("/api/exercise-names", response_model=List[str])
def list_distinct_exercise_names(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    return [
        row[0]
        for row in db.query(ExerciseEntry.name)
        .join(SetLog, SetLog.exercise_entry_id == ExerciseEntry.id)
        .filter(SetLog.actual_weight.is_not(None))
        .distinct()
        .order_by(ExerciseEntry.name)
        .all()
    ]


@app.get("/api/exercise-names/{name}/progress", response_model=ExerciseNameProgressResponse)
def get_exercise_name_progress(name: str, limit: int = 5000, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    entries = db.query(ExerciseEntry).filter(ExerciseEntry.name == name).all()
    entry_ids = [e.id for e in entries]
    if not entry_ids:
        raise HTTPException(status_code=404, detail="Exercise not found")
    logs = (
        db.query(SetLog).filter(SetLog.user_id == current_user.id)
        .filter(SetLog.exercise_entry_id.in_(entry_ids), SetLog.actual_weight.is_not(None))
        .order_by(SetLog.completed_at.desc())
        .limit(limit)
        .all()
    )
    points = []
    date_map: dict[str, dict[str, Any]] = {}
    for log in reversed(logs):
        date_key = log.completed_at.astimezone(timezone.utc).date().isoformat() if log.completed_at else None
        if not date_key:
            continue
        weight = float(log.actual_weight or 0)
        if date_key not in date_map or weight > date_map[date_key]["weight"]:
            date_map[date_key] = {
                "date": date_key,
                "weight": weight,
                "reps": int(log.actual_reps or 0),
            }
    points = [ExerciseProgressPoint(**v) for v in date_map.values()]
    seeded = len(logs) > 0 and all(bool(log.is_seeded) for log in logs)
    return ExerciseNameProgressResponse(name=name, points=points, seeded=seeded)


@app.get("/api/exercise-names/{name}/last-session")
def get_exercise_name_last_session(name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    entries = db.query(ExerciseEntry).filter(ExerciseEntry.name == name).all()
    entry_ids = [e.id for e in entries]
    if not entry_ids:
        raise HTTPException(status_code=404, detail="Exercise not found")
    sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_not(None))
        .order_by(WorkoutSession.started_at.desc())
        .all()
    )
    for session in sessions:
        logs = (
            db.query(SetLog)
            .filter(SetLog.session_id == session.id, SetLog.exercise_entry_id.in_(entry_ids))
            .order_by(SetLog.set_index.asc())
            .all()
        )
        if logs:
            return {
                "session_id": session.id,
                "started_at": session.started_at.replace(tzinfo=timezone.utc).isoformat(),
                "logs": [
                    {
                        "set_index": log.set_index,
                        "actual_weight": float(log.actual_weight or 0),
                        "actual_reps": int(log.actual_reps or 0),
                    }
                    for log in logs
                ],
            }
    return {"session_id": None, "logs": []}


@app.get("/api/stats/total-volume")
def get_total_volume(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    total = (
        db.query(func.sum(SetLog.actual_weight * SetLog.actual_reps))
        .filter(SetLog.user_id == current_user.id, SetLog.actual_weight.is_not(None), SetLog.actual_reps.is_not(None))
        .scalar()
    )
    return {"total_volume": float(total or 0)}


@app.get("/api/stats/streak")
def get_streak(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    sessions = (
        db.query(WorkoutSession.started_at)
        .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_not(None))
        .order_by(WorkoutSession.started_at.desc())
        .all()
    )
    if not sessions:
        return {"streak": 0}
    from datetime import datetime, timedelta
    dates = sorted(
        {datetime.strptime(str(s.started_at)[:10], "%Y-%m-%d").date() for s in sessions},
        reverse=True,
    )
    today = datetime.now(timezone.utc).date()
    if dates[0] < today - timedelta(days=1):
        return {"streak": 0}
    streak = 1
    for i in range(1, len(dates)):
        if dates[i - 1] - dates[i] == timedelta(days=1):
            streak += 1
        else:
            break
    return {"streak": streak}


# --- Coach Messages ---

@app.post("/api/coach-messages", response_model=CoachMessageOut)
def create_coach_message(payload: CoachMessageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    data = payload.model_dump()
    data["user_id"] = current_user.id
    msg = CoachMessage(**data)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    logger.info(json.dumps({
        "type": "coach_message",
        "event": "created",
        "session_id": payload.session_id,
        "role": payload.role,
        "content": payload.content[:200],
    }))
    return CoachMessageOut(
        id=msg.id,
        session_id=msg.session_id,
        role=msg.role.value,
        content=msg.content,
        timestamp=msg.timestamp,
    )

@app.get("/api/sessions/{session_id}/coach-messages", response_model=List[CoachMessageOut])
def list_coach_messages(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    msgs = db.query(CoachMessage).filter(CoachMessage.session_id == session_id, CoachMessage.user_id == current_user.id).order_by(CoachMessage.timestamp).all()
    return [
        CoachMessageOut(
            id=m.id,
            session_id=m.session_id,
            role=m.role.value,
            content=m.content,
            timestamp=m.timestamp,
        )
        for m in msgs
    ]

# --- AI Coach (stub for local/cloud later) ---

class RuleRequestSetIn(BaseModel):
    actual_weight: float
    actual_reps: int
    effort: Optional[int] = None
    rpe: Optional[float] = None
    rir: Optional[int] = None
    is_seeded: bool = False
    completed_at: Optional[datetime] = None


class RuleRequestIn(BaseModel):
    start_weight: float = 0.0
    reps_target: int = 10
    sets_target: int = 3
    rest_seconds: int = 90
    progression_type: ProgressionType = ProgressionType.linear
    history: List[RuleRequestSetIn] = []
    linear_increment: float = 5.0
    double_increment: float = 5.0
    double_success_threshold: int = 2
    estimated_1rm: Optional[float] = None
    percentage_of_1rm: float = 0.8
    pct_increment_success: float = 2.5
    pct_decrement_fail: float = 5.0
    week: int = 1
    periodization_cycle_weeks: int = 4
    force_deload: bool = False
    deload_volume_factor: float = 0.6
    deload_intensity_factor: float = 0.7
    hard_effort_threshold: int = 4
    easy_effort_threshold: int = 2
    ai_progression_sensitivity: Optional[float] = None
    ai_volume_tolerance: Optional[float] = None
    ai_recovery_multiplier: Optional[float] = None
    ai_preferred_rir: Optional[int] = None
    ai_stress_fatigue_adjustment: Optional[float] = None
    ai_calibrated_1rm: Optional[float] = None

    # Coach tracking ---
    current_phase: Optional[str] = None
    current_week_in_block: Optional[int] = None
    custom_phase_order: Optional[List[str]] = None
    deload_mode: str = "ai_driven"
    exercise_entry_id: Optional[int] = None


class CoachStateResponse(BaseModel):
    phase: str
    progression_type: str
    week_in_block: int
    block_duration_weeks: int
    transition_in_weeks: int
    is_deload: bool
    explanation: str
    next_deload_date: Optional[str] = None
    load_pct: int = 0
    deload_mode: str = "ai_driven"


class RuleResponseOut(BaseModel):
    next_weight: float
    next_reps: int
    next_sets: int
    rest_seconds: int
    coaching_message: str
    workload_status: str
    prescription_type: str
    is_deload: bool = False
    coach: CoachStateResponse
    linear_increment: float = 5.0

    class Config:
        from_attributes = True


@app.post("/api/rules/next-prescription", response_model=RuleResponseOut)
def next_prescription(payload: RuleRequestIn, current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    history = [SetRecord(**s.model_dump()) for s in payload.history]
    rule = RuleInput(
        start_weight=payload.start_weight,
        reps_target=payload.reps_target,
        sets_target=payload.sets_target,
        rest_seconds=payload.rest_seconds,
        progression_type=payload.progression_type,
        history=history,
        linear_increment=payload.linear_increment,
        double_increment=payload.double_increment,
        double_success_threshold=payload.double_success_threshold,
        estimated_1rm=payload.estimated_1rm,
        percentage_of_1rm=payload.percentage_of_1rm,
        pct_increment_success=payload.pct_increment_success,
        pct_decrement_fail=payload.pct_decrement_fail,
        week=payload.week,
        periodization_cycle_weeks=payload.periodization_cycle_weeks,
        force_deload=payload.force_deload,
        deload_volume_factor=payload.deload_volume_factor,
        deload_intensity_factor=payload.deload_intensity_factor,
        hard_effort_threshold=payload.hard_effort_threshold,
        easy_effort_threshold=payload.easy_effort_threshold,
        ai_progression_sensitivity=payload.ai_progression_sensitivity,
        ai_volume_tolerance=payload.ai_volume_tolerance,
        ai_recovery_multiplier=payload.ai_recovery_multiplier,
        ai_preferred_rir=payload.ai_preferred_rir,
        ai_stress_fatigue_adjustment=payload.ai_stress_fatigue_adjustment,
        ai_calibrated_1rm=payload.ai_calibrated_1rm,
    )
    # Read previous phase before computing new state so we can reset load on deload exit
    prev_phase_setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == "coach_phase", AppSetting.user_id == current_user.id)
        .first()
    )
    previous_phase = None
    if prev_phase_setting is not None and prev_phase_setting.value is not None:
        previous_phase = str(prev_phase_setting.value)

    coach_state = compute_coach_state(
        history=history,
        current_phase=payload.current_phase,
        current_week_in_block=payload.current_week_in_block,
        force_deload=payload.force_deload,
        periodization_cycle_weeks=payload.periodization_cycle_weeks,
        default_progression=payload.progression_type.value,
        custom_phase_order=payload.custom_phase_order,
        previous_phase=previous_phase,
        deload_mode=payload.deload_mode,
    )
    result = compute_prescription(rule)

    # Persist load_pct so the home screen can read it
    load_val = str(coach_state.load_pct)
    load_setting = db.query(AppSetting).filter(
        AppSetting.key == "coach_load_pct", AppSetting.user_id == current_user.id
    ).first()
    if load_setting:
        load_setting.value = load_val  # type: ignore[assignment]
    else:
        db.add(AppSetting(key="coach_load_pct", value=load_val, user_id=current_user.id))

    if payload.exercise_entry_id is not None:
        state = db.query(AlgorithmState).filter(
            AlgorithmState.user_id == current_user.id,
            AlgorithmState.exercise_entry_id == payload.exercise_entry_id,
        ).first()
        previous_phase = state.progression_type if state else None
        if not state:
            state = AlgorithmState(user_id=current_user.id, exercise_entry_id=payload.exercise_entry_id)
            db.add(state)
        state.last_suggested_weight = result.next_weight
        state.last_suggested_reps = result.next_reps
        if history:
            state.last_effort_avg = round(sum(s.effort or 3 for s in history[-10:]) / min(len(history), 10), 2)
        state.progression_type = coach_state.phase
        db.commit()

        if previous_phase and previous_phase != coach_state.phase:
            transition = ProgressionTransition(
                user_id=current_user.id,
                exercise_entry_id=payload.exercise_entry_id,
                from_phase=previous_phase,
                to_phase=coach_state.phase,
                week_in_block=coach_state.week_in_block,
                reason="best_fit",
            )
            db.add(transition)
            db.commit()

    logger.info(json.dumps({
        "type": "rule",
        "event": "next_prescription",
        "user_id": current_user.id,
        "exercise_entry_id": payload.exercise_entry_id,
        "prescription_type": result.prescription_type,
        "next_weight": result.next_weight,
        "next_reps": result.next_reps,
        "is_deload": result.is_deload,
        "coach_phase": coach_state.phase,
    }))
    return RuleResponseOut(
        next_weight=result.next_weight,
        next_reps=result.next_reps,
        next_sets=result.next_sets,
        rest_seconds=result.rest_seconds,
        coaching_message=result.coaching_message,
        workload_status=result.workload_status.value,
        prescription_type=result.prescription_type,
        is_deload=result.is_deload,
        linear_increment=rule.linear_increment,
        coach=CoachStateResponse(**dataclasses.asdict(coach_state)),
    )


class AlgorithmStateOut(ApiBaseModel):
    exercise_entry_id: int
    current_week: int
    last_suggested_weight: Optional[float]
    last_suggested_reps: Optional[int]
    last_effort_avg: Optional[float]
    progression_type: str
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class ProgressionTransitionOut(ApiBaseModel):
    id: int
    exercise_entry_id: int
    from_phase: str
    to_phase: str
    week_in_block: int
    reason: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


@app.get("/api/rules/algorithm-state/{exercise_entry_id}", response_model=AlgorithmStateOut)
def get_algorithm_state(exercise_entry_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    state = db.query(AlgorithmState).filter(
        AlgorithmState.user_id == current_user.id,
        AlgorithmState.exercise_entry_id == exercise_entry_id,
    ).first()
    if not state:
        raise HTTPException(status_code=404, detail="algorithm_state_not_found")
    return state


@app.get("/api/rules/transitions", response_model=List[ProgressionTransitionOut])
def list_progression_transitions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    transitions = db.query(ProgressionTransition).filter(
        ProgressionTransition.user_id == current_user.id,
    ).order_by(ProgressionTransition.created_at.desc()).limit(200).all()
    return transitions


@app.get("/api/progression/transitions", response_model=List[ProgressionTransitionOut])
def progression_transitions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    transitions = db.query(ProgressionTransition).filter(
        ProgressionTransition.user_id == current_user.id,
    ).order_by(ProgressionTransition.created_at.desc()).limit(200).all()
    return transitions


class CoachOverrideRequest(BaseModel):
    phase: str = "linear"
    week_in_block: int = 1
    force_deload: bool = False
    periodization_cycle_weeks: int = 4
    custom_phase_order: Optional[List[str]] = None
    deload_mode: str = "ai_driven"


@app.post("/api/coach/override")
def coach_override(payload: CoachOverrideRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    keys = {
        "coach_phase": payload.phase,
        "coach_week_in_block": str(payload.week_in_block),
        "coach_force_deload": str(payload.force_deload).lower(),
        "coach_periodization_cycle_weeks": str(payload.periodization_cycle_weeks),
        "coach_deload_mode": payload.deload_mode,
    }
    if payload.custom_phase_order is not None:
        keys["coach_custom_phase_order"] = json.dumps(payload.custom_phase_order)
    results = []
    for key, value in keys.items():
        s = db.query(AppSetting).filter(AppSetting.key == key, AppSetting.user_id == current_user.id).first()
        if s:
            s.value = value
        else:
            s = AppSetting(key=key, value=value, user_id=current_user.id)
            db.add(s)
        results.append(SettingOut(key=s.key, value=s.value))
    db.commit()
    logger.info(json.dumps({
        "type": "coach",
        "event": "override",
        "user_id": current_user.id,
        "phase": payload.phase,
        "week_in_block": payload.week_in_block,
        "force_deload": payload.force_deload,
        "custom_phase_order": payload.custom_phase_order,
    }))
    return {"saved": results}


class CoachStateResponseOut(BaseModel):
    coach_phase: Optional[str] = None
    coach_week_in_block: Optional[int] = None
    coach_force_deload: Optional[bool] = None
    coach_periodization_cycle_weeks: Optional[int] = None
    coach_custom_phase_order: Optional[List[str]] = None
    coach_deload_mode: Optional[str] = None
    coach_load_pct: Optional[int] = None


@app.get("/api/coach/state", response_model=CoachStateResponseOut)
def get_coach_state(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    keys = ["coach_phase", "coach_week_in_block", "coach_force_deload", "coach_periodization_cycle_weeks", "coach_custom_phase_order", "coach_deload_mode", "coach_load_pct"]
    out: dict[str, str] = {}
    for s in db.query(AppSetting).filter(AppSetting.key.in_(keys), AppSetting.user_id == current_user.id).all():
        out[s.key] = s.value

    # Derive actual elapsed weeks from completed session dates rather than a stored counter.
    # This prevents the UI from showing an artificially advanced week after testing.
    computed_week: Optional[int] = None
    sessions = (
        db.query(WorkoutSession.started_at)
        .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_not(None))
        .order_by(WorkoutSession.started_at.asc())
        .all()
    )
    if sessions:
        oldest = sessions[0].started_at
        if oldest.tzinfo is None:
            oldest = oldest.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        elapsed_days = max(0, (now - oldest).days)
        computed_week = elapsed_days // 7 + 1

    # Compute load from recent set history
    load_pct = 0
    try:
        from rules import compute_load, SetRecord
        raw_sets = (
            db.query(SetLog.actual_weight, SetLog.actual_reps, SetLog.effort, SetLog.rir, SetLog.completed_at)
            .filter(SetLog.user_id == current_user.id, SetLog.is_seeded == False)
            .all()
        )
        history = [
            SetRecord(
                actual_weight=s.actual_weight or 0,
                actual_reps=s.actual_reps or 0,
                effort=s.effort,
                rir=s.rir,
                completed_at=s.completed_at,
                is_seeded=False,
            )
            for s in raw_sets
        ]
        load_pct = compute_load(history)
    except Exception:
        pass

    return CoachStateResponseOut(
        coach_phase=out.get("coach_phase"),
        coach_week_in_block=computed_week if computed_week is not None else (int(out["coach_week_in_block"]) if out.get("coach_week_in_block") else None),
        coach_force_deload=out.get("coach_force_deload") == "true" if out.get("coach_force_deload") else None,
        coach_periodization_cycle_weeks=int(out["coach_periodization_cycle_weeks"]) if out.get("coach_periodization_cycle_weeks") else None,
        coach_custom_phase_order=json.loads(out["coach_custom_phase_order"]) if out.get("coach_custom_phase_order") else None,
        coach_deload_mode=out.get("coach_deload_mode"),
        coach_load_pct=load_pct,
    )


class CoachChatRequest(BaseModel):
    question: str
    template_id: Optional[int] = None
    session_id: Optional[int] = None
    conversation_id: Optional[int] = None


class CoachChatResponse(BaseModel):
    message: str
    source: str = "fallback"
    referenced_sessions: list[dict] = []
    conversation_id: Optional[int] = None
    workout_draft: Optional[dict] = None


class CoachHealthResponse(BaseModel):
    llm_available: bool
    model: Optional[str] = None
    status: str


@app.get("/api/coach/health", response_model=CoachHealthResponse)
def coach_health(current_user: User = Depends(get_current_user_dep)):
    api_key = os.getenv("NOUS_API_KEY")
    logger.info("[coach_health] NOUS_API_KEY present=%s prefix=%s", bool(api_key), (api_key or "")[:12])
    if not api_key:
        return CoachHealthResponse(llm_available=False, status="offline")
    try:
        resp = httpx.get(
            "https://inference-api.nousresearch.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5,
        )
        logger.info("[coach_health] Nous status=%s body=%s", resp.status_code, resp.text[:200])
        if resp.status_code == 200:
            return CoachHealthResponse(llm_available=True, model="NousResearch/Hermes-4-70B", status="connected")
        elif resp.status_code == 429:
            return CoachHealthResponse(llm_available=True, model="NousResearch/Hermes-4-70B", status="degraded")
        return CoachHealthResponse(llm_available=False, status="offline")
    except Exception as e:
        logger.error("[coach_health] Nous error: %s", e)
        return CoachHealthResponse(llm_available=False, status="offline")


# --- AI Coach Conversations ---

class AiCoachMessageCreate(BaseModel):
    role: CoachRole
    content: str
    message_type: Optional[str] = "text"
    extra_data: Optional[dict] = None


class AiCoachConversationOut(BaseModel):
    id: int
    title: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AiCoachMessageOut(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    timestamp: datetime
    message_type: str = "text"
    extra_data: Optional[dict] = None

    class Config:
        from_attributes = True


@app.get("/api/ai-coach/conversations", response_model=List[AiCoachConversationOut])
def list_ai_coach_conversations(current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    return sorted(
        db.query(AiCoachConversation).filter(AiCoachConversation.user_id == current_user.id).all(),
        key=lambda c: c.updated_at or c.created_at,
        reverse=True,
    )


@app.post("/api/ai-coach/conversations", response_model=AiCoachConversationOut)
def create_ai_coach_conversation(current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    conv = AiCoachConversation(user_id=current_user.id)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return AiCoachConversationOut(id=conv.id, title=conv.title, created_at=conv.created_at, updated_at=conv.updated_at)


@app.get("/api/ai-coach/conversations/{conversation_id}/messages", response_model=List[AiCoachMessageOut])
def list_ai_coach_messages(conversation_id: int, current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    conv = db.query(AiCoachConversation).filter(
        AiCoachConversation.id == conversation_id,
        AiCoachConversation.user_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return [
        AiCoachMessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            role=m.role.value,
            content=m.content,
            timestamp=m.timestamp,
            message_type=m.message_type,
            extra_data=m.extra_data,
        )
        for m in sorted(conv.messages, key=lambda x: x.timestamp)
    ]


@app.post("/api/ai-coach/conversations/{conversation_id}/messages", response_model=AiCoachMessageOut)
def create_ai_coach_message(conversation_id: int, payload: AiCoachMessageCreate, current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    conv = db.query(AiCoachConversation).filter(
        AiCoachConversation.id == conversation_id,
        AiCoachConversation.user_id == current_user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msg = AiCoachMessage(
        conversation_id=conversation_id,
        role=payload.role,
        content=payload.content,
        message_type=payload.message_type or "text",
        extra_data=payload.extra_data,
    )
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    return AiCoachMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        role=msg.role.value,
        content=msg.content,
        timestamp=msg.timestamp,
        message_type=msg.message_type,
        extra_data=msg.extra_data,
    )


def _validate_and_apply_changes(
    current_prescription: list[dict] | None,
    changes: list[dict],
    exercise_library: dict[str, dict],
) -> tuple[list[dict] | None, str | None]:
    if not current_prescription:
        return None, "No current prescription found. Start a workout or ask about your current plan first."
    if not changes:
        return None, "No changes specified."

    presc_by_name = {p["exercise"]: p for p in current_prescription}
    modified = [dict(p) for p in current_prescription]
    applied: list[str] = []

    for c in changes:
        ex_name = c.get("exercise")
        field = c.get("field")
        new_value = c.get("new_value")

        if not ex_name or not field:
            return None, f"Invalid change format: {c}"

        if ex_name not in presc_by_name:
            return None, f"Exercise '{ex_name}' is not in your current prescription."

        target = next((p for p in modified if p["exercise"] == ex_name), None)
        if not target:
            return None, f"Exercise '{ex_name}' not found in current prescription."

        if field == "swap_exercise":
            new_ex = str(new_value)
            lib_entry = exercise_library.get(new_ex)
            if not lib_entry:
                return None, f"Exercise '{new_ex}' is not in the exercise library."
            old_name = target["exercise"]
            target["exercise"] = new_ex
            target["swap_note"] = f"Swapped from {old_name}"
            applied.append(f"Swapped {old_name} → {new_ex}")
        elif field == "next_weight":
            try:
                w = float(new_value)
                if w <= 0:
                    return None, f"Weight must be positive for {ex_name}."
                target["next_weight"] = w
                applied.append(f"{ex_name} weight → {w}")
            except (TypeError, ValueError):
                return None, f"Invalid weight value for {ex_name}: {new_value}"
        elif field == "next_reps":
            try:
                r = int(new_value)
                if r < 1 or r > 20:
                    return None, f"Reps must be between 1 and 20 for {ex_name}."
                target["next_reps"] = r
                applied.append(f"{ex_name} reps → {r}")
            except (TypeError, ValueError):
                return None, f"Invalid reps value for {ex_name}: {new_value}"
        elif field == "sets_target":
            try:
                s = int(new_value)
                if s < 1 or s > 10:
                    return None, f"Sets must be between 1 and 10 for {ex_name}."
                target["sets_target"] = s
                applied.append(f"{ex_name} sets → {s}")
            except (TypeError, ValueError):
                return None, f"Invalid sets value for {ex_name}: {new_value}"
        else:
            return None, f"Unsupported change field: {field}"

    return modified, None


@app.post("/api/coach/chat", response_model=CoachChatResponse)
def coach_chat(payload: CoachChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    """Answer a user question about their training using recent session history and current prescription."""
    api_key = os.getenv("NOUS_API_KEY")
    if not api_key:
        return CoachChatResponse(message="Coach is not configured. Add NOUS_API_KEY to backend .env.", source="offline")

    # Conversation history
    conversation = None
    chat_history: list[dict] = []
    if payload.conversation_id:
        conversation = db.query(AiCoachConversation).filter(
            AiCoachConversation.id == payload.conversation_id,
            AiCoachConversation.user_id == current_user.id,
        ).first()
        if conversation:
            past = db.query(AiCoachMessage).filter(
                AiCoachMessage.conversation_id == conversation.id,
            ).order_by(AiCoachMessage.timestamp.asc()).limit(20).all()
            for m in past:
                chat_history.append({"role": "user" if m.role.value == "pre_workout" else "assistant", "content": m.content})

    # Gather context: last 20 completed sessions for this template (or any template if not specified)
    sessions_q = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_not(None), WorkoutSession.status == "completed")
    )
    if payload.template_id:
        sessions_q = sessions_q.filter(WorkoutSession.template_id == payload.template_id)
    recent_sessions = sessions_q.order_by(WorkoutSession.started_at.desc()).limit(20).all()

    session_summaries = []
    ex_names: set[str] = set()
    for s in recent_sessions:
        logs = (
            db.query(SetLog, ExerciseEntry.name)
            .join(ExerciseEntry, SetLog.exercise_entry_id == ExerciseEntry.id)
            .filter(SetLog.session_id == s.id)
            .order_by(SetLog.exercise_entry_id, SetLog.set_index)
            .all()
        )
        by_ex: dict[str, list] = {}
        for log, ex_name in logs:
            by_ex.setdefault(ex_name, []).append(log)
            ex_names.add(ex_name)
        exercises = []
        for ex_name, sets in by_ex.items():
            top = max(sets, key=lambda x: x.actual_weight or 0)
            exercises.append({
                "name": ex_name,
                "sets": len(sets),
                "top_weight": top.actual_weight,
                "top_reps": top.actual_reps,
                "avg_effort": round(sum((l.effort or 3) for l in sets) / len(sets), 1),
                "avg_rir": round(sum((l.rir or 0) for l in sets) / len(sets), 1) if any(l.rir is not None for l in sets) else None,
                "volume": round(sum((l.actual_weight or 0) * (l.actual_reps or 0) for l in sets)),
            })
        duration_seconds = (s.ended_at - s.started_at).total_seconds() if s.ended_at and s.started_at else 0
        duration_min = round(duration_seconds / 60) if duration_seconds > 0 else 0
        if duration_min > 360:
            duration_min = 360
        session_summaries.append({
            "id": s.id,
            "date": s.started_at.isoformat() if s.started_at else None,
            "template_name": s.template.name if s.template else None,
            "context_name": s.template.context.name if s.template and s.template.context else None,
            "duration_min": duration_min,
            "exercises": exercises,
        })

    # Exercise library lookup for exercises in recent sessions
    exercise_library: dict[str, dict[str, Any]] = {}
    if ex_names:
        lib_entries = (
            db.query(ExerciseLibrary)
            .filter(ExerciseLibrary.name.in_(list(ex_names)))
            .all()
        )
        for entry in lib_entries:
            exercise_library[entry.name] = {
                "muscle_group": entry.muscle_group,
                "equipment": entry.equipment,
                "difficulty": entry.difficulty,
                "category": entry.category,
                "target": entry.target,
                "secondary_muscles": entry.secondary_muscles,
                "instructions": entry.instructions,
            }

    # User fitness profile
    fitness_profile: dict[str, Any] = {}
    try:
        raw = current_user.fitness_profile
        if isinstance(raw, dict):
            fitness_profile = raw
        elif isinstance(raw, str) and raw.strip():
            fitness_profile = json.loads(raw)
    except Exception:
        fitness_profile = {}

    # User identity
    user_name = None
    if current_user.first_name:
        user_name = current_user.first_name.split()[0]

    # Computed insights
    insights: dict[str, Any] = {}
    try:
        # Days since last session
        last_session = (
            db.query(WorkoutSession.started_at)
            .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_not(None))
            .order_by(WorkoutSession.started_at.desc())
            .first()
        )
        if last_session and last_session.started_at:
            now = datetime.now(timezone.utc)
            last_dt = last_session.started_at
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            insights["days_since_last_session"] = max(0, (now - last_dt).days)

        # Current streak (consecutive days with sessions in last 30 days)
        from datetime import timedelta
        thirty_days_ago = now - timedelta(days=30)
        recent_dates = sorted([
            s.started_at.date()
            for s in db.query(WorkoutSession.started_at)
            .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_not(None), WorkoutSession.started_at >= thirty_days_ago)
            .all()
            if s.started_at
        ])
        streak = 0
        if recent_dates:
            streak = 1
            for i in range(1, len(recent_dates)):
                if (recent_dates[i] - recent_dates[i-1]).days == 1:
                    streak += 1
                else:
                    streak = 1
        insights["current_streak"] = streak

        # Volume trend: last 4 sessions avg vs previous 4 sessions avg
        if len(session_summaries) >= 4:
            recent_vols = [sum(e.get("volume", 0) for e in s["exercises"]) for s in session_summaries[:4]]
            older_vols = [sum(e.get("volume", 0) for e in s["exercises"]) for s in session_summaries[4:8]] if len(session_summaries) >= 8 else []
            recent_avg = sum(recent_vols) / len(recent_vols) if recent_vols else 0
            older_avg = sum(older_vols) / len(older_vols) if older_vols else 0
            if older_avg > 0:
                insights["volume_trend_pct"] = round((recent_avg - older_avg) / older_avg * 100, 1)
            else:
                insights["volume_trend_pct"] = 0

        # Most trained muscle groups
        muscle_counts: dict[str, int] = {}
        for s in session_summaries:
            for ex in s["exercises"]:
                mg = exercise_library.get(ex["name"], {}).get("muscle_group")
                if mg:
                    muscle_counts[mg] = muscle_counts.get(mg, 0) + 1
        if muscle_counts:
            top_muscles = sorted(muscle_counts.items(), key=lambda x: x[1], reverse=True)[:3]
            insights["top_muscle_groups"] = [m[0] for m in top_muscles]
    except Exception:
        pass

    # Current coach state from persisted settings + computed load
    coach_state_data: dict[str, Any] = {}
    try:
        state_keys = [
            "coach_phase", "coach_week_in_block", "coach_force_deload",
            "coach_periodization_cycle_weeks", "coach_custom_phase_order",
            "coach_deload_mode", "coach_load_pct",
        ]
        out: dict[str, str] = {}
        for s in db.query(AppSetting).filter(AppSetting.key.in_(state_keys), AppSetting.user_id == current_user.id).all():
            out[s.key] = s.value

        from rules import compute_load, SetRecord
        raw_sets = (
            db.query(SetLog.actual_weight, SetLog.actual_reps, SetLog.effort, SetLog.rir, SetLog.completed_at)
            .filter(SetLog.user_id == current_user.id, SetLog.is_seeded == False)
            .all()
        )
        history = [
            SetRecord(
                actual_weight=s.actual_weight or 0,
                actual_reps=s.actual_reps or 0,
                effort=s.effort,
                rir=s.rir,
                completed_at=s.completed_at,
                is_seeded=False,
            )
            for s in raw_sets
        ]
        load_pct = compute_load(history)

        sessions = (
            db.query(WorkoutSession.started_at)
            .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_not(None))
            .order_by(WorkoutSession.started_at.asc())
            .all()
        )
        computed_week = None
        if sessions:
            oldest = sessions[0].started_at
            if oldest.tzinfo is None:
                oldest = oldest.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            elapsed_days = max(0, (now - oldest).days)
            computed_week = elapsed_days // 7 + 1

        coach_state_data = {
            "phase": out.get("coach_phase"),
            "week_in_block": computed_week if computed_week is not None else (int(out["coach_week_in_block"]) if out.get("coach_week_in_block") else None),
            "force_deload": out.get("coach_force_deload") == "true" if out.get("coach_force_deload") else None,
            "periodization_cycle_weeks": int(out["coach_periodization_cycle_weeks"]) if out.get("coach_periodization_cycle_weeks") else None,
            "custom_phase_order": json.loads(out["coach_custom_phase_order"]) if out.get("coach_custom_phase_order") else None,
            "deload_mode": out.get("coach_deload_mode"),
            "load_pct": load_pct,
        }
    except Exception:
        pass

    # Try to get current prescription if session_id provided
    prescription = None
    if payload.session_id:
        try:
            from rules import compute_prescription, RuleInput, SetRecord
            session = db.query(WorkoutSession).filter(WorkoutSession.id == payload.session_id).first()
            if session and session.template_id:
                exercises = db.query(ExerciseEntry).filter(ExerciseEntry.template_id == session.template_id).all()
                raw_sets = (
                    db.query(SetLog)
                    .filter(SetLog.session_id == payload.session_id)
                    .order_by(SetLog.exercise_entry_id, SetLog.set_index)
                    .all()
                )
                history = [
                    SetRecord(
                        actual_weight=l.actual_weight or 0,
                        actual_reps=l.actual_reps or 0,
                        effort=l.effort,
                        rir=l.rir,
                        completed_at=l.completed_at,
                        is_seeded=False,
                    )
                    for l in raw_sets
                ]
                coach_state = compute_coach_state(history)
                ex_history = {eid: [r for r in history] for eid in [e.id for e in exercises]}
                prescriptions = []
                for ex in exercises:
                    if not ex_history.get(ex.id):
                        continue
                    pt = ProgressionType(coach_state.phase) if coach_state.phase in [p.value for p in ProgressionType] else ProgressionType.linear
                    rule = compute_prescription(RuleInput(
                        start_weight=ex.start_weight or 0,
                        reps_target=ex.reps_target or 8,
                        sets_target=ex.sets_target or 3,
                        rest_seconds=ex.rest_seconds or 90,
                        progression_type=pt,
                        history=ex_history.get(ex.id, []),
                        linear_increment=5.0,
                        double_increment=5.0,
                        double_success_threshold=2,
                        estimated_1rm=None,
                        percentage_of_1rm=0.0,
                        pct_increment_success=0.0,
                        pct_decrement_fail=0.0,
                    ))
                    prescriptions.append({
                        "exercise": ex.name,
                        "next_weight": rule.next_weight,
                        "next_reps": rule.next_reps,
                        "message": rule.coaching_message,
                    })
                if prescriptions:
                    prescription = prescriptions
        except Exception:
            prescription = None

    # Convert weights in LLM context to user's preferred unit
    units_preference = "imperial"
    try:
        raw_profile = current_user.fitness_profile
        if isinstance(raw_profile, dict):
            units_preference = str(raw_profile.get("units_preference", "imperial")).lower()
        elif isinstance(raw_profile, str) and raw_profile.strip():
            units_preference = str(json.loads(raw_profile).get("units_preference", "imperial")).lower()
    except Exception:
        units_preference = "imperial"
    if units_preference not in {"imperial", "metric"}:
        units_preference = "imperial"

    def _to_display_weight(kg_value: float | None) -> float | None:
        if kg_value is None:
            return None
        if units_preference == "imperial":
            return round(kg_value / 0.45359237, 1)
        return round(kg_value, 1)

    def _convert_session_summary(summary: dict) -> dict:
        out = dict(summary)
        converted_exercises = []
        for ex in out.get("exercises", []):
            converted = dict(ex)
            tw = ex.get("top_weight")
            converted["top_weight"] = _to_display_weight(tw)
            vol = ex.get("volume")
            if vol is not None and tw is not None:
                converted["volume"] = round(vol / 0.45359237) if units_preference == "imperial" else round(vol)
            converted_exercises.append(converted)
        out["exercises"] = converted_exercises
        return out

    def _convert_prescription(presc: dict | list | None) -> dict | list | None:
        if not presc:
            return presc
        if isinstance(presc, list):
            return [_convert_prescription(p) for p in presc]
        return {
            **presc,
            "next_weight": _to_display_weight(presc.get("next_weight")),
        }

    llm_session_summaries = [_convert_session_summary(s) for s in session_summaries]
    llm_prescription = _convert_prescription(prescription)
    unit_label = "lbs" if units_preference == "imperial" else "kg"

    # Build user identity block
    identity_block = ""
    if user_name:
        identity_block = f"The user's name is {user_name}. Address them by name naturally in your response."

    # Build insights block
    insights_lines = []
    if insights.get("days_since_last_session") is not None:
        insights_lines.append(f"- Days since last session: {insights['days_since_last_session']}")
    if insights.get("current_streak"):
        insights_lines.append(f"- Current workout streak: {insights['current_streak']} sessions")
    if insights.get("volume_trend_pct") is not None:
        direction = "up" if insights["volume_trend_pct"] > 0 else "down" if insights["volume_trend_pct"] < 0 else "flat"
        insights_lines.append(f"- Volume trend: {direction} {abs(insights['volume_trend_pct'])}% vs previous period")
    if insights.get("top_muscle_groups"):
        insights_lines.append(f"- Most trained muscle groups: {', '.join(insights['top_muscle_groups'])}")
    insights_block = "\n".join(insights_lines) if insights_lines else "No computed insights available yet."

    system_prompt = f"""You are Askeo Coach — a knowledgeable, motivating training coach.
{identity_block}

You ONLY answer questions about fitness, strength training, workout programming, recovery, nutrition as it relates to training, exercise form, and the user's training history.
If the user asks about anything outside fitness (politics, general knowledge, personal advice unrelated to training, jokes, stories, etc.), politely decline and redirect them to a fitness-related topic.

Use the provided JSON context ONLY. Do not invent data. If context is missing, say so.

DOMAIN INTENT:
Askeo is a strength and conditioning app focused on deterministic progression tracking, workout generation constrained by real equipment/limitations, and an AI coach that operates within those same constraints.
- Engage deeply with: workout programming, exercise selection, sets/reps/weight, progression logic, load management, recovery, deload, injury-aware substitutions, equipment-aware swaps, training history/trends, form cues, and profile fields that affect workout generation (goal, equipment, limitations, experience, focus, modality, days_per_week, minutes_per_session, units_preference).
- Decline or redirect: general medical advice/diagnosis, nutrition outside training fuel, supplement dosing, non-fitness lifestyle coaching unless tied to training recovery, creating workouts that ignore equipment/limitations, inventing exercises not in the exercise library, promising outcomes without data.
- Behavioral rules: no autonomous writes to user state, no deleting user data, no hallucinated numbers, no scope creep outside the app. Suggest; do not act unilaterally.

PERSONALITY:
- Be substantive and thoughtful, not robotic. Responses should feel like a real coach talking to you.
- Ask follow-up questions when it helps the user think deeper about their training.
- Reference patterns and trends you see in their data. Be specific.
- If something looks off (plateau, declining volume, long gap since last session), mention it naturally.
- Help the user reflect: "How did that feel?" "What's your goal for this week?"

IMPORTANT RULES:
- Do not lead your response with a workout history recap. Only reference specific sessions, weights, or exercises when the user explicitly asks about them or when it's essential to answer their question.
- START by checking the user_profile block for units_preference, then follow it for every weight and distance you mention. If units_preference is imperial, all weights in this context are already in lbs — do not convert them again. If metric, they are in kg. Never mix units in the same response unless the user asks for a conversion.

COMPUTED INSIGHTS (use these to add value):
{insights_block}

WORKOUT GENERATION:
If the user asks you to build, create, or generate a workout, plan, or program, call the generate_workout tool with any overrides they requested (focus, goal, days_per_week, etc.). The tool will return a structured workout draft. Present the draft clearly to the user and explain why you chose those exercises.

WORKOUT MODIFICATIONS:
If the user asks you to modify, adjust, change, drop, swap, increase, or decrease something in their current workout or prescription, call the modify_workout tool. Pass the current_prescription from the context and a list of changes they requested. The tool will return a modified workout draft with the applied changes. Present the modified draft and clearly explain what you changed and why."""

    tools = [
        {
            "type": "function",
            "function": {
                "name": "generate_workout",
                "description": "Generate a personalized workout plan based on the user's saved fitness profile, with optional overrides. Use this when the user asks you to build, create, or generate a workout, plan, or program.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "focus": {"type": "string", "description": "Focus area or muscle group to emphasize (e.g., 'upper', 'lower', 'push', 'pull', 'core')"},
                        "days_per_week": {"type": "integer", "description": "Override days per week"},
                        "minutes_per_session": {"type": "integer", "description": "Override session duration in minutes"},
                        "goal": {"type": "string", "description": "Override primary goal (e.g., 'strength', 'hypertrophy', 'endurance', 'weight_loss')"},
                        "notes": {"type": "string", "description": "Additional context for the generation"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "modify_workout",
                "description": "Modify the user's current workout prescription by applying specific changes. Use this when the user asks to adjust, change, drop, swap, increase, or decrease something in their current workout.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "current_prescription": {
                            "type": "array",
                            "items": {"type": "object"},
                            "description": "The current prescription array from the context"
                        },
                        "changes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "exercise": {"type": "string", "description": "Exact exercise name from the prescription"},
                                    "field": {"type": "string", "enum": ["next_weight", "next_reps", "sets_target", "swap_exercise"]},
                                    "new_value": {"type": "string", "description": "New value for the field. For swap_exercise, the replacement exercise name."}
                                },
                                "required": ["exercise", "field", "new_value"]
                            },
                            "description": "List of changes to apply"
                        }
                    },
                    "required": ["current_prescription", "changes"]
                }
            }
        }
    ]

    # Guard: block clearly off-topic questions before hitting the LLM (save cost)
    fitness_keywords = [
        "workout", "exercise", "lift", "weight", "rep", "set", "gym", "training", "trained",
        "strength", "muscle", "cardio", "run", "squat", "bench", "deadlift", "press", "row",
        "recovery", "rest", "deload", "program", "phase", "block", "progression", "load",
        "effort", "form", "volume", "frequency", "routine", "plan", "goal",
        "fitness", "nutrition", "protein", "calories", "sleep", "sore",
        "injury", "pain", "warmup", "stretch", "mobility", "flexibility", "endurance",
        "hiit", "bootcamp", "crossfit", "olympic", "powerlift", "bodybuild",
        "weightlifting", "barbell", "dumbbell", "kettlebell", "machine", "cable", "pullup",
        "pushup", "plank", "burpee", "lunge", "hip", "knee", "shoulder", "back", "chest",
        "arm", "leg", "core", "ab", "glute", "calf", "quad", "hamstring", "lat", "trap",
        "bicep", "tricep", "forearm", "neck", "ankle", "wrist", "elbow",
        "progress", "focus", "recover", "PR", "personal record", "oneRM", "1RM",
        "preworkout", "pre-workout", "postworkout", "post-workout", "supplement",
        "bulk", "cut", "lean", "mass", "definition", "tone",
        "profile", "settings", "units", "imperial", "metric", "pounds", "lbs", "kg", "kilogram",
        "modify", "change", "swap", "drop", "increase", "decrease", "adjust", "lower", "reduce", "replace", "switch",
    ]
    question_lower = payload.question.lower()
    if len(payload.question) > 20:
        words = set(question_lower.split())
        if not words & set(fitness_keywords):
            return CoachChatResponse(
                message="I'm here to help with your training, workouts, and fitness goals. Ask me about your program, a specific session, recovery, or how to hit your next PR.",
                source="fallback",
                referenced_sessions=[],
                conversation_id=payload.conversation_id,
            )

    context = {
        "user_question": payload.question,
        "current_prescription": llm_prescription,
        "user_profile": fitness_profile,
        "coach_state": coach_state_data,
        "exercise_library": exercise_library,
        "recent_sessions": llm_session_summaries,
    }

    message = None
    workout_draft = None
    llm_status = "error"
    llm_error = None
    prompt_tokens = None
    completion_tokens = None

    for attempt in range(1):
        try:
            logger.info("[coach_chat] Nous request model=NousResearch/Hermes-4-70B key_prefix=%s", api_key[:12] if api_key else "NONE")
            messages = [{"role": "system", "content": system_prompt}]
            messages.extend(chat_history)
            messages.append({"role": "user", "content": json.dumps(context)})

            request_body = {
                "model": "NousResearch/Hermes-4-70B",
                "messages": messages,
                "max_tokens": 1200,
                "temperature": 0.7,
            }
            # Only include tools if the question looks like a workout generation or modification request
            workout_keywords = {"build", "create", "generate", "make", "design", "plan", "write", "new workout", "workout plan", "program"}
            modification_keywords = {"modify", "change", "swap", "drop", "increase", "decrease", "adjust", "lower", "reduce", "replace", "switch"}
            if words & workout_keywords or any(k in question_lower for k in ["build me", "create a", "generate a", "make me a", "write me a", "design a"]):
                request_body["tools"] = tools
                request_body["tool_choice"] = {"type": "function", "function": {"name": "generate_workout"}}
            elif words & modification_keywords or any(k in question_lower for k in ["change my", "swap my", "drop the", "increase my", "decrease my", "lower my", "reduce my", "replace the", "switch the", "modify my"]):
                request_body["tools"] = tools
                request_body["tool_choice"] = {"type": "function", "function": {"name": "modify_workout"}}

            resp = httpx.post(
                "https://inference-api.nousresearch.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=request_body,
                timeout=20,
            )
            logger.info("[coach_chat] Nous response status=%s body=%s", resp.status_code, resp.text[:200])
            if resp.status_code == 429:
                llm_status = "429"
                llm_error = "rate_limited"
                break
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]["message"]

            # Handle tool call for workout generation or modification
            if choice.get("tool_calls"):
                tool_call = choice["tool_calls"][0]
                if tool_call["function"]["name"] == "generate_workout":
                    try:
                        args = json.loads(tool_call["function"]["arguments"])
                        profile_answers = dict(fitness_profile)
                        profile_answers.update({k: v for k, v in args.items() if v is not None})
                        draft, _ = build_full_draft(db, profile_answers, current_user.id)
                        workout_draft = draft
                        focus_text = ""
                        if args.get("focus"):
                            focus_text = f" with a focus on {args['focus']}"
                        base_msg = f"I built a workout based on your profile{focus_text}. Here's what I came up with:"
                        message = args.get("notes") and base_msg or "I built a workout based on your current profile. Here's what I came up with:"
                    except Exception as tool_err:
                        logger.error("[coach_chat] generate_workout tool error: %s", tool_err)
                        message = "I tried to generate that workout but ran into an issue. Could you try again, or let me know if you want to adjust your profile first?"
                elif tool_call["function"]["name"] == "modify_workout":
                    try:
                        args = json.loads(tool_call["function"]["arguments"])
                        current_presc = args.get("current_prescription") or llm_prescription
                        changes = args.get("changes", [])
                        modified_presc, validation_error = _validate_and_apply_changes(current_presc, changes, exercise_library)
                        if validation_error:
                            message = f"I couldn't apply those changes: {validation_error}"
                        else:
                            workout_draft = {
                                "type": "modified_workout",
                                "groups": [
                                    {
                                        "name": p.get("exercise"),
                                        "sets_target": p.get("sets_target"),
                                        "reps_target": p.get("next_reps"),
                                        "start_weight": p.get("next_weight"),
                                        "swap_note": p.get("swap_note"),
                                    }
                                    for p in (modified_presc or [])
                                ],
                                "applied_changes": [
                                    c.get("exercise") + " " + c.get("field") + " → " + str(c.get("new_value"))
                                    for c in changes
                                ],
                            }
                            change_summary = "; ".join(workout_draft["applied_changes"])
                            message = f"Here's your updated workout. Changes applied: {change_summary}. Would you like me to explain any of these adjustments?"
                    except Exception as tool_err:
                        logger.error("[coach_chat] modify_workout tool error: %s", tool_err)
                        message = "I tried to modify your workout but ran into an issue. Could you try again?"
                else:
                    message = choice.get("content") or "I can help with that. Could you tell me more about what you're looking for?"
            else:
                message = choice.get("content") or ""

            llm_status = "success"
            prompt_tokens = data.get("usage", {}).get("prompt_tokens")
            completion_tokens = data.get("usage", {}).get("completion_tokens")
            break
        except Exception as e:
            logger.error(f"coach_chat LLM error attempt {attempt}: {e}")
            llm_error = str(e)
            message = None

    try:
        db.add(CoachUsageLog(
            user_id=current_user.id,
            model="NousResearch/Hermes-4-70B",
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            estimated_cost_usd=_estimate_coach_cost(prompt_tokens, completion_tokens),
            status=llm_status,
            error_message=llm_error,
        ))
        db.commit()
    except Exception:
        db.rollback()

    if message is None:
        # Deterministic fallback from context
        lines = [f"Coach notes for: \"{payload.question}\""]
        if session_summaries:
            latest = session_summaries[0]
            lines.append(f"Last session ({latest.get('template_name') or latest.get('context_name') or 'session'}): {len(latest['exercises'])} exercises, {latest.get('duration_min')} min.")
            for ex in latest["exercises"][:5]:
                lines.append(f"- {ex['name']}: {ex['top_weight']} {unit_label} × {ex['top_reps']} reps, effort {ex.get('avg_effort', '?')}, volume {ex.get('volume', 0)}")
            if len(session_summaries) > 1:
                prev = session_summaries[1]
                for ex in prev["exercises"][:3]:
                    matches = [l for l in latest["exercises"] if l["name"] == ex["name"]]
                    if matches:
                        cur = matches[0]
                        if ex["top_weight"] != cur["top_weight"] or ex["top_reps"] != cur["top_reps"]:
                            lines.append(f"- Trend: {ex['name']} went from {ex['top_weight']}×{ex['top_reps']} to {cur['top_weight']}×{cur['top_reps']}.")
        if coach_state_data:
            lines.append(f"Program state: {coach_state_data.get('phase') or 'unknown phase'}, week {coach_state_data.get('week_in_block') or '?'}, load {coach_state_data.get('load_pct', 0)}%")
        if prescription:
            if isinstance(prescription, list):
                lines.append("Up next:")
                for p in prescription[:5]:
                    lines.append(f"- {p['exercise']} — start at {p['next_weight']} {unit_label} × {p['next_reps']} reps.")
                    if p.get("message"):
                        lines.append(f"  {p['message']}")
            else:
                lines.append(f"Up next: {prescription['exercise']} — start at {prescription['next_weight']} {unit_label} × {prescription['next_reps']} reps.")
                if prescription.get("message"):
                    lines.append(f"- {prescription['message']}")
        lines.append("Focus: keep reps smooth and controlled. If it feels easy, add weight next time; if form breaks, hold weight.")
        message = "\n".join(lines)
        return CoachChatResponse(message=message, source="fallback", referenced_sessions=[
            {"id": s["id"], "template_name": s.get("template_name"), "date": s.get("date"), "exercises": s.get("exercises", [])[:3]}
            for s in session_summaries[:3]
        ], conversation_id=payload.conversation_id)

    # Save to conversation history if conversation_id provided
    conv_id = payload.conversation_id
    if conversation is None and payload.conversation_id is None:
        # Auto-create a conversation for AI trainer chat
        try:
            new_conv = AiCoachConversation(user_id=current_user.id, title=payload.question[:60])
            db.add(new_conv)
            db.commit()
            db.refresh(new_conv)
            conv_id = new_conv.id
        except Exception:
            conv_id = None

    if conv_id:
        try:
            conv = db.query(AiCoachConversation).filter(
                AiCoachConversation.id == conv_id,
                AiCoachConversation.user_id == current_user.id,
            ).first()
            if conv:
                # Auto-title from first user message
                if not conv.title:
                    conv.title = payload.question[:60]
                db.add(AiCoachMessage(
                    conversation_id=conv.id,
                    role=CoachRole.pre_workout,
                    content=payload.question,
                ))
                db.add(AiCoachMessage(
                    conversation_id=conv.id,
                    role=CoachRole.post_workout,
                    content=message,
                    message_type="workout_draft" if workout_draft else "text",
                    extra_data=workout_draft,
                ))
                conv.updated_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            db.rollback()

    return CoachChatResponse(
        message=message,
        source="llm",
        referenced_sessions=[],
        conversation_id=conv_id,
        workout_draft=workout_draft,
    )


def get_admin_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1]
    user = _user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


class AdminCoachCostItem(BaseModel):
    user_id: int
    email: str
    total_calls: int
    success_calls: int
    rate_limited_calls: int
    error_calls: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_estimated_cost_usd: float
    first_call_at: Optional[str] = None
    last_call_at: Optional[str] = None

class AdminCoachCostsResponse(BaseModel):
    total_calls: int
    total_estimated_cost_usd: float
    total_prompt_tokens: int
    total_completion_tokens: int
    users: List[AdminCoachCostItem]
    model_config = ConfigDict(from_attributes=True)

@app.get("/api/admin/coach-costs", response_model=AdminCoachCostsResponse)
def admin_coach_costs(range: str = "all", db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    from datetime import datetime, timezone, timedelta
    query = db.query(CoachUsageLog)
    cutoff = None
    if range == "24h":
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    elif range == "7d":
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    elif range == "30d":
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    if cutoff:
        query = query.filter(CoachUsageLog.timestamp >= cutoff)

    logs = query.all()
    total_calls = len(logs)
    total_prompt = sum(int(l.prompt_tokens or 0) for l in logs)
    total_completion = sum(int(l.completion_tokens or 0) for l in logs)
    total_cost = round(sum(float(l.estimated_cost_usd or 0.0) for l in logs), 6)

    user_map = {}
    for l in logs:
        item = user_map.setdefault(l.user_id, {
            "user_id": l.user_id,
            "email": "unknown",
            "total_calls": 0,
            "success_calls": 0,
            "rate_limited_calls": 0,
            "error_calls": 0,
            "total_prompt_tokens": 0,
            "total_completion_tokens": 0,
            "total_estimated_cost_usd": 0.0,
            "first_call_at": None,
            "last_call_at": None,
        })
        item["total_calls"] += 1
        if l.status == "success":
            item["success_calls"] += 1
        elif l.status == "429":
            item["rate_limited_calls"] += 1
        else:
            item["error_calls"] += 1
        item["total_prompt_tokens"] += int(l.prompt_tokens or 0)
        item["total_completion_tokens"] += int(l.completion_tokens or 0)
        item["total_estimated_cost_usd"] = round(float(item["total_estimated_cost_usd"]) + float(l.estimated_cost_usd or 0.0), 6)
        ts = l.timestamp.isoformat() if l.timestamp else None
        if ts is not None:
            item["first_call_at"] = ts if item["first_call_at"] is None else min(item["first_call_at"], ts)
            item["last_call_at"] = ts if item["last_call_at"] is None else max(item["last_call_at"], ts)

    # Backfill emails
    user_ids = [uid for uid in user_map if uid is not None]
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        email_map = {u.id: u.email for u in users}
        for item in user_map.values():
            if item["user_id"] is not None:
                item["email"] = email_map.get(item["user_id"], "deleted")

    users_sorted = sorted(user_map.values(), key=lambda x: x["total_estimated_cost_usd"], reverse=True)
    return AdminCoachCostsResponse(
        total_calls=total_calls,
        total_estimated_cost_usd=total_cost,
        total_prompt_tokens=total_prompt,
        total_completion_tokens=total_completion,
        users=[AdminCoachCostItem(**u) for u in users_sorted],
    )


class TopTalkerItem(BaseModel):
    user_id: int
    email: str
    call_count: int
    total_tokens: int
    estimated_cost_usd: float

@app.get("/api/admin/coach-costs/top-talkers", response_model=List[TopTalkerItem])
def admin_top_talkers(limit: int = 10, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    logs = db.query(CoachUsageLog).all()
    user_map = {}
    for l in logs:
        uid = l.user_id
        item = user_map.setdefault(uid, {
            "user_id": uid,
            "email": "unknown",
            "call_count": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
        })
        item["call_count"] += 1
        item["total_tokens"] += (l.prompt_tokens or 0) + (l.completion_tokens or 0)
        item["estimated_cost_usd"] = round(item["estimated_cost_usd"] + (l.estimated_cost_usd or 0.0), 6)

    user_ids = [uid for uid in user_map if uid is not None]
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        email_map = {u.id: u.email for u in users}
        for item in user_map.values():
            if item["user_id"] is not None:
                item["email"] = email_map.get(item["user_id"], "deleted")

    top = sorted(user_map.values(), key=lambda x: x["call_count"], reverse=True)[: max(1, min(limit, 100))]
    return [TopTalkerItem(**t) for t in top]


class AdminTaskItem(BaseModel):
    phase: str
    lane: str
    text: str
    status: str  # completed / pending / cancelled

@app.get("/api/admin/tasks", response_model=List[AdminTaskItem])
def admin_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    import re
    todo_path = os.path.join(os.path.dirname(__file__), "..", "TODO.md")
    if not os.path.exists(todo_path):
        todo_path = os.path.join(os.path.dirname(__file__), "TODO.md")
    items: List[AdminTaskItem] = []
    current_phase = "Uncategorized"
    current_lane = "General"
    if os.path.exists(todo_path):
        with open(todo_path, "r") as f:
            for raw_line in f:
                line = raw_line.rstrip("\n")
                stripped = line.strip()
                if stripped.startswith("## "):
                    current_phase = stripped.replace("## ", "", 1).strip()
                    current_lane = "General"
                    continue
                if stripped.startswith("### "):
                    current_lane = stripped.replace("### ", "", 1).strip()
                    continue
                if stripped.startswith("- [ ] ") or stripped.startswith("- [x] ") or stripped.startswith("- [X] "):
                    status = "completed" if stripped[3].lower() == "x" else "pending"
                    text = stripped[5:].strip()
                    if not text:
                        continue
                    items.append(AdminTaskItem(phase=current_phase, lane=current_lane, text=text, status=status))
    return items


@app.get("/dashboard")
def dashboard():
    dashboard_path = os.path.join(os.path.dirname(__file__), "dashboard.html")
    if not os.path.exists(dashboard_path):
        return HTMLResponse(content="<h1>Dashboard not found</h1>", media_type="text/html")
    with open(dashboard_path, "r") as f:
        html = f.read()
    return HTMLResponse(content=html, media_type="text/html")


class AdminLogItem(BaseModel):
    timestamp: Optional[str] = None
    level: str
    message: str

@app.get("/api/admin/logs", response_model=List[AdminLogItem])
def admin_logs(lines: int = 200, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    log_path = os.path.join(os.path.dirname(__file__), "logs", "workout.log")
    items: List[AdminLogItem] = []
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
        tail = all_lines[-max(1, min(lines, 1000)):]
        for raw in tail:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
                ts = obj.get("timestamp") or obj.get("time")
                level = "info"
                if obj.get("type") in ("unhandled_exception", "timeout"):
                    level = "error"
                elif obj.get("level"):
                    level = obj["level"]
                msg = obj.get("message") or obj.get("error") or obj.get("detail") or raw
                items.append(AdminLogItem(timestamp=ts, level=level, message=str(msg)))
            except Exception:
                items.append(AdminLogItem(level="info", message=raw))
    return items


class AISuggestionRequest(BaseModel):
    session_id: int
    context: str
    current_exercise_name: str
    last_set_effort: Optional[int] = None
    goal: Optional[str] = None

class AISuggestionResponse(BaseModel):
    message: str
    next_weight: Optional[float] = None
    next_reps: Optional[int] = None

@app.post("/api/ai/next-suggestion", response_model=AISuggestionResponse)
def ai_next_suggestion(payload: AISuggestionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    # Stub: can be wired to local Ollama or cloud LLM later
    logger.info(json.dumps({
        "type": "ai",
        "event": "next_suggestion",
        "session_id": payload.session_id,
        "current_exercise_name": payload.current_exercise_name,
        "last_set_effort": payload.last_set_effort,
    }))
    if payload.last_set_effort is None:
        msg = "Let's start your first set. Focus on form."
    elif payload.last_set_effort <= 2:
        msg = "That looked easy. Let's push harder — add a little weight or a couple reps."
        next_weight = None
        next_reps = None
    elif payload.last_set_effort == 3:
        msg = "Solid set. Match or slightly beat it next time."
        next_weight = None
        next_reps = None
    elif payload.last_set_effort == 4:
        msg = "Great effort. Let's increase weight slightly next set."
        next_weight = None
        next_reps = None
    else:
        msg = "Tough set. We'll keep the weight the same next time and focus on reps."
        next_weight = None
        next_reps = None
    return AISuggestionResponse(message=msg, next_weight=None, next_reps=None)

@app.post("/api/seed")
def seed_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    logger.info(json.dumps({"type": "seed", "event": "start"}))
    # Seed exercise library if empty
    if db.query(ExerciseLibrary).count() == 0:
        sample = [
            # Chest - Barbell
            ExerciseLibrary(name="Bench Press", muscle_group="Chest", equipment="Barbell", default_rest_seconds=120),
            ExerciseLibrary(name="Close-Grip Bench Press", muscle_group="Chest", equipment="Barbell", default_rest_seconds=120),
            # Chest - Dumbbell
            ExerciseLibrary(name="Incline Dumbbell Press", muscle_group="Chest", equipment="Dumbbell", default_rest_seconds=90),
            ExerciseLibrary(name="Flat Dumbbell Press", muscle_group="Chest", equipment="Dumbbell", default_rest_seconds=90),
            ExerciseLibrary(name="Dumbbell Flyes", muscle_group="Chest", equipment="Dumbbell", default_rest_seconds=75),
            # Chest - Cable/Machine
            ExerciseLibrary(name="Cable Flyes", muscle_group="Chest", equipment="Cable", default_rest_seconds=75),
            ExerciseLibrary(name="Pec Deck Flyes", muscle_group="Chest", equipment="Machine", default_rest_seconds=75),
            # Shoulders - Barbell/Dumbbell
            ExerciseLibrary(name="Overhead Press", muscle_group="Shoulders", equipment="Barbell", default_rest_seconds=120),
            ExerciseLibrary(name="Lateral Raise", muscle_group="Shoulders", equipment="Dumbbell", default_rest_seconds=60),
            ExerciseLibrary(name="Front Raise", muscle_group="Shoulders", equipment="Dumbbell", default_rest_seconds=60),
            ExerciseLibrary(name="Arnold Press", muscle_group="Shoulders", equipment="Dumbbell", default_rest_seconds=90),
            ExerciseLibrary(name="Upright Row", muscle_group="Shoulders", equipment="Barbell", default_rest_seconds=90),
            # Shoulders - Cable/Machine
            ExerciseLibrary(name="Cable Lateral Raise", muscle_group="Shoulders", equipment="Cable", default_rest_seconds=60),
            ExerciseLibrary(name="Machine Shoulder Press", muscle_group="Shoulders", equipment="Machine", default_rest_seconds=90),
            # Back - Barbell
            ExerciseLibrary(name="Barbell Row", muscle_group="Back", equipment="Barbell", default_rest_seconds=120),
            ExerciseLibrary(name="Deadlift", muscle_group="Back", equipment="Barbell", default_rest_seconds=180),
            ExerciseLibrary(name="T-Bar Row", muscle_group="Back", equipment="Machine", default_rest_seconds=120),
            # Back - Dumbbell
            ExerciseLibrary(name="Dumbbell Row", muscle_group="Back", equipment="Dumbbell", default_rest_seconds=90),
            ExerciseLibrary(name="Dumbbell Pullover", muscle_group="Back", equipment="Dumbbell", default_rest_seconds=75),
            # Back - Cable/Machine
            ExerciseLibrary(name="Lat Pulldown", muscle_group="Back", equipment="Cable", default_rest_seconds=90),
            ExerciseLibrary(name="Seated Cable Row", muscle_group="Back", equipment="Cable", default_rest_seconds=90),
            ExerciseLibrary(name="Straight-Arm Pulldown", muscle_group="Back", equipment="Cable", default_rest_seconds=75),
            ExerciseLibrary(name="Assisted Pull-Up", muscle_group="Back", equipment="Machine", default_rest_seconds=90),
            # Biceps
            ExerciseLibrary(name="Bicep Curl", muscle_group="Biceps", equipment="Dumbbell", default_rest_seconds=60),
            ExerciseLibrary(name="Barbell Curl", muscle_group="Biceps", equipment="Barbell", default_rest_seconds=60),
            ExerciseLibrary(name="Hammer Curl", muscle_group="Biceps", equipment="Dumbbell", default_rest_seconds=60),
            ExerciseLibrary(name="Preacher Curl", muscle_group="Biceps", equipment="Machine", default_rest_seconds=60),
            ExerciseLibrary(name="Cable Bicep Curl", muscle_group="Biceps", equipment="Cable", default_rest_seconds=60),
            # Triceps
            ExerciseLibrary(name="Tricep Pushdown", muscle_group="Triceps", equipment="Cable", default_rest_seconds=60),
            ExerciseLibrary(name="Overhead Tricep Extension", muscle_group="Triceps", equipment="Cable", default_rest_seconds=60),
            ExerciseLibrary(name="Tricep Dip", muscle_group="Triceps", equipment="Bodyweight", default_rest_seconds=60),
            ExerciseLibrary(name="Skull Crusher", muscle_group="Triceps", equipment="Barbell", default_rest_seconds=75),
            ExerciseLibrary(name="Tricep Kickback", muscle_group="Triceps", equipment="Dumbbell", default_rest_seconds=60),
            # Legs - Barbell
            ExerciseLibrary(name="Back Squat", muscle_group="Legs", equipment="Barbell", default_rest_seconds=150),
            ExerciseLibrary(name="Front Squat", muscle_group="Legs", equipment="Barbell", default_rest_seconds=150),
            ExerciseLibrary(name="Romanian Deadlift", muscle_group="Legs", equipment="Barbell", default_rest_seconds=120),
            # Legs - Dumbbell
            ExerciseLibrary(name="Goblet Squat", muscle_group="Legs", equipment="Dumbbell", default_rest_seconds=90),
            ExerciseLibrary(name="Dumbbell Lunge", muscle_group="Legs", equipment="Dumbbell", default_rest_seconds=90),
            # Legs - Machine/Cable
            ExerciseLibrary(name="Leg Press", muscle_group="Legs", equipment="Machine", default_rest_seconds=120),
            ExerciseLibrary(name="Leg Curl", muscle_group="Legs", equipment="Machine", default_rest_seconds=75),
            ExerciseLibrary(name="Leg Extension", muscle_group="Legs", equipment="Machine", default_rest_seconds=75),
            ExerciseLibrary(name="Hip Abductor", muscle_group="Legs", equipment="Machine", default_rest_seconds=60),
            # Legs - Bodyweight
            ExerciseLibrary(name="Bodyweight Lunge", muscle_group="Legs", equipment="Bodyweight", default_rest_seconds=60),
            ExerciseLibrary(name="Glute Bridge", muscle_group="Legs", equipment="Bodyweight", default_rest_seconds=60),
            # Calves
            ExerciseLibrary(name="Calf Raise", muscle_group="Calves", equipment="Machine", default_rest_seconds=60),
            # Core
            ExerciseLibrary(name="Plank", muscle_group="Core", equipment="Bodyweight", default_rest_seconds=60),
            ExerciseLibrary(name="Cable Crunch", muscle_group="Core", equipment="Cable", default_rest_seconds=60),
            ExerciseLibrary(name="Hanging Leg Raise", muscle_group="Core", equipment="Bodyweight", default_rest_seconds=75),
            ExerciseLibrary(name="Russian Twist", muscle_group="Core", equipment="Dumbbell", default_rest_seconds=60),
            ExerciseLibrary(name="Ab Machine", muscle_group="Core", equipment="Machine", default_rest_seconds=60),
            ExerciseLibrary(name="Bicycle Crunch", muscle_group="Core", equipment="Bodyweight", default_rest_seconds=45),
        ]
        db.add_all(sample)
        db.commit()

    # Seed a sample context + template if none for this user
    if db.query(Context).filter(Context.user_id == current_user.id).count() == 0:
        ctx = Context(
            name="Home Gym",
            description="Basement setup",
            equipment_tags=json.dumps(["bench","barbell","dumbbell","cable"]),
            user_id=current_user.id,
        )
        db.add(ctx)
        db.commit()
        db.refresh(ctx)

        tpl = WorkoutTemplate(context_id=ctx.id, name="Push Day A", type=RoutineType.strength, order=0, user_id=current_user.id)
        db.add(tpl)
        db.commit()
        db.refresh(tpl)

        exercises = [
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Bench Press"), name="Bench Press", sets_target=4, reps_target=10, start_weight=61.235, rest_seconds=120, order=0, user_id=current_user.id),
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Incline Dumbbell Press"), name="Incline Dumbbell Press", sets_target=3, reps_target=10, start_weight=18.144, rest_seconds=90, order=1, user_id=current_user.id),
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Cable Flyes"), name="Cable Flyes", sets_target=3, reps_target=15, start_weight=9.072, rest_seconds=75, order=2, user_id=current_user.id),
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Overhead Press"), name="Overhead Press", sets_target=3, reps_target=8, start_weight=29.484, rest_seconds=120, order=3, user_id=current_user.id),
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Tricep Pushdown"), name="Tricep Pushdown", sets_target=3, reps_target=12, start_weight=13.608, rest_seconds=60, order=4, user_id=current_user.id),
        ]
        db.add_all(exercises)
        db.commit()

    # Seed workout library if empty
    if db.query(WorkoutLibrary).count() == 0:
        stronglifts = WorkoutLibrary(
            name="StrongLifts 5x5",
            category="Strength",
            difficulty="beginner",
            description="Full-body barbell program focused on compound lifts and consistent progression.",
            estimated_minutes=45,
        )
        db.add(stronglifts)
        db.commit()
        db.refresh(stronglifts)

        db.add_all([
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Back Squat", muscle_group="Legs", equipment="Barbell", sets_target=5, reps_target=5, start_weight=61.235, rest_seconds=150, order=0),
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Bench Press", muscle_group="Chest", equipment="Barbell", sets_target=5, reps_target=5, start_weight=43.091, rest_seconds=120, order=1),
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Overhead Press", muscle_group="Shoulders", equipment="Barbell", sets_target=5, reps_target=5, start_weight=29.484, rest_seconds=120, order=2),
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Barbell Row", muscle_group="Back", equipment="Barbell", sets_target=5, reps_target=5, start_weight=52.163, rest_seconds=120, order=3),
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Deadlift", muscle_group="Back", equipment="Barbell", sets_target=1, reps_target=5, start_weight=83.915, rest_seconds=180, order=4),
        ])
        db.commit()

        db.add_all([
            WorkoutLibrary(
                name="Upper Body Push",
                category="Strength",
                difficulty="intermediate",
                description="Bench-focused upper-body push session.",
                estimated_minutes=40,
            ),
            WorkoutLibrary(
                name="Upper Body Pull",
                category="Strength",
                difficulty="intermediate",
                description="Back and biceps focused pulling session.",
                estimated_minutes=40,
            ),
            WorkoutLibrary(
                name="Leg Day",
                category="Strength",
                difficulty="advanced",
                description="High-volume lower-body barbell session.",
                estimated_minutes=50,
            ),
            WorkoutLibrary(
                name="Bodyweight HIIT",
                category="HIIT",
                difficulty="beginner",
                description="No-equipment high-intensity interval circuit.",
                estimated_minutes=25,
            ),
            WorkoutLibrary(
                name="Core & Mobility",
                category="Active Rest",
                difficulty="beginner",
                description="Active recovery focusing on core work and mobility.",
                estimated_minutes=30,
            ),
        ])
        db.commit()

    return {"status": "seeded"}

# --- Settings ---

class SettingOut(BaseModel):
    key: str
    value: Optional[str] = None


# --- AI Trainer Adjustments ---

class AITrainerAdjustmentIn(BaseModel):
    exercise_entry_id: Optional[int] = None
    exercise_name: str
    proposed_weight: Optional[float] = None
    proposed_reps: Optional[int] = None
    proposed_sets: Optional[int] = None
    proposed_rest_seconds: Optional[int] = None
    proposed_order: Optional[int] = None
    effort_avg: Optional[float] = None
    progression_type: Optional[str] = None


class AITrainerAdjustmentOut(BaseModel):
    id: int
    session_id: int
    template_id: Optional[int]
    exercise_entry_id: Optional[int]
    exercise_name: str
    proposed_weight: Optional[float]
    proposed_reps: Optional[int]
    proposed_sets: Optional[int]
    proposed_rest_seconds: Optional[int]
    proposed_order: Optional[int]
    effort_avg: Optional[float]
    progression_type: Optional[str]
    applied: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AITrainerAdjustmentBatch(BaseModel):
    session_id: int
    template_id: Optional[int] = None
    total_volume: Optional[float] = None
    total_sets: Optional[int] = None
    effort_avg: Optional[float] = None
    adjustments: List[AITrainerAdjustmentIn] = []


@app.post("/api/ai-trainer/adjustments/batch", response_model=List[AITrainerAdjustmentOut])
def save_ai_trainer_adjustments(payload: AITrainerAdjustmentBatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    session = db.query(WorkoutSession).filter(WorkoutSession.id == payload.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    saved = []
    for item in payload.adjustments:
        row = AITrainerAdjustment(
            session_id=payload.session_id,
            template_id=payload.template_id or session.template_id,
            exercise_entry_id=item.exercise_entry_id,
            exercise_name=item.exercise_name,
            proposed_weight=item.proposed_weight,
            proposed_reps=item.proposed_reps,
            proposed_sets=item.proposed_sets,
            proposed_rest_seconds=item.proposed_rest_seconds,
            proposed_order=item.proposed_order,
            effort_avg=item.effort_avg or payload.effort_avg,
            progression_type=item.progression_type or "linear",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        saved.append(row)
    if saved:
        logger.info(json.dumps({
            "type": "ai_trainer",
            "event": "adjustments_saved",
            "session_id": payload.session_id,
            "count": len(saved),
        }))
    return saved


@app.get("/api/ai-trainer/adjustments", response_model=List[AITrainerAdjustmentOut])
def list_ai_trainer_adjustments(session_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    q = db.query(AITrainerAdjustment).filter(AITrainerAdjustment.user_id == current_user.id)
    if session_id:
        q = q.filter(AITrainerAdjustment.session_id == session_id)
    return q.order_by(AITrainerAdjustment.created_at.desc()).limit(200).all()

# --- Workout Library ---
class WorkoutLibraryExerciseOut(BaseModel):
    id: int
    workout_library_id: int
    name: str
    muscle_group: Optional[str]
    equipment: Optional[str]
    sets_target: int
    reps_target: int
    start_weight: float
    rest_seconds: int
    order: int
    notes: Optional[str]
    class Config:
        from_attributes = True

class WorkoutLibraryOut(BaseModel):
    id: int
    name: str
    category: str
    difficulty: str
    description: Optional[str]
    estimated_minutes: Optional[int]
    exercises: List[WorkoutLibraryExerciseOut] = []
    class Config:
        from_attributes = True

class WorkoutLibraryImportIn(BaseModel):
    library_id: int
    context_name: str

class WorkoutLibraryImportOut(BaseModel):
    context_id: int
    template_id: int
    exercises_imported: int
    class Config:
        from_attributes = True

@app.get("/api/workout-library", response_model=List[WorkoutLibraryOut])
def list_workout_library(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    return db.query(WorkoutLibrary).filter(WorkoutLibrary.user_id == current_user.id).all()

@app.get("/api/workout-library/{library_id}", response_model=WorkoutLibraryOut)
def get_workout_library(library_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    w = db.query(WorkoutLibrary).filter(WorkoutLibrary.id == library_id, WorkoutLibrary.user_id == current_user.id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Workout not found")
    return w

@app.post("/api/workout-library/import", response_model=WorkoutLibraryImportOut)
def import_workout_library(payload: WorkoutLibraryImportIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    w = db.query(WorkoutLibrary).filter(WorkoutLibrary.id == payload.library_id, WorkoutLibrary.user_id == current_user.id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Workout not found")

    ctx = Context(
        name=payload.context_name,
        description=f"Imported from library: {w.name}",
        equipment_tags="[]",
        default_rest_seconds=90,
    )
    db.add(ctx)
    db.commit()
    db.refresh(ctx)

    tpl = WorkoutTemplate(
        context_id=ctx.id,
        name=w.name,
        type=RoutineType.strength,
        order=0,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)

    lib_exercises = sorted(w.exercises or [], key=lambda e: e.order)
    created = []
    for idx, ex in enumerate(lib_exercises):
        created.append(
            ExerciseEntry(
                template_id=tpl.id,
                name=ex.name,
                sets_target=ex.sets_target,
                reps_target=ex.reps_target,
                start_weight=ex.start_weight,
                rest_seconds=ex.rest_seconds,
                order=idx,
                notes=ex.notes,
            )
        )
    db.add_all(created)
    db.commit()

    return WorkoutLibraryImportOut(context_id=ctx.id, template_id=tpl.id, exercises_imported=len(created))

@app.get("/api/settings/{key}", response_model=SettingOut)
def get_setting(key: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    logger.info("[settings] GET /api/settings/%s user=%s", key, current_user.id)
    s = db.query(AppSetting).filter(AppSetting.key == key, AppSetting.user_id == current_user.id).first()
    return SettingOut(key=key, value=s.value if s else None)

@app.put("/api/settings/{key}", response_model=SettingOut)
def put_setting(key: str, payload: SettingOut, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    logger.info("[settings] PUT /api/settings/%s user=%s value=%r", key, current_user.id, payload.value)
    s = db.query(AppSetting).filter(AppSetting.key == key, AppSetting.user_id == current_user.id).first()
    if not s:
        s = AppSetting(key=key, value=payload.value, user_id=current_user.id)
        db.add(s)
    else:
        s.value = payload.value
    db.commit()
    db.refresh(s)
    logger.info("[settings] PUT saved key=%s user=%s saved_value=%r", s.key, current_user.id, s.value)
    return SettingOut(key=s.key, value=s.value)

@app.get("/api/settings", response_model=List[SettingOut])
def list_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    logger.info("[settings] GET /api/settings user=%s", current_user.id)
    settings = db.query(AppSetting).filter(AppSetting.user_id == current_user.id).all()
    out = [SettingOut(key=s.key, value=s.value) for s in settings]
    logger.info("[settings] GET returned keys=%s", [x.key for x in out])
    return out

# --- Body Weight ---
    exercises = sorted(tpl.exercises or [], key=lambda e: e.order)
    return WorkoutTemplateOut(
        id=tpl.id,
        context_id=tpl.context_id,
        name=tpl.name,
        type=tpl.type.value,
        order=tpl.order,
        default_rest_seconds=tpl.default_rest_seconds,
        coach_rules=tpl.coach_rules,
        exercises=[
            ExerciseEntryOut(
                id=e.id,
                template_id=e.template_id,
                exercise_library_id=e.exercise_library_id,
                name=e.name,
                sets_target=e.sets_target,
                reps_target=e.reps_target,
                start_weight=e.start_weight,
                rest_seconds=e.rest_seconds,
                order=e.order,
                notes=e.notes,
                per_set_data=e.per_set_data,
            )
            for e in exercises
        ],
    )
