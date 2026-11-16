-- Voxygen D1 base schema.
-- The Worker also performs lazy migrations for existing databases.

CREATE TABLE IF NOT EXISTS territories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_input TEXT NOT NULL,
  coords TEXT,
  requested_by_id INTEGER,
  requested_by_username TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  curator_score REAL DEFAULT 0,
  community_score REAL DEFAULT 0,
  votes INTEGER DEFAULT 0,
  accent TEXT DEFAULT '#A855F7',
  is_government INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  telegram_username TEXT,
  mc_nickname TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recruitment (
  territory_id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  contact_username TEXT,
  FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
);

-- Existing installations are upgraded automatically by bot/src/worker.js.
