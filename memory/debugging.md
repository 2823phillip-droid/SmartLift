# Debugging: iOS, WKWebView, CORS

last_updated: 2026-07-31
created: 2026-07-31
tags: [debugging, ios, wkwebview, capacitor, cors, safari-web-inspector]
related: SMARTLIFT.md, deploy.md, auth.md, frontend-fetch.md

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

## Change log
- 2026-07-31 — Created from Workouts tab load failure investigation
