from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
import json
import os
import logging
import time
import traceback
import secrets
import hashlib
import httpx
from logging.handlers import RotatingFileHandler
from passlib.context import CryptContext

from db import SessionLocal, init_db
from models import (
    User, UserRole, Context, WorkoutTemplate, ExerciseLibrary, ExerciseEntry,
    WorkoutSession, SetLog, CoachMessage, AlgorithmState, RoutineType, SessionStatus, CoachRole, AppSetting,
    WorkoutLibrary, WorkoutLibraryExercise, BodyWeightLog, AITrainerAdjustment
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
AUTH_TOKEN_PREFIX = "Bearer "

app = FastAPI(title="Workout Logger")

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# --- Schemas ---

class ContextCreate(BaseModel):
    name: str
    description: Optional[str] = None
    equipment_tags: Optional[List[str]] = []
    default_rest_seconds: Optional[int] = 90

class ContextOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    equipment_tags: List[str]
    is_active: bool
    default_rest_seconds: int = 90

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

    class Config:
        from_attributes = True

class WorkoutTemplateCreate(BaseModel):
    context_id: int
    name: str
    type: RoutineType = RoutineType.strength
    order: int = 0
    default_rest_seconds: Optional[int] = None

class WorkoutTemplateOut(BaseModel):
    id: int
    context_id: int
    name: str
    type: str
    order: int
    default_rest_seconds: Optional[int] = None
    exercises: List[ExerciseEntryOut] = []

    class Config:
        from_attributes = True

class WorkoutTemplateUpdate(BaseModel):
    name: str
    type: Optional[str] = None
    order: Optional[int] = None
    default_rest_seconds: Optional[int] = None

class SessionCreate(BaseModel):
    template_id: Optional[int] = None
    pre_workout_mood: Optional[str] = None
    pre_workout_tags: Optional[List[str]] = []

class SessionOut(BaseModel):
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
    actual_reps: Optional[int] = None
    effort: Optional[int] = None
    notes: Optional[str] = None

class SetLogOut(BaseModel):
    id: int
    session_id: int
    exercise_entry_id: int
    set_index: int
    suggested_weight: Optional[float]
    suggested_reps: Optional[int]
    actual_weight: Optional[float]
    actual_reps: Optional[int]
    effort: Optional[int]
    notes: Optional[str]

    class Config:
        from_attributes = True

class SessionHistoryOut(BaseModel):
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

class CoachMessageOut(BaseModel):
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

class BodyWeightLogOut(BaseModel):
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
def signup(payload: UserCreate, db: Session = Depends(get_db)):
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
    token = _make_token()
    user.token_hash = _token_hash(token)
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(
        token=token,
        user=UserOut(id=user.id, email=user.email, role=user.role.value, first_name=user.first_name, last_name=user.last_name),
    )

@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    logger.info(json.dumps({"type": "login", "email": payload.email, "password_length": len(payload.password), "password_prefix": payload.password[:2]}))
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not _verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = _make_token()
    user.token_hash = _token_hash(token)
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
    return _issue_token_for_user(user)

@app.post("/api/auth/apple", response_model=TokenOut)
async def apple_login(payload: AppleLoginIn, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Apple login is not configured yet")

@app.get("/api/auth/me", response_model=UserOut)
def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1]
    token_hash = _token_hash(token)
    user = db.query(User).filter(User.token_hash == token_hash).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return UserOut(id=user.id, email=user.email, role=user.role.value, first_name=user.first_name, last_name=user.last_name)

def get_current_user_dep(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1]
    token_hash = _token_hash(token)
    user = db.query(User).filter(User.token_hash == token_hash).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

class ProfileUpdateIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None

@app.put("/api/auth/profile", response_model=UserOut)
def update_profile(payload: ProfileUpdateIn, current_user: User = Depends(get_current_user_dep), db: Session = Depends(get_db)):
    if payload.first_name is not None:
        current_user.first_name = payload.first_name
    if payload.last_name is not None:
        current_user.last_name = payload.last_name
    db.commit()
    db.refresh(current_user)
    return UserOut(id=current_user.id, email=current_user.email, role=current_user.role.value, first_name=current_user.first_name, last_name=current_user.last_name)

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
    contexts = db.query(Context).filter(Context.user_id == current_user.id).all()
    return [
        ContextOut(
            id=c.id,
            name=c.name,
            description=c.description,
            equipment_tags=json.loads(c.equipment_tags or "[]"),
            is_active=c.is_active,
            default_rest_seconds=c.default_rest_seconds,
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

# --- Templates ---

@app.post("/api/templates", response_model=WorkoutTemplateOut)
def create_template(payload: WorkoutTemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    tpl = WorkoutTemplate(
        context_id=payload.context_id,
        name=payload.name,
        type=payload.type,
        order=payload.order,
        default_rest_seconds=payload.default_rest_seconds,
        user_id=current_user.id,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return _template_out(tpl)

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
    ex = ExerciseEntry(**payload.dict(), user_id=current_user.id)
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex

@app.put("/api/exercises/{exercise_id}", response_model=ExerciseEntryOut)
def update_exercise(exercise_id: int, payload: ExerciseEntryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    ex = db.query(ExerciseEntry).filter(ExerciseEntry.id == exercise_id, ExerciseEntry.user_id == current_user.id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    for field, value in payload.dict(exclude_unset=True).items():
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
    return db.query(ExerciseEntry).filter(ExerciseEntry.user_id == current_user.id).all()

@app.get("/api/templates/{template_id}/exercises", response_model=List[ExerciseEntryOut])
def list_template_exercises(template_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    return db.query(ExerciseEntry).filter(ExerciseEntry.template_id == template_id, ExerciseEntry.user_id == current_user.id).order_by(ExerciseEntry.order).all()

# --- Exercise Library ---

@app.get("/api/exercise-library", response_model=List[ExerciseLibraryOut])
def search_exercise_library(q: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    query = db.query(ExerciseLibrary)
    if q:
        query = query.filter(ExerciseLibrary.name.ilike(f"%{q}%"))
    return query.all()

MUSCLEWIKI_BASE = "https://api.musclewiki.com"

@app.post("/api/exercise-library/sync")
def sync_exercise_library(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    path = os.path.join(os.path.dirname(__file__), "dist", "exercises-hasan.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail="Local exercise dataset not found")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    def _normalize_muscle_group(value: str) -> str:
        if not value:
            return value
        v = value.strip().lower()
        mapping = {
            "chest": "Chest",
            "shoulders": "Shoulders",
            "back": "Back",
            "biceps": "Biceps",
            "triceps": "Triceps",
            "upper arms": "Upper Arms",
            "lower arms": "Lower Arms",
            "legs": "Legs",
            "upper legs": "Upper Legs",
            "lower legs": "Lower Legs",
            "calves": "Calves",
            "waist": "Core",
            "cardio": "Cardio",
            "neck": "Neck",
        }
        return mapping.get(v, value.strip().title())

    synced = 0
    for item in data:
        name = item.get("name")
        if not name:
            continue
        existing = db.query(ExerciseLibrary).filter(ExerciseLibrary.name == name).first()
        muscle_group = _normalize_muscle_group(item.get("body_part") or item.get("muscle_group") or "")
        equipment = item.get("equipment")
        image = item.get("image") or ""
        gif = item.get("gif_url") or ""
        image_url = f"https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/{image}" if image else None
        gif_url = f"https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/{gif}" if gif else None
        if existing:
            changed = False
            if muscle_group and existing.muscle_group != muscle_group:
                existing.muscle_group = muscle_group
                changed = True
            if equipment is not None and existing.equipment != equipment:
                existing.equipment = equipment
                changed = True
            if image_url and existing.image_url != image_url:
                existing.image_url = image_url
                changed = True
            if gif_url and existing.gif_url != gif_url:
                existing.gif_url = gif_url
                changed = True
            if changed:
                synced += 1
            continue
        db.add(ExerciseLibrary(
            name=name,
            muscle_group=muscle_group,
            equipment=equipment,
            default_rest_seconds=90,
            image_url=image_url,
            gif_url=gif_url,
        ))
        synced += 1
    db.commit()
    return {"synced": synced}

# --- Sessions ---

@app.post("/api/sessions", response_model=SessionOut)
def create_session(payload: SessionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    session = WorkoutSession(
        user_id=current_user.id,
        template_id=payload.template_id,
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
    sessions = db.query(WorkoutSession).filter(WorkoutSession.user_id == current_user.id).order_by(WorkoutSession.started_at.desc()).limit(50).all()
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
    s.ended_at = datetime.utcnow()
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
    if payload.actual_reps is not None:
        log.actual_reps = payload.actual_reps
    if payload.effort is not None:
        log.effort = payload.effort
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
            date=log.completed_at.isoformat(),
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
    points = [
        ExerciseProgressPoint(
            date=log.completed_at.isoformat(),
            weight=float(log.actual_weight or 0),
            reps=int(log.actual_reps or 0),
        )
        for log in reversed(logs)
    ]
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
                "started_at": session.started_at.isoformat(),
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
    today = datetime.utcnow().date()
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
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Bench Press"), name="Bench Press", sets_target=4, reps_target=10, start_weight=135, rest_seconds=120, order=0, user_id=current_user.id),
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Incline Dumbbell Press"), name="Incline Dumbbell Press", sets_target=3, reps_target=10, start_weight=40, rest_seconds=90, order=1, user_id=current_user.id),
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Cable Flyes"), name="Cable Flyes", sets_target=3, reps_target=15, start_weight=20, rest_seconds=75, order=2, user_id=current_user.id),
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Overhead Press"), name="Overhead Press", sets_target=3, reps_target=8, start_weight=65, rest_seconds=120, order=3, user_id=current_user.id),
            ExerciseEntry(template_id=tpl.id, exercise_library_id=next(x.id for x in db.query(ExerciseLibrary).all() if x.name=="Tricep Pushdown"), name="Tricep Pushdown", sets_target=3, reps_target=12, start_weight=30, rest_seconds=60, order=4, user_id=current_user.id),
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
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Back Squat", muscle_group="Legs", equipment="Barbell", sets_target=5, reps_target=5, start_weight=135, rest_seconds=150, order=0),
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Bench Press", muscle_group="Chest", equipment="Barbell", sets_target=5, reps_target=5, start_weight=95, rest_seconds=120, order=1),
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Overhead Press", muscle_group="Shoulders", equipment="Barbell", sets_target=5, reps_target=5, start_weight=65, rest_seconds=120, order=2),
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Barbell Row", muscle_group="Back", equipment="Barbell", sets_target=5, reps_target=5, start_weight=115, rest_seconds=120, order=3),
            WorkoutLibraryExercise(workout_library_id=stronglifts.id, name="Deadlift", muscle_group="Back", equipment="Barbell", sets_target=1, reps_target=5, start_weight=185, rest_seconds=180, order=4),
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
    print(f"[settings] GET /api/settings/{key} user={current_user.id}")
    s = db.query(AppSetting).filter(AppSetting.key == key, AppSetting.user_id == current_user.id).first()
    return SettingOut(key=key, value=s.value if s else None)

@app.put("/api/settings/{key}", response_model=SettingOut)
def put_setting(key: str, payload: SettingOut, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    print(f"[settings] PUT /api/settings/{key} user={current_user.id} value={payload.value!r}")
    s = db.query(AppSetting).filter(AppSetting.key == key, AppSetting.user_id == current_user.id).first()
    if not s:
        s = AppSetting(key=key, value=payload.value, user_id=current_user.id)
        db.add(s)
    else:
        s.value = payload.value
    db.commit()
    db.refresh(s)
    return SettingOut(key=s.key, value=s.value)

@app.get("/api/settings", response_model=List[SettingOut])
def list_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_dep)):
    print(f"[settings] GET /api/settings user={current_user.id}")
    settings = db.query(AppSetting).filter(AppSetting.user_id == current_user.id).all()
    return [SettingOut(key=s.key, value=s.value) for s in settings]

# --- Helpers ---

def _template_out(tpl: WorkoutTemplate) -> WorkoutTemplateOut:
    exercises = sorted(tpl.exercises or [], key=lambda e: e.order)
    return WorkoutTemplateOut(
        id=tpl.id,
        context_id=tpl.context_id,
        name=tpl.name,
        type=tpl.type.value,
        order=tpl.order,
        default_rest_seconds=tpl.default_rest_seconds,
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
