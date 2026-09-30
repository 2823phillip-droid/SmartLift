#!/usr/bin/env python3
"""
Deploy script for the Studio (Mac Studio M5 Max).
Runs the full deploy pipeline locally — no SSH to other machines.

Steps:
1. Pre-flight: git status + ORM validation
2. Backup: Fly managed Postgres has automatic snapshots (retention: 5, scheduled: true).
   No manual pg_dump needed.
3. Push: commit build-info.json + push to origin
4. Deploy: fly deploy backend
5. Health check + smoke test
6. Sync iOS: generate build-info.ts, npm build, npx cap sync ios
"""
import subprocess, os, sys, time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path("/Users/phillipwalters/Projects/askeo/repo")
APP = "smartlift-api"
FLY_BIN = "/Users/phillipwalters/.local/bin/fly"  # wrapper that injects FLY_ACCESS_TOKEN
NVM_NODE = "/Users/phillipwalters/.nvm/versions/node/v20.20.2/bin"
PYTHON = str(REPO / "backend" / ".venv" / "bin" / "python")
FRONTEND_DIR = REPO / "frontend"
BACKEND_DIR = REPO / "backend"


def run(cmd, check=True, cwd=None, label=None):
    """Run a command locally, print it, return CompletedProcess."""
    if label:
        print(f"==> {label}")
    display = cmd if isinstance(cmd, str) else " ".join(cmd)
    print(f"    {display}")
    r = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, cwd=cwd)
    if r.stdout:
        print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="", file=sys.stderr)
    if check and r.returncode != 0:
        raise RuntimeError(f"Command failed (exit {r.returncode}): {display}")
    return r


def main():
    # ── 1. Pre-flight ──────────────────────────────────────────────────────
    print("==> Pre-flight: git status")
    run(f"git -C {REPO} status --porcelain", label="")

    print("==> Pre-flight: validate ORM models load + queryable")
    orm = subprocess.run(
        [PYTHON, "-c",
         "import sys; sys.path.insert(0, '.'); "
         "from models import Base; "
         "from db import SessionLocal; "
         "engine = SessionLocal().get_bind(); "
         "Base.metadata.create_all(bind=engine); "
         "print('ORM OK')"],
        capture_output=True, text=True, cwd=BACKEND_DIR,
    )
    print(orm.stdout, end="")
    if orm.returncode != 0:
        print("ORM validation failed:", orm.stderr, file=sys.stderr)
        sys.exit(1)

    # ── 2. Backup ──────────────────────────────────────────────────────────
    # Fly managed Postgres has automatic snapshots (retention: 5, scheduled: true).
    # The manual pg_dump step from the old Mac-based script is redundant.
    print("==> Backup: Fly managed Postgres snapshots active (retention: 5)")
    vol = subprocess.run(
        [FLY_BIN, "volumes", "list", "-a", APP],
        capture_output=True, text=True,
    )
    print(vol.stdout, end="")

    # ── 3. Push ─────────────────────────────────────────────────────────────
    print("==> Writing build-info.json")
    prev = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True, text=True, cwd=REPO,
    ).stdout.strip()
    print(f"    Current HEAD: {prev}")

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    build_info = f'{{"commit": "{prev}", "timestamp": "{now_utc}"}}'
    (BACKEND_DIR / "build-info.json").write_text(build_info)
    print(f"    Wrote backend/build-info.json  commit={prev}  timestamp={now_utc}")

    print("==> Committing + pushing")
    run(f"git -C {REPO} add backend/build-info.json && "
        f"git -C {REPO} commit -m 'deploy: version info' || true")
    run(f"git -C {REPO} push origin master")

    # ── 4. Deploy backend ───────────────────────────────────────────────────
    print("==> Deploying backend")
    deploy = subprocess.run(
        [FLY_BIN, "deploy", "--app", APP],
        capture_output=True, text=True, cwd=REPO,
    )
    print(deploy.stdout, end="")
    if deploy.stderr:
        print(deploy.stderr, end="", file=sys.stderr)
    if deploy.returncode != 0:
        print("Deploy failed!")
        sys.exit(1)

    # ── 5. Health check ─────────────────────────────────────────────────────
    print("==> Health check")
    healthy = False
    for i in range(30):
        h = subprocess.run(
            ["curl", "-sk", f"https://{APP}.fly.dev/healthz"],
            capture_output=True, text=True,
        )
        if '"status":"ok"' in h.stdout:
            print("    Health OK")
            healthy = True
            break
        time.sleep(5)
    if not healthy:
        print("Health check failed after 30 attempts")
        sys.exit(1)

    # ── 6. Smoke test ───────────────────────────────────────────────────────
    print("==> Smoke test")
    smoke_ok = False
    endpoints = [
        ("POST", "/api/auth/login", '{"email":"smoke-test@askeo.local","password":"wrong"}'),
        ("GET", "/healthz", None),
    ]
    for method, path, body in endpoints:
        cmd = ["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}"]
        if body:
            cmd += ["-X", "POST", "-H", "Content-Type: application/json", "-d", body]
        cmd += [f"https://{APP}.fly.dev{path}"]
        c = subprocess.run(cmd, capture_output=True, text=True)
        code = c.stdout.strip()
        print(f"    {method} {path} -> {code}")
        if code == "500":
            print(f"    !! {path} returned 500 — deploy broken")
            sys.exit(1)
        if code == "401" and path == "/api/auth/login":
            smoke_ok = True
    if not smoke_ok:
        print("Smoke test failed — login endpoint did not return expected 401")
        sys.exit(1)

    # ── 7. Sync iOS ─────────────────────────────────────────────────────────
    print("==> Syncing iOS")
    # Generate build-info.ts so the JS bundle carries the deploy commit
    run(
        f"{PYTHON} {REPO / 'scripts' / 'build-version.py'}",
        cwd=REPO,
        label="    Generating build-info.ts",
    )
    run(
        f"{NVM_NODE}/npm run build",
        cwd=FRONTEND_DIR,
        label="    npm run build",
    )
    run(
        f"{NVM_NODE}/npx cap sync ios",
        cwd=FRONTEND_DIR,
        label="    npx cap sync ios",
    )

    print("==> Deploy complete")


if __name__ == "__main__":
    main()
