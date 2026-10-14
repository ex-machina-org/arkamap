-- Wind on a regular lattice for the animated particle layer (/api/windgrid).
-- Replaced wholesale by ingest/windfield.py on every refresh.
CREATE TABLE IF NOT EXISTS wind_grid (
  lon         float8 NOT NULL,
  lat         float8 NOT NULL,
  direction   float8 NOT NULL,
  speed       float8 NOT NULL,
  temperature float8,
  surface     float8,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (lon, lat)
);
-- Older deployments created the table without these columns.
ALTER TABLE wind_grid ADD COLUMN IF NOT EXISTS temperature float8;
ALTER TABLE wind_grid ADD COLUMN IF NOT EXISTS surface float8;
