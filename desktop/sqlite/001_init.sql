-- Local Windows SQLite foundation — version 1.
-- Keep original attachments in app-managed storage, never modify the user's originals.
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (collection,id)
);
CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  data BLOB NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes>=0)
);
CREATE INDEX IF NOT EXISTS idx_attachments_sha256 ON attachments(sha256);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);
