-- Application keys the backend issues to API consumers (the frontend,
-- partner apps). Different from device keys: these let an app call the API;
-- they don't identify a user or a sensor.
CREATE TABLE IF NOT EXISTS api_client (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,                 -- e.g. "frontend web", "mitra BPBD"
  note         TEXT,
  key_hash     TEXT NOT NULL UNIQUE,          -- sha256 of the key
  key_prefix   TEXT NOT NULL,
  created_by   BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
