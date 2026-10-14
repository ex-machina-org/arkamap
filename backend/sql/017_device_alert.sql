-- The alert a device reports about itself: {"alert": "aman" | "bahaya"} in
-- its payload. Only the current state per device and "nama" is kept; the
-- owner is notified while it is "bahaya", never while it is "aman".
CREATE TABLE IF NOT EXISTS device_alert (
  device_id  BIGINT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,                      -- the reading's "nama" (ingest.slugify)
  status     TEXT NOT NULL CHECK (status IN ('aman', 'bahaya')),
  message    TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- when status last flipped
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- last report, same status or not
  PRIMARY KEY (device_id, slug)
);
