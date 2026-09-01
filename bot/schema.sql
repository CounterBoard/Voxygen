-- Run this once in the Cloudflare D1 dashboard's "Console" tab
-- (Workers & Pages → your D1 database → Console → paste → Execute).

CREATE TABLE IF NOT EXISTS territories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_input TEXT NOT NULL,       -- MC nick and/or @username typed at registration
  coords TEXT,
  requested_by_id INTEGER,         -- Telegram id of whoever submitted the request
  requested_by_username TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  curator_score REAL DEFAULT 0,
  community_score REAL DEFAULT 0,
  votes INTEGER DEFAULT 0,
  accent TEXT DEFAULT '#A855F7',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  telegram_username TEXT,
  mc_nickname TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | verified
  created_at INTEGER NOT NULL
);


-- City recruitment. Run this migration in D1 after the original schema.
CREATE TABLE IF NOT EXISTS recruitment (
  territory_id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
);
