# Matriks endpoint

Semua operasi di [`docs/backend/openapi.json`](../backend/openapi.json) beserta pemakainya di frontend: 73 operasi pada 67 path. Kolom **Dipakai di** berisi file di `frontend/src/` yang memanggil path tersebut.

| Status | Arti | Jumlah |
| --- | --- | --- |
| Dipakai | Dipanggil oleh halaman atau hook frontend | 50 |
| Belum dipakai | Tersedia di API, belum ada halaman yang memanggilnya | 11 |
| Admin | Khusus akun admin atau operator; tidak ada UI admin di frontend | 10 |
| Untuk sensor | Dipanggil perangkat IoT dengan API key perangkat, bukan oleh browser | 1 |
| Operasional | Health check untuk Docker dan pemantauan | 1 |

Pencocokan dilakukan per path. Bila satu path punya beberapa metode (misalnya `GET` dan `PATCH /api/me/devices/{device_id}`), keduanya tercatat dipakai walau frontend mungkin hanya memanggil salah satunya. Perbarui matriks ini setiap kali `openapi.json` berubah.

## Akun dan profil

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Dipakai | `lib/api/auth.ts` |
| POST | `/api/auth/signup` | Dipakai | `lib/api/auth.ts` |
| GET | `/api/me` | Dipakai | `hooks/use-api.ts`, `lib/api/client.ts` +1 |
| POST | `/api/me/password` | Dipakai | `lib/api/auth.ts` |
| PUT | `/api/me/profile` | Dipakai | `features/onboarding/kenalan-form.tsx` |
| GET | `/api/me/profiles` | Dipakai | `features/onboarding/kenalan-form.tsx` |
| POST | `/api/me/profiles` | Dipakai | `features/onboarding/kenalan-form.tsx` |
| DELETE | `/api/me/profiles/{profile_id}` | Dipakai | `hooks/use-profile-switcher.ts` |
| PUT | `/api/me/profiles/{profile_id}` | Dipakai | `hooks/use-profile-switcher.ts` |
| POST | `/api/me/profiles/{profile_id}/activate` | Dipakai | `hooks/use-profile-switcher.ts` |

## Data publik dan peta

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| GET | `/api/buildings` | Dipakai | `features/siri-map/spatial-layers.tsx` |
| GET | `/api/catalog` | Belum dipakai | — |
| GET | `/api/disasters` | Dipakai | `features/siri-map/map-api.ts`, `features/siri-map/situation.ts` |
| GET | `/api/fields` | Dipakai | `features/siri-map/situation.ts` |
| GET | `/api/health` | Operasional | — |
| GET | `/api/history/events` | Dipakai | `features/siri-map/analysis-page.tsx` |
| GET | `/api/hotspots` | Dipakai | `features/siri-map/map-api.ts`, `features/siri-map/point-overlays.tsx` +1 |
| GET | `/api/indicators` | Dipakai | `features/siri-map/decision.ts`, `features/siri-map/situation.ts` |
| GET | `/api/indicators/history` | Belum dipakai | — |
| GET | `/api/isochrone` | Belum dipakai | — |
| GET | `/api/levels` | Belum dipakai | — |
| GET | `/api/map/{metric}` | Dipakai | `features/siri-map/analysis-page.tsx`, `features/siri-map/situation.ts` +2 |
| GET | `/api/marine` | Belum dipakai | — |
| GET | `/api/metrics` | Dipakai | `features/siri-map/analysis-page.tsx`, `features/siri-map/layer-rail.tsx` +2 |
| GET | `/api/modes` | Dipakai | `features/onboarding/kenalan-form.tsx` |
| GET | `/api/notifications` | Dipakai | `features/environmental-dashboard/alerts-monitor.tsx`, `features/environmental-dashboard/use-alerts.ts` +3 |
| GET | `/api/observations` | Belum dipakai | — |
| GET | `/api/public/overview` | Dipakai | `features/siri-map/public-data-panel.tsx`, `features/siri-map/situation.ts` |
| GET | `/api/quakes` | Dipakai | `features/siri-map/analysis-page.tsx`, `features/siri-map/map-api.ts` +2 |
| GET | `/api/regions` | Dipakai | `features/onboarding/kenalan-form.tsx`, `features/siri-map/public-data-panel.tsx` |
| GET | `/api/regions/{region_id}` | Dipakai | `features/siri-map/region-detail.tsx` |
| POST | `/api/score` | Dipakai | `features/environmental-dashboard/components/score-card.tsx` |
| GET | `/api/solar-forecast` | Belum dipakai | — |
| GET | `/api/sources` | Dipakai | `App.tsx`, `components/application/jev-chat/use-mentions.ts` +4 |
| GET | `/api/stats/classification` | Dipakai | `features/siri-map/analysis-page.tsx` |
| GET | `/api/warnings` | Dipakai | `features/siri-map/map-api.ts`, `features/siri-map/situation.ts` |
| GET | `/api/windgrid` | Dipakai | `features/siri-map/spatial-layers.tsx` |

## Analisis dan laporan

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| GET | `/api/reports/{region_id}` | Dipakai | `features/siri-map/public-data-panel.tsx` |

## Perangkat IoT

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| GET | `/api/me/devices` | Dipakai | `components/application/jev-chat/use-mentions.ts`, `features/environmental-dashboard/data-sources.tsx` +2 |
| POST | `/api/me/devices` | Dipakai | `components/application/jev-chat/use-mentions.ts`, `features/environmental-dashboard/data-sources.tsx` +2 |
| DELETE | `/api/me/devices/{device_id}` | Dipakai | `features/environmental-dashboard/device-detail/device-connection.tsx`, `features/environmental-dashboard/device-detail/device-settings.tsx` +3 |
| PATCH | `/api/me/devices/{device_id}` | Dipakai | `features/environmental-dashboard/device-detail/device-connection.tsx`, `features/environmental-dashboard/device-detail/device-settings.tsx` +3 |
| GET | `/api/me/devices/{device_id}/events` | Dipakai | `features/environmental-dashboard/device-test/device-test.tsx` |
| POST | `/api/me/devices/{device_id}/key` | Dipakai | `features/environmental-dashboard/device-detail/device-connection.tsx` |
| PUT | `/api/me/devices/{device_id}/layout` | Dipakai | `features/environmental-dashboard/device-detail/device-settings.tsx` |
| GET | `/api/me/devices/{device_id}/quickstart` | Dipakai | `features/environmental-dashboard/device-detail/device-connection.tsx`, `features/environmental-dashboard/device-test/device-test.tsx` |
| GET | `/api/me/devices/{device_id}/readings` | Dipakai | `features/environmental-dashboard/device-detail/device-log.tsx`, `features/environmental-dashboard/device-detail/readings.ts` |
| POST | `/api/me/devices/{device_id}/readings/delete` | Dipakai | `features/environmental-dashboard/device-detail/device-settings.tsx` |
| POST | `/api/me/devices/{device_id}/share` | Dipakai | `features/environmental-dashboard/device-detail/device-settings.tsx` |
| GET | `/api/me/devices/{device_id}/streams` | Dipakai | `features/environmental-dashboard/components/device-connect.tsx`, `features/environmental-dashboard/device-detail/device-detail.tsx` +1 |
| PATCH | `/api/me/devices/{device_id}/streams/{stream_id}` | Dipakai | `features/environmental-dashboard/device-detail/device-settings.tsx` |
| POST | `/api/me/devices/{device_id}/streams/{stream_id}/merge` | Dipakai | `features/environmental-dashboard/device-detail/device-settings.tsx` |

## Kirim data dan alat uji

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| POST | `/api/ingest` | Untuk sensor | — |
| GET | `/api/me/test-device` | Dipakai | `features/environmental-dashboard/device-test/device-test.tsx` |
| POST | `/api/me/test-device` | Dipakai | `features/environmental-dashboard/device-test/device-test.tsx` |

## Dashboard pengguna

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| GET | `/api/me/alerts` | Dipakai | `features/environmental-dashboard/use-alerts.ts` |
| GET | `/api/me/dashboard` | Dipakai | `features/environmental-dashboard/components/api-dashboard.tsx`, `features/siri-map/workspace.tsx` |

## Komunitas

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| GET | `/api/community/devices` | Dipakai | `features/siri-map/public-data-panel.tsx` |
| GET | `/api/community/devices/{device_id}/readings` | Belum dipakai | — |

## Agen Jev

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| POST | `/api/agent/chat` | Belum dipakai | — |
| POST | `/api/agent/chat/stream` | Dipakai | `components/application/jev-chat/jev-transport.ts`, `lib/api/stream.ts` |
| GET | `/api/agent/sessions/{session_id}` | Belum dipakai | — |
| GET | `/api/agent/tools` | Belum dipakai | — |

## Admin

| Metode | Path | Status | Dipakai di |
| --- | --- | --- | --- |
| POST | `/api/admin/refresh` | Admin | — |
| POST | `/api/admin/refresh-buildings` | Admin | — |
| GET | `/api/clients` | Admin | — |
| POST | `/api/clients` | Admin | — |
| POST | `/api/clients/{client_id}/revoke` | Admin | — |
| POST | `/api/clients/{client_id}/rotate` | Admin | — |
| GET | `/api/moderation/community` | Admin | — |
| POST | `/api/moderation/community/{device_id}` | Admin | — |
| GET | `/api/moderation/users` | Admin | — |
| POST | `/api/moderation/users/{user_id}/reset-password` | Admin | — |
