-- ~400 m grid cells where satellites keep seeing heat on many separate days
-- across several months: industry, gas flares, volcanoes. Detections in or
-- next to these cells are not raised as possible fires. Rebuilt from the
-- stored hotspots by ingest/fire.py refresh_static_cells.
CREATE TABLE IF NOT EXISTS static_heat_cell (
  gx         INTEGER NOT NULL,                   -- floor(lon / cell size)
  gy         INTEGER NOT NULL,                   -- floor(lat / cell size)
  days       INTEGER NOT NULL,                   -- distinct days with a detection
  months     INTEGER NOT NULL,                   -- distinct calendar months
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (gx, gy)
);
