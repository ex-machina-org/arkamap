-- Cached isochrones from the public Valhalla server, so repeated requests
-- for the same point don't hit a shared demo service again.
CREATE TABLE IF NOT EXISTS isochrone_cache (
  key         TEXT PRIMARY KEY,          -- mode:minutes:lat:lon (3 decimals)
  geojson     JSONB NOT NULL,
  area_km2    DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
