-- Test devices: an ordinary device with an expiry, so a sensor can be tried
-- with a real key and real tables, then removed with everything it received.
-- Kept out of the device list, dashboard, community and agent.
ALTER TABLE device ADD COLUMN IF NOT EXISTS test_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS device_test_idx ON device (test_expires_at) WHERE test_expires_at IS NOT NULL;

-- What happened to a test device's sends, newest first on its test page.
CREATE TABLE IF NOT EXISTS device_event (
  id        BIGSERIAL PRIMARY KEY,
  device_id BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind      TEXT NOT NULL,
  message   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS device_event_idx ON device_event (device_id, id DESC);
