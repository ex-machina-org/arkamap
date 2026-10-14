-- Streams by the sender's "nama" instead of by field set. One nama = one
-- data table; a reading that brings fields the table never had starts a new
-- version of it, so a sensor upgrade stays visible in its history. Fields
-- are registered per nama ("<slug>/<field>"), so two tables may both carry
-- e.g. "suhu" without mixing. Idempotent: runs on every boot.

-- slug = normalised nama (app/iot/ingest.py slugify); aliases = slugs of
-- tables merged into this one, so their senders keep landing here.
ALTER TABLE device_stream ADD COLUMN IF NOT EXISTS slug    TEXT;
ALTER TABLE device_stream ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
UPDATE device_stream SET slug = COALESCE(
    NULLIF(left(btrim(regexp_replace(lower(btrim(name)), '[^a-z0-9_.-]+', '_', 'g'), '_'), 64), ''),
    'default')
WHERE slug IS NULL;
-- before this migration two streams could share a name (split by fields);
-- the oldest keeps it (an unnamed one stays "default", where nameless
-- readings keep landing), the others get their id appended
UPDATE device_stream s SET slug = s.slug || '_' || s.id
WHERE EXISTS (SELECT 1 FROM device_stream o
              WHERE o.device_id = s.device_id AND o.slug = s.slug AND o.id < s.id);
ALTER TABLE device_stream ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS device_stream_slug_uq ON device_stream (device_id, slug);

CREATE TABLE IF NOT EXISTS stream_version (
  id            BIGSERIAL PRIMARY KEY,
  stream_id     BIGINT NOT NULL REFERENCES device_stream(id) ON DELETE CASCADE,
  version       INT NOT NULL,
  keys          TEXT[] NOT NULL,                   -- sorted field keys of this version
  added         TEXT[] NOT NULL DEFAULT '{}',      -- keys no earlier version had
  reading_count BIGINT NOT NULL DEFAULT 0,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stream_id, version)
);
-- existing streams: everything stored so far is version 1
INSERT INTO stream_version (stream_id, version, keys, added, reading_count, first_seen, last_seen)
SELECT s.id, 1, s.keys, s.keys, s.reading_count, s.created_at, s.last_seen_at
FROM device_stream s
WHERE NOT EXISTS (SELECT 1 FROM stream_version v WHERE v.stream_id = s.id);

ALTER TABLE sensor_reading ADD COLUMN IF NOT EXISTS version_id BIGINT REFERENCES stream_version(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS reading_version_idx ON sensor_reading (version_id, id DESC);
CREATE INDEX IF NOT EXISTS reading_unversioned_idx ON sensor_reading (id) WHERE version_id IS NULL;
UPDATE sensor_reading r SET version_id = v.id
FROM stream_version v
WHERE r.version_id IS NULL AND v.stream_id = r.stream_id AND v.version = 1;

-- fields per nama: "suhu" in stream "cuaca" becomes "cuaca/suhu"
INSERT INTO device_field (device_id, key, type, sample, first_seen, last_seen, category, category_by)
SELECT f.device_id, s.slug || '/' || f.key, f.type, f.sample, f.first_seen, f.last_seen, f.category, f.category_by
FROM device_field f JOIN device_stream s ON s.device_id = f.device_id AND f.key = ANY(s.keys)
WHERE position('/' in f.key) = 0
ON CONFLICT (device_id, key) DO NOTHING;
UPDATE device d SET layout = (
    SELECT COALESCE(jsonb_agg(w || jsonb_build_object('field', s.slug || '/' || (w->>'field'))
                              || CASE WHEN w->>'pair_field' IS NOT NULL
                                      THEN jsonb_build_object('pair_field', s.slug || '/' || (w->>'pair_field'))
                                      ELSE '{}'::jsonb END
                              ORDER BY s.id), '[]'::jsonb)
    FROM jsonb_array_elements(d.layout) w
    JOIN device_stream s ON s.device_id = d.id AND (w->>'field') = ANY(s.keys))
WHERE jsonb_typeof(d.layout) = 'array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(d.layout) w WHERE position('/' in w->>'field') = 0);
DELETE FROM device_field WHERE position('/' in key) = 0;

-- non-fatal problems with what a device sends (no nama / no waktu during
-- the transition), shown to the owner beside last_error
ALTER TABLE device ADD COLUMN IF NOT EXISTS warning_count   BIGINT NOT NULL DEFAULT 0;
ALTER TABLE device ADD COLUMN IF NOT EXISTS last_warning    TEXT;
ALTER TABLE device ADD COLUMN IF NOT EXISTS last_warning_at TIMESTAMPTZ;
