CREATE TABLE IF NOT EXISTS duty_colors (
  id INTEGER PRIMARY KEY,
  ref_key TEXT NOT NULL,
  activity_key TEXT NOT NULL,
  UNIQUE(ref_key, activity_key)
);

CREATE TRIGGER IF NOT EXISTS duty_colors_on_insert AFTER INSERT ON duty_days
BEGIN
  INSERT OR IGNORE INTO duty_colors(ref_key, activity_key)
  VALUES(lower(trim(NEW.reference)), lower(trim(NEW.activity)));
END;

CREATE TRIGGER IF NOT EXISTS duty_colors_on_edit AFTER UPDATE OF reference, activity ON duty_days
BEGIN
  INSERT OR IGNORE INTO duty_colors(ref_key, activity_key)
  VALUES(lower(trim(NEW.reference)), lower(trim(NEW.activity)));
END;

INSERT OR IGNORE INTO duty_colors(ref_key, activity_key)
SELECT lower(trim(reference)), lower(trim(activity)) FROM duty_days
GROUP BY lower(trim(reference)), lower(trim(activity)) ORDER BY min(day);
