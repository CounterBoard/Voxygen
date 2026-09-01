-- Voxygen: safe migration for city recruitment.
-- Run once against an existing D1 database. It does not delete existing data.

CREATE TABLE IF NOT EXISTS recruitment (
  territory_id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
);
