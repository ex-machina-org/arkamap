-- A point on each region's coastline, for sea (wave) data: marine models
-- have values only over water, and region centroids are usually inland.
-- coast_checked marks regions already examined (landlocked ones keep a NULL
-- point), so the geometry work runs once per region.
ALTER TABLE region ADD COLUMN IF NOT EXISTS coast_point GEOMETRY(Point, 4326);
ALTER TABLE region ADD COLUMN IF NOT EXISTS coast_checked BOOLEAN NOT NULL DEFAULT FALSE;
