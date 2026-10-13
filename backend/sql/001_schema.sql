-- Suryascope / Nusantara Sustainability Atlas
-- One generic indicator model so new themes need no migration.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────
-- Reference: what each dataset is and where it came from.
-- Every number the API serves can be traced back to a row here.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source (
  id           TEXT PRIMARY KEY,
  aspect       TEXT NOT NULL CHECK (aspect IN ('urban','lingkungan','energi')),
  title        TEXT NOT NULL,
  publisher    TEXT NOT NULL,
  url          TEXT NOT NULL,
  license      TEXT NOT NULL,
  cadence      TEXT NOT NULL,              -- 'harian', 'per jam', 'tahunan'
  is_modelled  BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = turunan model, bukan observasi
  notes        TEXT,
  last_run_at  TIMESTAMPTZ,
  last_ok_at   TIMESTAMPTZ,
  last_error   TEXT
);

-- ─────────────────────────────────────────────────────────────
-- Regions: the unit every indicator is aggregated to.
-- Kept generic (level = 'provinsi' | 'kabkota' | 'grid') so the
-- same queries work whether we have official boundaries or not.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS region (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  level      TEXT NOT NULL,
  parent_id  TEXT REFERENCES region(id),
  population INTEGER,
  area_km2   DOUBLE PRECISION,
  geom       GEOMETRY(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS region_geom_idx ON region USING GIST (geom);
CREATE INDEX IF NOT EXISTS region_level_idx ON region (level);

-- ─────────────────────────────────────────────────────────────
-- Observations: raw point/area facts as ingested (a hotspot, a
-- reading). Kept so aggregates can always be recomputed.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS observation (
  id         BIGSERIAL PRIMARY KEY,
  source_id  TEXT NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  metric     TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  value      DOUBLE PRECISION,
  attrs      JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom       GEOMETRY(Point, 4326) NOT NULL,
  UNIQUE (source_id, metric, observed_at, geom)
);
CREATE INDEX IF NOT EXISTS obs_geom_idx   ON observation USING GIST (geom);
CREATE INDEX IF NOT EXISTS obs_metric_idx ON observation (metric, observed_at DESC);
CREATE INDEX IF NOT EXISTS obs_src_idx    ON observation (source_id, observed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Indicators: one value per (region, metric, period). This is what
-- the map and scoring read. Adding a theme = inserting rows, not
-- altering tables.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indicator (
  region_id   TEXT NOT NULL REFERENCES region(id) ON DELETE CASCADE,
  metric      TEXT NOT NULL,
  period      DATE NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  unit        TEXT NOT NULL,
  source_id   TEXT NOT NULL REFERENCES source(id),
  confidence  SMALLINT NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  is_modelled BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (region_id, metric, period)
);
CREATE INDEX IF NOT EXISTS ind_metric_idx ON indicator (metric, period DESC);

-- Definition of each metric: label, unit, direction, and how it is
-- normalised to 0..100. Drives both the API and the legend, so the
-- frontend never hardcodes a scale.
CREATE TABLE IF NOT EXISTS metric_def (
  metric      TEXT PRIMARY KEY,
  aspect      TEXT NOT NULL CHECK (aspect IN ('urban','lingkungan','energi')),
  label       TEXT NOT NULL,
  unit        TEXT NOT NULL,
  description TEXT NOT NULL,
  -- 'high_bad': higher value = worse. 'high_good': higher = better.
  polarity    TEXT NOT NULL CHECK (polarity IN ('high_bad','high_good')),
  scale_min   DOUBLE PRECISION NOT NULL,
  scale_max   DOUBLE PRECISION NOT NULL,
  source_id   TEXT REFERENCES source(id)
);

-- ─────────────────────────────────────────────────────────────
-- Composite scores: user-weighted combinations of metrics.
-- Weights live in the request, not here, so every user can ask a
-- different question of the same data.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW indicator_latest AS
SELECT DISTINCT ON (region_id, metric)
       region_id, metric, period, value, unit, source_id, confidence, is_modelled
FROM indicator
ORDER BY region_id, metric, period DESC;
