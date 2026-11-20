ALTER TABLE duty_days ADD COLUMN transport INTEGER NOT NULL DEFAULT 0 CHECK (transport >= 0);
ALTER TABLE duty_days ADD COLUMN other INTEGER NOT NULL DEFAULT 0 CHECK (other >= 0);
ALTER TABLE duty_days ADD COLUMN detail TEXT NOT NULL DEFAULT '';
CREATE TABLE duty_submissions (
  request_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  attempt TEXT NOT NULL,
  days TEXT NOT NULL
);
