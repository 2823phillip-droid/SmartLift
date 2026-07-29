SmartLift Frontend

React + TypeScript + Vite mobile-first app, wrapped with Capacitor for iOS distribution.

## Quick Start

```bash
npm install
npm run dev    # :5173
npm run build  # dist/ -> Capacitor webDir
```

## API Configuration

Reads backend base URL from `VITE_API_BASE`. Production default:

```
VITE_API_BASE=https://smartlift-api.fly.dev/api
```

For local debugging only, switch to `http://192.168.1.111:8000/api` if that host is still being used as a dev backend.

## Project Structure

```
src/
├── components/      # Reusable UI
├── pages/           # Screens
├── App.tsx          # Router + layout
└── main.tsx         # Entry
```

## iOS Build

From Linux:

1. Build: `npm run build`
2. Push source to MacBook
3. On Mac: `npm install && npm run build`
4. `npx cap sync ios`
5. `npx cap open ios` — opens Xcode workspace
6. Xcode → Play

## Production

- App defaults to `https://smartlift-api.fly.dev/api`.
- Use `npm run build` + `npx cap sync ios` to ship web changes.
- Backend is deployed separately via Fly.
