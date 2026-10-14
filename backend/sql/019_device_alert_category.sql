-- Optional "kategori" in a device's alert ({"alert": {"status", "kategori"}}):
-- files the alert under that hazard (kebakaran, cuaca, ...) on the alerts
-- page. NULL is a general device alert.
ALTER TABLE device_alert ADD COLUMN IF NOT EXISTS category TEXT;
