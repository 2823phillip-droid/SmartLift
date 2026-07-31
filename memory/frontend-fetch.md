# Frontend Fetch: api.ts, retry, timeout

last_updated: 2026-07-31
created: 2026-07-31
tags: [frontend, fetch, api.ts, retry, timeout, aborted, error-handling]
related: debugging.md, deploy.md, SMARTLIFT.md

## request() flow
1. `makeRequest(attemptBase)` builds fetch with headers + AbortController
2. `refreshAndRetry(err)` handles 401/403 by refreshing token and retrying once
3. `isProductionDefault` fallback: if default `FLY_DEFAULT` fails, calls `initApiBaseFromSettings()` to try stored backend URL
4. `initApiBaseFromSettings` tries `/healthz` directly, then falls back to stored setting `/settings/api_base`

## Timeout rule
- Production AbortController timeout: **30000ms (30s)**.
- Short timevals cause load failures on cold backend starts.
- Do NOT lower without device cold-start testing.

## Error handling
- Non-ok responses throw `API error {status}: {text}` with `.url` and `.status` attached.
- Global console interceptor in `main.tsx` captures errors to `localStorage['smartlift_error_log']`.
- Same capture layer handles `window.onerror` and `unhandledrejection`.

## WKWebView gotcha
- `TypeError: Load failed` from fetch often means backend 500/CORS, not network denial.
- Real HTTP status is in Network tab; Console only shows message.

## Change log
- 2026-07-31 — Created from api.ts audit
