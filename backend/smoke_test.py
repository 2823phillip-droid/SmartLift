import urllib.request, json, sys

BASE = "http://127.0.0.1:8000/api"
EMAIL = "phillip@askeo.fit"
PASSWORD = "AskeoAdmin2026!"

def post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    return resp.status, json.loads(resp.read().decode())

def get(path, token):
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"})
    resp = urllib.request.urlopen(req)
    return resp.status, json.loads(resp.read().decode())

def put(path, token, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}, method="PUT")
    resp = urllib.request.urlopen(req)
    return resp.status, json.loads(resp.read().decode())

def main():
    failures = []
    try:
        print("1) login")
        code, login = post("/auth/login", {"email": EMAIL, "password": PASSWORD})
        assert code == 200, f"login status {code}"
        token = login["token"]
        user = login["user"]
        assert user["email"] == EMAIL
        print("   login ok")

        print("2) me")
        code, me = get("/auth/me", token)
        assert code == 200 and me["email"] == EMAIL
        print("   me ok")

        print("3) list settings")
        code, settings = get("/settings", token)
        assert code == 200 and isinstance(settings, list)
        print(f"   settings count={len(settings)}")

        print("4) set setting")
        code, updated = put("/settings/smoke_test_key", token, {"key": "smoke_test_key", "value": "1"})
        assert code == 200 and updated["value"] == "1"
        print("   set ok")

        print("5) get setting")
        code, single = get("/settings/smoke_test_key", token)
        assert code == 200 and single["value"] == "1"
        print("   get ok")

        print("6) update setting")
        code, updated = put("/settings/smoke_test_key", token, {"key": "smoke_test_key", "value": "2"})
        assert code == 200 and updated["value"] == "2"
        print("   update ok")

    except Exception as e:
        failures.append(str(e))
        print("FAILED:", e)

    if failures:
        print(f"\nSmoke test failed ({len(failures)} failure(s))")
        sys.exit(1)
    print("\nSmoke test passed")

if __name__ == "__main__":
    main()
