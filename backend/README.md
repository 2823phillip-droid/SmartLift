SmartLift backend, frontend, iOS sync and production (Fly).

## API

Fly production URL only:

```
curl -I https://smartlift-api.fly.dev/healthz
```

Backend deploy: `fly deploy -a smartlift-api`

## Current state

- iOS app defaults to Fly API.
- Local backend URL was removed from app source.
- MacBook static IP: `192.168.1.112`.
