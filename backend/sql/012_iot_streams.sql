-- Sensor data management: fixed categories per field, automatic streams
-- (readings grouped by the set of fields they carry), duplicate and
-- rejection counters per device.

-- A device may now be created with nothing but a click: name/category optional.
ALTER TABLE device ALTER COLUMN category DROP NOT NULL;
ALTER TABLE device ADD COLUMN IF NOT EXISTS dup_count      BIGINT NOT NULL DEFAULT 0;
ALTER TABLE device ADD COLUMN IF NOT EXISTS rejected_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE device ADD COLUMN IF NOT EXISTS last_error     TEXT;
ALTER TABLE device ADD COLUMN IF NOT EXISTS last_error_at  TIMESTAMPTZ;

-- One fixed category per field (app/iot/categories.py); who set it decides
-- who may change it: user > ai > rule.
ALTER TABLE device_field ADD COLUMN IF NOT EXISTS category    TEXT NOT NULL DEFAULT 'lainnya';
ALTER TABLE device_field ADD COLUMN IF NOT EXISTS category_by TEXT NOT NULL DEFAULT 'rule';
DO $$ BEGIN
  ALTER TABLE device_field ADD CONSTRAINT device_field_category_ck CHECK (category IN
    ('cuaca','kualitas_udara','air','tanah','energi','laut','kebencanaan','kesehatan','lokasi','perangkat','lainnya'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS device_stream (
  id           BIGSERIAL PRIMARY KEY,
  device_id    BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  keys         TEXT[] NOT NULL,                    -- sorted field keys this stream carries
  name         TEXT,                               -- NULL = derived from its category
  name_by      TEXT,                               -- 'payload' | 'user'
  category     TEXT CHECK (category IN
    ('cuaca','kualitas_udara','air','tanah','energi','laut','kebencanaan','kesehatan','lokasi','perangkat','lainnya')),
                                                   -- NULL = majority of its fields; set = user's choice
  reading_count BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_stream_device_idx ON device_stream (device_id);

ALTER TABLE sensor_reading ADD COLUMN IF NOT EXISTS stream_id   BIGINT REFERENCES device_stream(id) ON DELETE CASCADE;
ALTER TABLE sensor_reading ADD COLUMN IF NOT EXISTS hash        TEXT;         -- md5 of the canonical data
ALTER TABLE sensor_reading ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;  -- the sensor's own "waktu", if sent
CREATE INDEX IF NOT EXISTS reading_dedup_idx ON sensor_reading (device_id, hash, received_at DESC);
CREATE INDEX IF NOT EXISTS reading_stream_idx ON sensor_reading (stream_id, id DESC);
-- keeps the backfill below cheap on every boot (normally matches nothing)
CREATE INDEX IF NOT EXISTS reading_unstreamed_idx ON sensor_reading (id) WHERE stream_id IS NULL;

-- Readings stored before streams existed: one stream per distinct key set.
INSERT INTO device_stream (device_id, keys, reading_count, created_at, last_seen_at)
SELECT device_id, k, COUNT(*), MIN(received_at), MAX(received_at)
FROM (SELECT device_id, received_at,
             ARRAY(SELECT k FROM jsonb_object_keys(data) k ORDER BY k COLLATE "C") AS k
      FROM sensor_reading WHERE stream_id IS NULL) s
GROUP BY device_id, k;
UPDATE sensor_reading r SET stream_id = s.id
FROM device_stream s
WHERE r.stream_id IS NULL AND s.device_id = r.device_id
  AND s.keys = ARRAY(SELECT k FROM jsonb_object_keys(r.data) k ORDER BY k COLLATE "C");
