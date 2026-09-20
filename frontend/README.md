Askeo Frontend

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
VITE_API_BASE=https://askeo.fit/api
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

1. Build: `npm run build` (produces `dist/`)
2. Rsync to Mac: `rsync -av --checksum --delete dist/ macbook:~/workout-logger/frontend/dist/`
3. On Mac (via SSH): update `ios/App/App/public/` to match `dist/`
   ```bash
   ssh macbook 'rsync -av --checksum --delete ~/workout-logger/frontend/dist/index.html ~/workout-logger/frontend/ios/App/App/public/index.html'
   ssh macbook 'rsync -av --checksum --delete ~/workout-logger/frontend/dist/assets/ ~/workout-logger/frontend/ios/App/App/public/assets/'
   ```
4. Open Xcode on Mac → select your iPhone → Product → Run (⌘R)

**Note:** We do not use `npx cap sync ios` or the iOS simulator. The app is tested on your actual iPhone. The symlink at `ios/App/App/dist → ../../frontend/dist` exists but is not used in our deploy process.

## Production

- App defaults to `https://askeo.fit/api`.
- Use `npm run build` + `npx cap sync ios` to ship web changes.
- Backend is deployed separately via Fly.
