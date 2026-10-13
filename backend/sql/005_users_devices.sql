-- Accounts, IoT devices and the flexible sensor data they send.

CREATE TABLE IF NOT EXISTS app_user (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,              -- stored lowercase
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Who am I": drives which of our own metrics the dashboard shows.
CREATE TABLE IF NOT EXISTS user_profile (
  user_id     BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,                       -- free text, e.g. "petani padi"
  goals       TEXT,
  region_id   TEXT REFERENCES region(id),
  metrics     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{metric, reason}] picked by AI
  metrics_by  TEXT,                                -- 'ai' | 'rule'
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,            -- sha256 of the API key
  key_prefix      TEXT NOT NULL,                   -- first chars, to recognise a key
  geom            GEOMETRY(Point, 4326),
  region_id       TEXT REFERENCES region(id),      -- kabkota under the point
  visibility      TEXT NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('private', 'community')),
  -- community sharing is moderated: none -> pending -> approved | rejected
  community_status TEXT NOT NULL DEFAULT 'none'
                    CHECK (community_status IN ('none', 'pending', 'approved', 'rejected')),
  community_note  TEXT,
  layout          JSONB,                           -- widget spec per field
  layout_by       TEXT,                            -- 'ai' | 'rule' | 'user'
  layout_stale    BOOLEAN NOT NULL DEFAULT TRUE,   -- new fields since last layout
  last_seen_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_user_idx ON device (user_id);
CREATE INDEX IF NOT EXISTS device_geom_idx ON device USING GIST (geom);

-- Raw readings exactly as sent (data is the flexible part).
CREATE TABLE IF NOT EXISTS sensor_reading (
  id          BIGSERIAL PRIMARY KEY,
  device_id   BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  protocol    TEXT NOT NULL,                       -- 'http' | 'mqtt'
  data        JSONB NOT NULL                       -- flattened: {"cuaca.suhu": 29.4}
);
CREATE INDEX IF NOT EXISTS reading_device_time_idx ON sensor_reading (device_id, received_at DESC);

-- Every field a device has ever sent, with its type: what the AI lays out.
CREATE TABLE IF NOT EXISTS device_field (
  device_id   BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  type        TEXT NOT NULL,                       -- number | boolean | string | array | null
  sample      JSONB,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, key)
);
