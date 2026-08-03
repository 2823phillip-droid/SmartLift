# Auth: JWT, Token Persistence, Refresh

last_updated: 2026-07-31
created: 2026-07-31
tags: [auth, jwt, token, refresh, 401, ios]
related: api.ts, debugging.md, Askeo.md

## Token storage
- Login stores JWT in `localStorage.setItem("askeo_token", token)`.
- `api.ts` reads it on startup from `localStorage` and sets module-level `authToken`.
- If `askeo_token` is stale, 401s persist across app restarts.
- Fix: logout via `N.logout()`, remove `askeo_token`, then login fresh.

## Backend auth endpoints
- `POST /api/auth/login` — returns `{ token, user }`
- `POST /api/auth/signup` — same
- `POST /api/auth/refresh` — mint new access token
- `GET /api/auth/me` — validate token, return user

## Frontend refresh logic in api.ts
- Any `401` or `403` triggers `refreshToken()` then retries once.
- If refresh fails, token is cleared client-side and user is sent to login.
- `isAuthPath` guard prevents refresh on auth endpoints themselves.

## 401 triage on device
- Check Safari Web Inspector Network tab for actual `Authorization: Bearer ***` header.
- If `/api/auth/me` returns 401 after recent login, stored token is stale/malformed.
- Reinstalling app clears WKWebView cache but NOT Xcode simulator cache unless Xcode itself is reset.

## CORS and auth interaction
- If CORS handshake fails, browser may never send Authorization headers.
- If CORS passes but backend returns 401, WKWebView reports it cleanly.
- `OPTIONS` requests do NOT require auth in FastAPI with CORSMiddleware.

## Change log
- 2026-07-31 — Created from Workouts tab 401 investigation
