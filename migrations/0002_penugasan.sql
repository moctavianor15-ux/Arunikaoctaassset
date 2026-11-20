CREATE TABLE IF NOT EXISTS duty_days (
  day TEXT PRIMARY KEY NOT NULL,
  reference TEXT NOT NULL,
  activity TEXT NOT NULL,
  destination TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('Dalam daerah','Luar daerah')),
  status TEXT NOT NULL CHECK(status IN ('Tanpa klaim','Draf','Diajukan','Dibayar')),
  amount INTEGER NOT NULL CHECK(amount >= 0),
  version TEXT NOT NULL
);
