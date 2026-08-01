"""Tests for /api/rules/next-prescription side effects and deterministic behavior.

Covers:
- AlgorithmState row creation on first call with exercise_entry_id
- AlgorithmState row update on subsequent calls
- ProgressionTransition row creation when phase changes
- No ProgressionTransition when phase stays the same
- Deterministic output: identical inputs -> identical responses
- Deterministic output: different RPE/RIR inputs -> different responses
"""
from __future__ import annotations

import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from fastapi.testclient import TestClient

from models import Base as ModelsBase, AlgorithmState, ProgressionTransition
from main import app, get_db
import db as db_module


# ---------------------------------------------------------------------------
# Test database: in-memory SQLite shared across the session via StaticPool
# ---------------------------------------------------------------------------
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)

# Patch db.engine so init_db() (called on startup) creates tables in test engine
db_module.engine = test_engine

# Also patch main.SessionLocal so get_db() uses the test engine when overrides
# are not in place (e.g. for fixtures that call the API before per-test setup).
import main as main_module
main_module.SessionLocal = TestSessionLocal

# Create all tables in the in-memory database
ModelsBase.metadata.create_all(bind=test_engine)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def client():
    """Session-scoped TestClient with global test-DB dependency override."""
    # Global override so EVERY request uses the test DB
    def _global_test_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _global_test_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(scope="session")
def user(client):
    """Create a test user once per session and return (user_id, headers)."""
    email = "test_prescription@example.com"
    password = "testpass123"
    resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Signup failed: {resp.text}"
    data = resp.json()
    return data["user"]["id"], {"Authorization": f"Bearer {data['token']}"}


@pytest.fixture
def test_session():
    """Fresh SQLAlchemy session for direct DB assertions."""
    session = TestSessionLocal()
    yield session
    session.close()


@pytest.fixture
def exercise_entry(client, user):
    """Create context -> template -> exercise entry. Return exercise_entry_id."""
    user_id, headers = user
    ts = datetime.utcnow().timestamp()

    # Context
    ctx_resp = client.post("/api/contexts", json={
        "name": f"Test Context {ts}",
        "description": "Prescription test context",
        "equipment_tags": ["barbell"],
        "default_rest_seconds": 90,
        "order": 0,
    }, headers=headers)
    assert ctx_resp.status_code == 200, f"Context creation failed: {ctx_resp.text}"
    context_id = ctx_resp.json()["id"]

    # Template
    tpl_resp = client.post("/api/templates", json={
        "context_id": context_id,
        "name": f"Test Template {ts}",
        "type": "strength",
        "order": 0,
        "default_rest_seconds": 90,
    }, headers=headers)
    assert tpl_resp.status_code == 200, f"Template creation failed: {tpl_resp.text}"
    template_id = tpl_resp.json()["id"]

    # Exercise entry
    ex_resp = client.post("/api/exercises", json={
        "template_id": template_id,
        "name": "Bench Press",
        "sets_target": 3,
        "reps_target": 10,
        "start_weight": 100.0,
        "rest_seconds": 90,
        "order": 0,
    }, headers=headers)
    assert ex_resp.status_code == 200, f"Exercise creation failed: {ex_resp.text}"
    return ex_resp.json()["id"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _call_next_prescription(client, test_session, user_id, headers, **overrides):
    """Call /api/rules/next-prescription with a shared test session.

    The override dict may contain any RuleRequestIn fields.
    """
    payload = {
        "start_weight": 100.0,
        "reps_target": 10,
        "sets_target": 3,
        "rest_seconds": 90,
        "progression_type": "linear",
        "exercise_entry_id": overrides.pop("exercise_entry_id"),
        "week": overrides.pop("week", 1),
        "current_phase": overrides.pop("current_phase", "linear"),
        "current_week_in_block": overrides.pop("current_week_in_block", 1),
        "history": overrides.pop("history", []),
    }
    payload.update(overrides)

    def _override_get_db():
        try:
            yield test_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    try:
        resp = client.post("/api/rules/next-prescription", json=payload, headers=headers)
    finally:
        app.dependency_overrides.pop(get_db, None)

    return resp


# ---------------------------------------------------------------------------
# Side-effect tests
# ---------------------------------------------------------------------------

def test_creates_algorithm_state(client, test_session, user, exercise_entry):
    """First call with exercise_entry_id must create an AlgorithmState row."""
    user_id, headers = user

    payload = {
        "exercise_entry_id": exercise_entry,
        "week": 1,
        "current_phase": "linear",
        "current_week_in_block": 1,
        "history": [],
    }
    resp = _call_next_prescription(client, test_session, user_id, headers, **payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["next_weight"] == 100.0
    assert data["coach"]["phase"] == "linear"

    state = (
        test_session.query(AlgorithmState)
        .filter(
            AlgorithmState.user_id == user_id,
            AlgorithmState.exercise_entry_id == exercise_entry,
        )
        .first()
    )
    assert state is not None, "AlgorithmState row was not created"
    # compute_coach_state advances week_in_block by 1 when still inside the block
    assert state.current_week == 2
    assert state.last_suggested_weight == 100.0
    assert state.last_suggested_reps == 10
    assert state.progression_type == "linear"


def test_updates_existing_algorithm_state(client, test_session, user, exercise_entry):
    """A second call with the same exercise_entry_id must UPDATE the row, not insert."""
    user_id, headers = user

    # First call – establishes state
    payload1 = {
        "exercise_entry_id": exercise_entry,
        "week": 1,
        "current_phase": "linear",
        "current_week_in_block": 1,
        "history": [],
    }
    resp1 = _call_next_prescription(client, test_session, user_id, headers, **payload1)
    assert resp1.status_code == 200

    # Second call – with history so we can verify updated weight
    payload2 = {
        "exercise_entry_id": exercise_entry,
        "week": 2,
        "current_phase": "linear",
        "current_week_in_block": 2,
        "history": [
            {
                "actual_weight": 100.0,
                "actual_reps": 10,
                "effort": 3,
                "is_seeded": False,
                "completed_at": datetime.utcnow().isoformat(),
            }
        ],
    }
    resp2 = _call_next_prescription(client, test_session, user_id, headers, **payload2)
    assert resp2.status_code == 200

    states = (
        test_session.query(AlgorithmState)
        .filter(
            AlgorithmState.user_id == user_id,
            AlgorithmState.exercise_entry_id == exercise_entry,
        )
        .all()
    )
    assert len(states) == 1, "Expected exactly one AlgorithmState row"
    state = states[0]
    # week_in_block advances by 1 each call while still inside the block
    assert state.current_week == 3
    # linear rule: 100 lbs + 2.5 lbs increment = 102.5
    assert state.last_suggested_weight == 102.5
    assert state.last_suggested_reps == 10
    assert state.progression_type == "linear"


def test_logs_progression_transition_on_phase_change(client, test_session, user, exercise_entry):
    """A phase change must produce exactly one ProgressionTransition row."""
    user_id, headers = user

    # First call – lock phase in "linear" at week 1
    payload1 = {
        "exercise_entry_id": exercise_entry,
        "week": 1,
        "current_phase": "linear",
        "current_week_in_block": 1,
        "history": [],
        "periodization_cycle_weeks": 0,
    }
    resp1 = _call_next_prescription(client, test_session, user_id, headers, **payload1)
    assert resp1.status_code == 200

    db_state = (
        test_session.query(AlgorithmState)
        .filter(
            AlgorithmState.user_id == user_id,
            AlgorithmState.exercise_entry_id == exercise_entry,
        )
        .first()
    )
    assert db_state.progression_type == "linear"

    # Second call – week=4 triggers transition to "double" (linear block duration = 4)
    payload2 = {
        "exercise_entry_id": exercise_entry,
        "week": 4,
        "current_phase": "linear",
        "current_week_in_block": 4,
        "history": [],
        "periodization_cycle_weeks": 0,
    }
    resp2 = _call_next_prescription(client, test_session, user_id, headers, **payload2)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["coach"]["phase"] == "double"

    transitions = (
        test_session.query(ProgressionTransition)
        .filter(
            ProgressionTransition.user_id == user_id,
            ProgressionTransition.exercise_entry_id == exercise_entry,
        )
        .all()
    )
    assert len(transitions) == 1
    t = transitions[0]
    assert t.from_phase == "linear"
    assert t.to_phase == "double"
    assert t.week_in_block == 1  # resets on transition
    assert t.reason == "best_fit"


def test_no_transition_when_phase_unchanged(client, test_session, user, exercise_entry):
    """When the phase does not change, no ProgressionTransition should be created."""
    user_id, headers = user

    # First call
    payload1 = {
        "exercise_entry_id": exercise_entry,
        "week": 1,
        "current_phase": "linear",
        "current_week_in_block": 1,
        "history": [],
    }
    _call_next_prescription(client, test_session, user_id, headers, **payload1)

    # Second call – week=2 stays inside the same block
    payload2 = {
        "exercise_entry_id": exercise_entry,
        "week": 2,
        "current_phase": "linear",
        "current_week_in_block": 2,
        "history": [],
    }
    _call_next_prescription(client, test_session, user_id, headers, **payload2)

    transitions = (
        test_session.query(ProgressionTransition)
        .filter(
            ProgressionTransition.user_id == user_id,
            ProgressionTransition.exercise_entry_id == exercise_entry,
        )
        .all()
    )
    assert len(transitions) == 0, "No transition should be logged when phase is unchanged"


# ---------------------------------------------------------------------------
# Deterministic-behavior tests
# ---------------------------------------------------------------------------

def test_deterministic_identical_inputs(client, test_session, user, exercise_entry):
    """Two identical payloads must produce byte-for-byte identical responses."""
    user_id, headers = user
    now = datetime.utcnow().isoformat()

    payload = {
        "exercise_entry_id": exercise_entry,
        "progression_type": "autoregulated",
        "history": [
            {
                "actual_weight": 100.0,
                "actual_reps": 10,
                "effort": 2,
                "rir": 2,
                "is_seeded": False,
                "completed_at": now,
            }
        ],
    }

    resp1 = _call_next_prescription(client, test_session, user_id, headers, **payload)
    resp2 = _call_next_prescription(client, test_session, user_id, headers, **payload)

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json() == resp2.json()


def test_deterministic_different_rpe_rir(client, test_session, user, exercise_entry):
    """Changing RPE/RIR in history must produce a different prescription."""
    user_id, headers = user
    now = datetime.utcnow().isoformat()

    payload_easy = {
        "exercise_entry_id": exercise_entry,
        "progression_type": "autoregulated",
        "history": [
            {
                "actual_weight": 100.0,
                "actual_reps": 10,
                "effort": 2,
                "rir": 2,
                "is_seeded": False,
                "completed_at": now,
            }
        ],
    }

    payload_hard = {
        "exercise_entry_id": exercise_entry,
        "progression_type": "autoregulated",
        "history": [
            {
                "actual_weight": 100.0,
                "actual_reps": 10,
                "effort": 4,
                "rir": 0,
                "is_seeded": False,
                "completed_at": now,
            }
        ],
    }

    resp_easy = _call_next_prescription(client, test_session, user_id, headers, **payload_easy)
    resp_hard = _call_next_prescription(client, test_session, user_id, headers, **payload_hard)

    assert resp_easy.status_code == 200
    assert resp_hard.status_code == 200

    data_easy = resp_easy.json()
    data_hard = resp_hard.json()

    assert data_easy["next_weight"] != data_hard["next_weight"], (
        f"Expected different weights for easy vs hard RPE/RIR, "
        f"got {data_easy['next_weight']} vs {data_hard['next_weight']}"
    )
    assert data_easy["workload_status"] != data_hard["workload_status"]
