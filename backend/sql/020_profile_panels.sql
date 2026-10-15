-- Dashboard panels the AI picked for a profile ([{"id", "reason"}], ids from app/panels.py).
-- Empty for profiles saved before panels: the dashboard then derives them from the metrics.
ALTER TABLE profile ADD COLUMN IF NOT EXISTS panels JSONB NOT NULL DEFAULT '[]'::jsonb;
