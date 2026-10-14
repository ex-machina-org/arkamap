-- Corrections to stored data; idempotent and cheap, so safe on every boot.

-- Air quality from Open-Meteo is the CAMS model, not a monitor network: flag it,
-- and keep US AQI on its own scale, which ends at 500 (ingest/climate.py does both now).
UPDATE indicator SET is_modelled = TRUE, confidence = 3
WHERE source_id = 'open_meteo_aq' AND NOT is_modelled;
UPDATE indicator SET value = 500 WHERE metric = 'aqi_forecast_max' AND value > 500;
UPDATE source SET is_modelled = TRUE WHERE id = 'open_meteo_aq' AND NOT is_modelled;

-- MODIS hotspot confidence was stored as 0-100; VIIRS uses low/nominal/high. One scale
-- (FIRMS' MODIS classes), as ingest/fire.py confidence() now stores it.
UPDATE observation
SET attrs = jsonb_set(attrs, '{confidence}', to_jsonb(CASE WHEN (attrs->>'confidence')::numeric < 30 THEN 'low'
                                                          WHEN (attrs->>'confidence')::numeric < 80 THEN 'nominal'
                                                          ELSE 'high' END))
WHERE metric = 'hotspot' AND attrs->>'confidence' ~ '^[0-9]+(\.[0-9]+)?$';
