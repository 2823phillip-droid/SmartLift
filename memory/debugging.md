---
last_updated: 2026-08-06
created: 2026-07-31
tags: [debugging, ios, wkwebview, capacitor, cors, safari-web-inspector, device]
related: Askeo.md, deploy.md, auth.md, frontend-fetch.md
---

# Debugging: iOS, WKWebView, CORS

## Origin mismatch
- iOS WebView sends either `capacitor://localhost` or `ionic://localhost` as Origin header.
- Backend `CORSMiddleware(allow_origins=[...])` must include both.
- `ionic://localhost` is NOT matched by regex `^https?://.*$`
- If Origin is rejected, WKWebView drops the entire response and surfaces as `TypeError: Load failed`.

## Network tab triage
- First failed request tells you the real failure mode:
  - `200 OPTIONS` but `500 GET` = backend query error
  - `500 GET` with WKWebView CORS message = fetch failed for non-CORS reason
  - `401 GET` = missing/invalid Authorization header
  - `Fetch error with no response` = timeout or AbortController cutoff
- Safari Web Inspector Console only shows `TypeError: Load failed` — real HTTP status is in Network tab.

## WKWebView cache
- Caches the first `index-<hash>.js` bundle it sees.
- Changing `index.html` pointer is NOT enough to invalidate cache.
- Clear by **full app uninstall from device**, reinstall, launch once.
- Xcode clean build folder is insufficient.

## Backend 500 vs CORS confusion
- SQLAlchemy `ProgrammingError` on a query path surfaces as 500.
- WKWebView often reports 500 as CORS-style failure.
- Always check Fly logs: `fly logs -a smartlift-api --no-tail`

## AbortController timeout
- Production value is 30000ms (30s).
- Short timeouts cause load failures during cold backend starts.
- Do NOT lower without explicit device cold-start testing.

## Device verification pattern

Before asking the user to debug on device, verify from Linux first:
1. Run curl with the device Origin header to isolate backend/CORS issues:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -H "Origin: ionic://localhost" \
     https://askeo.fit/api/healthz
   ```
2. Check backend logs for 500 root cause before blaming iOS.
3. Only ask user to open Safari Web Inspector when Linux-side checks pass and the issue is device-specific.
4. Use `macbook` SSH alias for all MacBook operations; never use raw IP.

## IP management

- MacBook IP: `192.168.1.112` (DHCP-reserved, set in `~/.ssh/config` under `Host macbook`)
- Linux server: `192.168.1.111`
- Never store raw IPs in Hermes memory or project docs — always use the `macbook` SSH alias.
- When the MacBook IP changes, update only `~/.ssh/config`.

## Change log
- 2026-07-31 — Created from Workouts tab load failure investigation
- 2026-08-06 — Added device verification pattern and IP management rules
