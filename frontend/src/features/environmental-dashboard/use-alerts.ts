import { useEffect, useState } from "react";
import { api, apiList, type DTO } from "@/lib/api/client";

export type DeviceAlert = DTO<"DeviceAlert">;
export type AlertCategory = "device" | "fire" | "fireRisk" | "heat" | "weather" | "quake" | "disaster" | "region";

/**
 * Named after what the data measures, not what it might mean: a dry spell
 * is a risk, not a fire, and a single satellite hotspot is a hot pixel.
 */
export const ALERT_CATEGORIES: { id: AlertCategory; label: string; description: string }[] = [
  { id: "device", label: "Alat IoT", description: "Status aman/bahaya yang dikirim alat Anda lewat field \"alert\" tanpa \"kategori\". Alert berkategori masuk ke kategori itu." },
  { id: "fire", label: "Kebakaran", description: "Kemungkinan kebakaran: titik panas satelit yang terdeteksi berulang, di luar lokasi industri, suar gas, gunung api, dan pembangkit. Terkonfirmasi bila GDACS juga melaporkan kebakaran hutan; belum dicek lapangan." },
  { id: "fireRisk", label: "Rawan kebakaran", description: "Indeks rawan kebakaran dan hari kering berturut-turut: kondisi yang mudah terbakar, bukan api." },
  { id: "heat", label: "Hawa panas", description: "Suhu udara maksimum, suhu terasa, dan suhu wet-bulb yang tinggi." },
  { id: "weather", label: "Cuaca", description: "Peringatan dini cuaca BMKG." },
  { id: "quake", label: "Gempa", description: "Gempa berstatus darurat atau siaga tsunami di sekitar wilayah, 7 hari terakhir." },
  { id: "disaster", label: "Bencana", description: "Bencana GDACS level oranye ke atas di sekitar wilayah." },
  { id: "region", label: "Indikator wilayah", description: "Indikator lain yang melewati ambang perhatian." },
];

/** A device alert's "kategori" and the category it is filed under; same list as backend ingest.ALERT_CATEGORIES. */
export const DEVICE_ALERT_CATEGORIES: Record<NonNullable<DeviceAlert["category"]>, AlertCategory> = {
  kebakaran: "fire", cuaca: "weather", gempa: "quake", bencana: "disaster", panas: "heat",
};

/** Without "kategori" (or "none") a device alert stays a general "Alat IoT" alert. */
export const deviceAlertCategory = (alert: DeviceAlert): AlertCategory => alert.category ? DEVICE_ALERT_CATEGORIES[alert.category] : "device";

type RegionCategory = Extract<AlertCategory, "fireRisk" | "heat" | "region">;

const REGION_METRICS: Record<string, { category: RegionCategory; unit: string }> = {
  fire_risk: { category: "fireRisk", unit: "/100" },
  dry_days: { category: "fireRisk", unit: "hari" },
  temp_max_mean: { category: "heat", unit: "°C" },
  temp_max_peak: { category: "heat", unit: "°C" },
  heat_index_max: { category: "heat", unit: "°C" },
  wet_bulb_max: { category: "heat", unit: "°C" },
};

/** Which category a region indicator belongs to; anything unlisted stays a generic indicator. */
export const regionCategory = (metric: string): RegionCategory => REGION_METRICS[metric]?.category ?? "region";
export const metricUnit = (metric: string) => REGION_METRICS[metric]?.unit ?? "";

// Stores what the user switched off, so a category added later starts on.
const PREFS_KEY = "arkamap-alert-categories-off";
const ALL = ALERT_CATEGORIES.map(category => category.id);

// ponytail: per browser, not per account; move to the user profile if people switch devices.
function readPrefs(): Set<AlertCategory> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "[]");
    if (Array.isArray(value)) return new Set(ALL.filter(id => !value.includes(id)));
  } catch { /* fall back to everything */ }
  return new Set(ALL);
}

/** Which alert categories the user wants to see and be notified about. */
export function useAlertPrefs() {
  const [enabled, setEnabled] = useState(readPrefs);
  const toggle = (id: AlertCategory, on: boolean) => setEnabled(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(ALL.filter(category => !next.has(category)))); } catch { /* kept for this visit */ }
    return next;
  });
  return { enabled, toggle };
}

const POLL_MS = 30_000;

/** The account's device alerts, re-read while the tab is visible. */
export function useDeviceAlerts(active: boolean) {
  const [state, setState] = useState<{ alerts: DeviceAlert[]; loading: boolean; error?: string }>({ alerts: [], loading: active });
  useEffect(() => {
    if (!active) return;
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      apiList("/me/alerts", "DeviceAlert", { signal })
        .then(alerts => { if (!signal.aborted) setState({ alerts, loading: false }); })
        .catch(cause => { if (!signal.aborted) setState(prev => ({ ...prev, loading: false, error: cause instanceof Error ? cause.message : "Gagal memuat alert alat." })); });
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => { clearInterval(timer); controller.abort(); };
  }, [active]);
  return state;
}

export type Notifications = DTO<"Notifications">;
// The backend computes this snapshot from stored data on every request, so polling is cheap.
const REFRESH_MS = 60_000;

/**
 * `/notifications` (optionally scoped by `?region_id=`), polled while the tab
 * is visible; keeps the last good snapshot through refreshes and errors.
 * A null path fetches nothing.
 */
export function useNotifications(path: string | null) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ data?: Notifications; updatedAt?: string; loading: boolean; error?: string; path: string | null }>({ loading: !!path, path });
  // A new scope must not show the previous scope's alerts while it loads.
  if (state.path !== path) setState({ loading: !!path, path });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api(path, "Notifications", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ data, updatedAt: new Date().toISOString(), loading: false, path }); })
      .catch(cause => { if (!controller.signal.aborted) setState(prev => ({ ...prev, loading: false, error: cause instanceof Error ? cause.message : "Gagal memuat peringatan." })); });
    return () => controller.abort();
  }, [path, version]);
  const refresh = () => { setState(prev => ({ ...prev, loading: true })); setVersion(value => value + 1); };
  useEffect(() => {
    if (!path) return;
    const timer = setInterval(() => { if (!document.hidden) { setState(prev => ({ ...prev, loading: true })); setVersion(value => value + 1); } }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [path]);
  return { ...state, refresh };
}

const SEEN_KEY = "arkamap-alert-seen";
const SEEN_LIMIT = 300;

function readSeen(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

/** Danger alerts already shown in the pop-up, so it only ever shows what is new. */
export function useSeenAlerts() {
  const [seen, setSeen] = useState(() => new Set(readSeen()));
  const markSeen = (keys: string[]) => setSeen(prev => {
    // ponytail: per browser, capped list; move server-side if read state must follow the account
    const next = [...prev, ...keys.filter(key => !prev.has(key))].slice(-SEEN_LIMIT);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* remembered for this visit */ }
    return new Set(next);
  });
  return { seen, markSeen };
}
