import { useEffect, useRef, useState } from "react";
import { apiList, type DTO } from "@/lib/api/client";
import { SESSION_CHANGED } from "@/hooks/use-session";
import { DEVICE_KIND_LABEL, type DeviceKind, type IotDevice } from "./device-data";

/** A device counts as online when it reported in the last 15 minutes; the backend has no status field. */
export const ONLINE_WINDOW_MS = 15 * 60_000;
export const isOnline = (seen?: string | null) => Boolean(seen && Date.now() - Date.parse(seen) < ONLINE_WINDOW_MS);

export function formatRelative(iso?: string | null, now = Date.now()) {
  if (!iso) return "Belum ada data";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds} detik lalu`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} jam lalu`;
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

// The backend stores no registration metadata; only the form's kind survives, as `category`.
export function deviceView(device: DTO<"DeviceOut">): IotDevice {
  const seen = device.last_seen_at;
  const kind = device.category && device.category in DEVICE_KIND_LABEL ? device.category as DeviceKind : "awlr";
  return { id: String(device.id), backendId: device.id, name: device.name,
    kind, ownership: "byod", owner: "Pemilik akun",
    location: device.region_name ?? "Lokasi belum ditentukan", province: "Belum ditentukan",
    battery: null, status: isOnline(seen) ? "online" : "offline",
    lastSeen: seen ? new Date(seen).toLocaleString("id-ID") : "Belum ada data" };
}

export function useDevices() {
  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const changed = () => { setDevices([]); setVersion(value => value + 1); };
    const expired = () => { active.current?.abort(); setDevices([]); setLoading(false); setError("Silakan masuk untuk melihat perangkat akun."); };
    window.addEventListener(SESSION_CHANGED, changed);
    window.addEventListener("arkamap-session-expired", expired);
    return () => { window.removeEventListener(SESSION_CHANGED, changed); window.removeEventListener("arkamap-session-expired", expired); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(undefined); setDevices([]);
    active.current = controller;
    apiList("/me/devices", "DeviceOut", { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setDevices(data.map(deviceView)); setLoading(false); }
    }).catch(cause => { if (!controller.signal.aborted) { setError(cause.message); setLoading(false); } });
    return () => controller.abort();
  }, [version]);
  return { devices, error, loading, refresh: () => setVersion(value => value + 1) };
}

/**
 * One device, re-read every `pollMs` while the tab is visible. The API has no
 * single-device endpoint and no push channel, so this lists the account's
 * devices and picks one; `updatedAt` lets the UI say how fresh the view is.
 */
export function useDevice(id: number, pollMs?: number) {
  const [device, setDevice] = useState<DTO<"DeviceOut">>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const changed = () => setVersion(value => value + 1);
    window.addEventListener(SESSION_CHANGED, changed);
    return () => window.removeEventListener(SESSION_CHANGED, changed);
  }, []);
  useEffect(() => {
    let controller: AbortController | undefined;
    const load = () => {
      if (document.hidden) return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      apiList("/me/devices", "DeviceOut", { signal: current.signal }).then(data => {
        if (current.signal.aborted) return;
        const found = data.find(item => item.id === id);
        setDevice(found); setMissing(!found); setError(undefined); setLoading(false); setUpdatedAt(Date.now());
      }).catch(cause => { if (!current.signal.aborted) { setError(cause instanceof Error ? cause.message : "Perangkat gagal dimuat."); setLoading(false); } });
    };
    load();
    const timer = pollMs ? window.setInterval(load, pollMs) : undefined;
    document.addEventListener("visibilitychange", load);
    return () => { controller?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [id, pollMs, version]);
  return { device, error, loading, missing, updatedAt, refresh: () => setVersion(value => value + 1) };
}
