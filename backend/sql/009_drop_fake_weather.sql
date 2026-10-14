-- Before ingest/climate.py skipped failed Open-Meteo fetches, a region whose
-- weather request got HTTP 429 was stored with the defaults: 0 mm rain,
-- humidity exactly 80 %, max wind 0. That exact combination does not occur
-- in real 30-day data, so it identifies the made-up rows. Remove every
-- weather metric of such a (region, period); the API then falls back to the
-- last real value. Idempotent: matches nothing once the rows are gone.
DELETE FROM indicator i
USING indicator h, indicator r, indicator w
WHERE h.metric = 'humidity_mean' AND h.value = 80
  AND r.metric = 'rain_30d' AND r.value = 0
  AND w.metric = 'wind_max'  AND w.value = 0
  AND r.region_id = h.region_id AND r.period = h.period
  AND w.region_id = h.region_id AND w.period = h.period
  AND i.region_id = h.region_id AND i.period = h.period
  AND i.metric IN ('rain_30d', 'dry_days', 'humidity_mean', 'temp_max_mean', 'temp_max_peak',
                   'wind_max', 'wind_direction', 'wind_speed', 'solar_ghi');
