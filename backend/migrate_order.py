import os
from sqlalchemy import create_engine, text
url = os.environ['DATABASE_URL']
print('URL present:', bool(url))
engine = create_engine(url)
with engine.begin() as conn:
    conn.execute(text('ALTER TABLE contexts ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0'))
    print('MIGRATION_OK')
