CREATE TABLE IF NOT EXISTS portfolio (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
INSERT OR IGNORE INTO portfolio VALUES (1,'{"version":1,"assets":[],"debt":0,"monthly":0,"months":6}',0,0);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, credential_version TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
