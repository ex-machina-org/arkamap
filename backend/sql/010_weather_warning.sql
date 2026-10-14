-- BMKG severe-weather nowcasts (CAP). Short-lived (hours); active ones are
-- those whose `expires` is in the future. Refreshed every 15 minutes.
CREATE TABLE IF NOT EXISTS weather_warning (
  id          TEXT PRIMARY KEY,                -- CAP identifier
  event       TEXT,                            -- e.g. "Hujan Lebat dan Petir"
  headline    TEXT,
  description TEXT,
  area        TEXT,
  severity    TEXT,                            -- CAP: Minor | Moderate | Severe | Extreme
  urgency     TEXT,
  certainty   TEXT,
  effective   TIMESTAMPTZ,
  expires     TIMESTAMPTZ,
  url         TEXT,
  geom        GEOMETRY(Geometry, 4326) NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS weather_warning_geom_idx ON weather_warning USING GIST (geom);
CREATE INDEX IF NOT EXISTS weather_warning_expires_idx ON weather_warning (expires);
-- rows stored before polygons were extracted from GeometryCollections
UPDATE weather_warning SET geom = ST_Multi(ST_CollectionExtract(geom, 3))
WHERE GeometryType(geom) <> 'MULTIPOLYGON';
