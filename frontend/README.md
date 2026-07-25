# SmartLift Frontend

React + TypeScript + Vite mobile-first app, wrapped with Capacitor for iOS distribution.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- Ionicons
- Capacitor (iOS)
- Recharts (weight-over-time graphs)

## Quick Start

```bash
npm install
npm run dev    # :5173
npm run build  # dist/ -> Capacitor webDir
```

## API Configuration

Reads backend base URL from `VITE_API_BASE`. On dev/Linux:

```
VITE_API_BASE=http://192.168.1.111:8000/api
```

For iOS / tunnel, use the URL stored in backend settings / Cloudflare tunnel.

## Project Structure

```
src/
├── api/             # HTTP client + endpoints
├── components/      # Reusable UI
├── widgets/         # Page sections (Home, History, Settings)
├── App.tsx          # Router + layout
└── main.tsx         # Entry
```

## Screens

- **Home** — Start Workout from routine, recent activity
- **History** — Tabs: By workout / By date / By exercise
- **Settings** — Body-weight quick log, API config

## iOS Build

From Linux:

1. Build: `npm run build`
2. Push source to MacBook
3. On Mac: `npm install && npm run build`
4. `./node_modules/.bin/cap add ios`
5. `./node_modules/.bin/cap sync ios`
6. `./node_modules/.bin/cap open ios`
7. Xcode → Play

## Styling

- Mobile-first layouts; safe-area padding on full-width headers.
- `viewport-fit=cover` + `env(safe-area-inset-*)` for notch devices.

## License

Private — all rights reserved.
