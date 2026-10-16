-- Places evacuees and casualties can be taken to, as points: hospitals, official
-- assembly points, and only the large mosques, churches, fields, schools and halls
-- (size from OSM). Filled a province at a time by ingest/evac_sites.py so
-- /responder/route reads the database instead of waiting on Overpass.
CREATE TABLE IF NOT EXISTS evac_site (
  osm_id      TEXT PRIMARY KEY,                  -- "node/1", "way/2", "relation/3"
  kind        TEXT NOT NULL,                     -- hospital | assembly | field | worship | school | hall
  name        TEXT,
  note        TEXT NOT NULL,                     -- what the map calls it: "Masjid", "Lapangan", ...
  area_m2     REAL,                              -- estimated footprint; null for points
  province_id TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL,
  geom        GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS evac_site_geom_idx ON evac_site USING GIST (geom);
CREATE INDEX IF NOT EXISTS evac_site_geog_idx ON evac_site USING GIST ((geom::geography));

-- One row per province: when it was last fetched, so the loop resumes after a
-- restart and refreshes each province once a week.
CREATE TABLE IF NOT EXISTS evac_site_progress (
  province_id TEXT PRIMARY KEY,
  fetched_at  TIMESTAMPTZ,                       -- last successful fetch
  failed_at   TIMESTAMPTZ,                       -- last failure, to back off
  sites       INTEGER,
  error       TEXT
);
