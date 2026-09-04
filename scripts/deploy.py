#!/usr/bin/env python3
import subprocess, os, sys, time

MAC = "phillipwalters@192.168.1.112"
REPO_MAC = "/Users/phillipwalters/workout-logger"
APP = "smartlift-api"
SSH_BASE = ["ssh", "-o", "StrictHostKeyChecking=no", MAC]


def run_remote(cmd, check=True, workdir=None):
    if workdir:
        cmd = f"cd {workdir} && {cmd}"
    print(f"+ {cmd}")
    r = subprocess.run(SSH_BASE + [cmd], capture_output=True, text=True)
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
    # Run tests from Linux copy to avoid broken Mac venv symlinks
    print("==> Pre-flight: pytest on Linux")
    subprocess.run([sys.executable, "-m", "pytest", "backend/tests/", "-q"], check=True)

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
    deploy_cmd = f"cd {REPO_MAC}/backend && ~/.fly/bin/fly deploy --app {APP}"
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

    print("==> Smoke test")
    c = subprocess.run(["curl", "-sk", f"https://{APP}.fly.dev/api/coach/health"], capture_output=True, text=True)
    if '"llm_available":true' not in c.stdout:
        print("Coach health failed")
        run_remote(f"cd {REPO_MAC} && git checkout {prev} && cd backend && ~/.fly/bin/fly deploy --app {APP}", check=False)
        sys.exit(1)

    print("==> Syncing iOS")
    run_remote("git pull origin master && npm run build && npx cap sync ios", workdir=REPO_MAC)

    print("==> Deploy complete")


if __name__ == "__main__":
    main()
