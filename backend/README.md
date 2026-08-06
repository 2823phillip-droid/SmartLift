Askeo backend, frontend, iOS sync and production (Fly).

## API

Fly production URL only:

```
curl -I https://askeo.fit/healthz
```

Backend deploy: `fly deploy -a smartlift-api`

## Current state

- iOS app defaults to Fly API.
- Local backend URL was removed from app source.
- MacBook SSH: `macbook` (configured in ~/.ssh/config)
