#!/usr/bin/env python3
import subprocess, os, sys, time
from datetime import datetime, timezone

MAC = "phillipwalters@192.168.1.112"
REPO_MAC = "/Users/phillipwalters/workout-logger"
APP = "smartlift-api"
SSH_BASE = ["ssh", "-o", "StrictHostKeyChecking=no", MAC]


def run_remote(cmd, check=True, workdir=None):
    if workdir:
        cmd = f"cd {workdir} && {cmd}"
    # Ensure fly and other tools are on PATH for non-interactive shells
    full_cmd = f"export PATH=\"$PATH:/opt/homebrew/bin:/opt/homebrew/Cellar/node/26.7.0/bin:$HOME/.fly/bin\" && {cmd}"
    print(f"+ {full_cmd}")
    r = subprocess.run(SSH_BASE + [full_cmd], capture_output=True, text=True)
    if r.stdout:
        print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="", file=sys.stderr)
    if check and r.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}")
    return r


def main():
    print("==> Pre-flight: git status")
    run_remote("git status --porcelain", workdir=REPO_MAC)
    print("==> Pre-flight: validate ORM models load + queryable")
    venv_python = os.path.join(os.path.dirname(__file__), "..", ".venv", "bin", "python")
    validate = subprocess.run(
        [venv_python, "-c",
         "import sys; sys.path.insert(0, 'backend'); "
         "from models import Base; "
         "from db import SessionLocal, init_db; "
         "engine = SessionLocal().get_bind(); "
         "Base.metadata.create_all(bind=engine); "
         "print('ORM OK')"],
        capture_output=True, text=True, cwd="backend"
    )
    print(validate.stdout, end="" if validate.returncode == 0 else "\n", file=sys.stderr)
    if validate.returncode != 0:
        print("ORM validation failed")
        print(validate.stderr, file=sys.stderr)
        sys.exit(1)

    print("==> Backing up Postgres via Fly proxy")
    db_url_raw = run_remote("fly ssh console -C 'printenv DATABASE_URL'", workdir=REPO_MAC).stdout.strip()
    # Parse DSN without urlparse to avoid surprises
    # Format: postgresql://USER:PASS@HOST/DB
    try:
        rest = db_url_raw.split("://", 1)[1]
        user_pass, rest = rest.split("@", 1)
        user = user_pass.split(":")[0]
        passwd = user_pass.split(":")[1] if ":" in user_pass else ""
        db = rest.split("?")[0]
    except Exception as e:
        raise RuntimeError(f"Failed to parse DATABASE_URL: {db_url_raw!r}: {e}")

    proxy = subprocess.Popen(
        SSH_BASE + ["fly", "proxy", "5432:5432", "pgbouncer.9g6y30wgzj9rv5ml.flympg.net", "-a", APP],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    time.sleep(3)
    try:
        dump_cmd = f"PGPASSWORD='{passwd}' pg_dump -h 127.0.0.1 -U '{user}' -d '{db}'"
        run_remote(dump_cmd, workdir=REPO_MAC, check=False)
    finally:
        proxy.terminate()
        try:
            proxy.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proxy.kill()

    print("==> Pushing code")
    run_remote("git add -A && git commit -m 'deploy: auto' || true", workdir=REPO_MAC)
    run_remote("git push origin master", workdir=REPO_MAC)

    prev = run_remote("git rev-parse HEAD", workdir=REPO_MAC).stdout.strip()
    print(f"Previous commit: {prev}")

    print("==> Deploying backend")
    # Inject build-info.json into the Docker context so the /api/version endpoint
    # can report the exact commit that's deployed. Written to backend/ so the
    # Dockerfile's COPY backend/ ./ picks it up.
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    run_remote(
        "cat > backend/build-info.json <<'JSONEOF'\n"
        '{"commit": "' + prev + '", "timestamp": "' + now_utc + '"}\n'
        "JSONEOF",
        workdir=REPO_MAC,
        check=False,
    )
    run_remote("git add backend/build-info.json && git commit -m 'deploy: version info' || true", workdir=REPO_MAC)
    deploy_cmd = "cd " + REPO_MAC + " && ~/.fly/bin/fly deploy --app " + APP
    deploy = subprocess.run(SSH_BASE + [deploy_cmd], capture_output=True, text=True)
    print(deploy.stdout, end="")
    if deploy.stderr:
        print(deploy.stderr, end="", file=sys.stderr)
    if deploy.returncode != 0:
        print("Deploy failed, rolling back...")
        run_remote(f"cd {REPO_MAC} && git checkout {prev} && cd backend && ~/.fly/bin/fly deploy --app {APP}", check=False)
        sys.exit(1)

    print("==> Health check")
    healthy = False
    for i in range(30):
        h = subprocess.run(["curl", "-sk", f"https://{APP}.fly.dev/healthz"], capture_output=True, text=True)
        if '"status":"ok"' in h.stdout:
            print("Health OK")
            healthy = True
            break
        time.sleep(5)
    if not healthy:
        print("Health check failed")
        run_remote(f"cd {REPO_MAC} && git checkout {prev} && cd backend && ~/.fly/bin/fly deploy --app {APP}", check=False)
        sys.exit(1)

    print("==> Smoke test (DB-touching endpoints)")
    smoke_ok = False
    endpoints = [
        ("POST", "/api/auth/login", '{"email":"smoke-test@askeo.local","password":"wrong"}'),
        ("GET", "/healthz", None),
    ]
    for method, path, body in endpoints:
        headers = {"Content-Type": "application/json"} if body else {}
        cmd = ["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}"]
        if method == "POST":
            cmd += ["-X", "POST", "-H", "Content-Type: application/json", "-d", body]
        cmd += [f"https://{APP}.fly.dev{path}"]
        c = subprocess.run(cmd, capture_output=True, text=True)
        code = c.stdout.strip()
        print(f"  {method} {path} -> {code}")
        if code == "500":
            print(f"  !! {path} returned 500 — deploy broken, rolling back")
            run_remote(f"cd {REPO_MAC} && git checkout {prev} && cd backend && ~/.fly/bin/fly deploy --app {APP}", check=False)
            sys.exit(1)
        if code == "401" and path == "/api/auth/login":
            smoke_ok = True  # 401 is correct for bad creds — means ORM is working
    if not smoke_ok:
        print("Smoke test failed — login endpoint did not return expected 401")
        run_remote(f"cd {REPO_MAC} && git checkout {prev} && cd backend && ~/.fly/bin/fly deploy --app {APP}", check=False)
        sys.exit(1)

    print("==> Syncing iOS")
    # Generate frontend/src/build-info.ts on the Mac so the built JS bundle
    # carries the exact deploy commit. The Settings screen reads BUILD_INFO
    # to show a version badge (commit short hash + timestamp).
    run_remote(
        "test -f scripts/build-version.py || "
        "cat > scripts/build-version.py <<'PYEOF'"
        "#!/usr/bin/env python3"
        "from __future__ import annotations"
        "import json, subprocess, sys"
        "from datetime import datetime, timezone"
        "from pathlib import Path"
        "REPO = Path('/Users/phillipwalters/workout-logger')"
        "OUT = REPO / 'frontend' / 'src' / 'build-info.ts'"
        "def git_sha():"
        "    try:"
        "        return subprocess.check_output(['git','rev-parse','HEAD'], cwd=REPO, stderr=subprocess.DEVNULL).decode().strip()"
        "    except subprocess.CalledProcessError:"
        "        return 'unknown'"
        "def main():"
        "    commit = git_sha()"
        "    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')"
        "    short = commit[:7] if len(commit) >= 7 else commit"
        "    content = json.dumps({'commit': commit, 'short': short, 'timestamp': now}, indent=2)"
        "    module = ('''// Auto-generated by build-version.py - do not edit
// Commit {short} / {now} UTC

export const BUILD_INFO = {content};
')

        "    OUT.write_text(module)"
        "    print(f'Wrote {OUT}  commit={short}  timestamp={now}')""
        "if __name__ == '__main__':"
        "    main()"
        "PYEOF",
        workdir=REPO_MAC,
        check=False,
    )
    run_remote(
        "python3 scripts/build-version.py && "
        "git pull origin master && "
        "npm run build && "
        "npx cap sync ios",
        workdir=REPO_MAC,
    )
    print("==> Deploy complete")


if __name__ == "__main__":
    main()
