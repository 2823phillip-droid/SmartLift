# Backend DB: Fly.io + Postgres + SQLAlchemy

last_updated: 2026-07-31
created: 2026-07-31
tags: [backend, database, fly, postgres, sqlalchemy, migrations]
related: SMARTLIFT.md, debugging.md

## Production vs local schema drift
- Production uses managed Postgres on Fly; local uses SQLite via `DATABASE_URL=sqlite:///./workout.db`.
- `create_all()` only runs on local SQLite. **Never rely on it for production schema.**
- If backend returns `500` on a query path that works locally, check production schema first.
- Common culprit: `order` column expected by `Context.order` but not present in production.

## Known schema fields to verify
- `contexts`: id, user_id, name, description, equipment_tags, is_active, created_at, default_rest_seconds, **order**
- `workout_templates`: id, user_id, context_id, name, type, **order**, created_at, default_rest_seconds, coach_rules
- `exercise_entries`: id, user_id, template_id, exercise_library_id, name, sets_target, reps_target, start_weight, rest_seconds, **order**

## Schema change pattern on Fly
- Secure DB shell:
  ```
  fly ssh console -C 'python3 -c "import os; ..."' -a smartlift-api
  ```
- Use SQLAlchemy engine with `DATABASE_URL` from env:
  ```
  engine = create_engine(os.environ["DATABASE_URL"])
  with engine.begin() as conn:
      conn.execute(text("ALTER TABLE ... ADD COLUMN ..."))
  ```
- Check whether column exists first; `ALTER TABLE` will error on duplicate.
- Observe production logs after migration:
  ```
  fly logs -a smartlift-api --no-tail
  ```

## SQLAlchemy quoting
- `"order"` is a reserved keyword in Postgres. Always quote with `\"order\"` in raw SQL or use `Column("order", ...)` in models.

## Change log
- 2026-07-31 — Created from production DB column missing investigation
