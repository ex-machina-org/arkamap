"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RiArrowRightLine, RiCloseLine, RiRouteLine, RiSignalTowerFill } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { StatusDot } from "@/components/base/badges/status-dot";
import { MapMarker, MarkerContent } from "@/components/ui/map";
import { api, type DTO } from "@/lib/api/client";
import { goTo } from "@/lib/navigate";
import { cx } from "@/utils/cx";
import { absoluteTime, formatCoords, relativeTime } from "./format";
import type { LocatedDevice } from "./use-located-devices";

const PIN_COLOR = "var(--color-status-cyan-text)";
const PIN_OUTLINE = "#ffffff";
/** Values shown on the card; the rest are one click away on the device page. */
const VALUES_SHOWN = 4;
/** Same rule as the device registry: online = reported in the last 15 minutes (the backend has no status field). */
const ONLINE_WINDOW_MS = 15 * 60_000;

export function DevicePins({ devices, selectedId, onSelect }: {
  devices: LocatedDevice[]; selectedId?: number; onSelect: (device: LocatedDevice) => void;
}) {
  return devices.map(device => {
    const selected = device.id === selectedId;
    return (
      <MapMarker key={device.id} longitude={device.lon} latitude={device.lat}>
        <MarkerContent>
          <button
            type="button"
            aria-label={`Alat IoT ${device.name}`}
            aria-pressed={selected}
            onClick={() => onSelect(device)}
            className="group relative flex flex-col items-center outline-none"
          >
            <span
              style={{
                backgroundColor: PIN_COLOR,
                borderColor: PIN_OUTLINE,
                boxShadow: selected ? `0 0 0 4px ${PIN_OUTLINE}, 0 4px 12px rgb(0 0 0 / 0.35)` : "0 2px 6px rgb(0 0 0 / 0.35)",
              }}
              // Rounded square, so a device never reads as one of the round event pins.
              className={cx(
                "grid size-8 place-items-center rounded-lg border-2 text-text-white transition-transform duration-150 ease-out group-hover:scale-110 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-border-focus-ring",
                selected && "scale-110",
              )}
            >
              <RiSignalTowerFill className="size-4" aria-hidden="true" />
            </span>
            <span
              className={cx(
                "pointer-events-none absolute top-full mt-1.5 max-w-[180px] truncate whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-2.5 py-1 text-caption-1-semibold text-text-primary shadow-lg transition-[opacity,transform] duration-150 ease-out",
                !selected && "translate-y-0.5 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
              )}
            >
              {device.name}
            </span>
          </button>
        </MarkerContent>
      </MapMarker>
    );
  });
}

function formatValue(value: unknown) {
  if (typeof value === "number") return value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (value == null) return "–";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** The newest reading's values, labelled by the device's layout. Layout keys are "<nama>/<field>"; reading keys are bare. */
function latestValues(device: LocatedDevice, reading: DTO<"Reading">) {
  const specs = new Map((device.layout ?? []).map(spec => [spec.field.slice(spec.field.lastIndexOf("/") + 1), spec]));
  return Object.entries(reading.data ?? {})
    .filter(([key]) => !specs.get(key)?.hidden)
    .map(([key, value]) => {
      const spec = specs.get(key);
      return { key, label: spec?.label ?? key, value: `${formatValue(value)}${spec?.unit ? ` ${spec.unit}` : ""}` };
    });
}

export function MapDeviceCard({ device, onClose, onEvacuate }: {
  device: LocatedDevice; onClose: () => void;
  /** Resolves once the route is on the map; the card stays busy until then. */
  onEvacuate: (device: LocatedDevice) => Promise<void>;
}) {
  const [routing, setRouting] = useState(false);
  const reduce = useReducedMotion();
  // Kept with the device it belongs to, so switching pins shows "loading" instead of the previous device's values.
  const [loaded, setLoaded] = useState<{ id: number; reading: DTO<"Reading"> | null }>();
  useEffect(() => {
    const controller = new AbortController();
    api(`/me/devices/${device.id}/readings?hours=2160&limit=1`, "Readings", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setLoaded({ id: device.id, reading: value.readings[0] ?? null }); })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ id: device.id, reading: null }); });
    return () => controller.abort();
  }, [device.id, device.last_seen_at]);
  // undefined while loading, null when the device has sent nothing (in the last 90 days)
  const reading = loaded?.id === device.id ? loaded.reading : undefined;

  const [now] = useState(Date.now);
  const online = Boolean(device.last_seen_at && now - Date.parse(device.last_seen_at) < ONLINE_WINDOW_MS);
  const values = reading ? latestValues(device, reading) : [];
  const facts: [string, string][] = [
    ["Wilayah", device.region_name ?? "Belum terpetakan"],
    ["Terakhir kirim", device.last_seen_at ? absoluteTime(device.last_seen_at) : "Belum ada data"],
    ["Koordinat (lintang, bujur)", formatCoords([device.lon, device.lat])],
    ["Visibilitas", device.community_status === "approved" ? "Komunitas" : "Privat"],
  ];

  return (
    <motion.section
      aria-label={`Detail alat ${device.name}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: "easeOut" } }}
      className="flex w-full flex-col gap-3 rounded-2xl bg-background-secondary-default p-4 shadow-dropdown"
    >
      <header className="flex items-start gap-3">
        <span style={{ backgroundColor: PIN_COLOR }} className="grid size-9 shrink-0 place-items-center rounded-2lg text-text-white">
          <RiSignalTowerFill className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-title-3-medium text-text-primary">{device.name}</h3>
          <p className="flex items-center gap-1.5 text-body-2-regular text-text-secondary">
            {online && <StatusDot color="green" />}
            {online ? "Daring" : "Luring"}{device.last_seen_at ? `, kirim ${relativeTime(device.last_seen_at)}` : ", belum pernah kirim"}
          </p>
        </div>
        <Button variant="ghost" size="xs" iconOnly leadingIcon={RiCloseLine} aria-label="Tutup detail alat" onClick={onClose} />
      </header>

      <div className="rounded-2lg bg-background-inner-default p-3 shadow-card">
        {reading === undefined ? (
          <p className="text-body-2-regular text-text-secondary">Memuat nilai terakhir…</p>
        ) : values.length === 0 ? (
          <p className="text-body-2-regular text-text-secondary">Belum ada data dari alat ini.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {values.slice(0, VALUES_SHOWN).map(item => (
              <div key={item.key} className="min-w-0">
                <dt className="truncate text-caption-1-regular text-text-secondary">{item.label}</dt>
                <dd className="truncate text-body-medium tabular-nums text-text-primary">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {values.length > VALUES_SHOWN && (
          <p className="mt-2 text-caption-1-regular text-text-tertiary">+{values.length - VALUES_SHOWN} nilai lain di halaman alat</p>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-1 text-body-2-regular">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-text-secondary">{term}</dt>
            <dd className="min-w-0 break-words text-right tabular-nums text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="small"
          leadingIcon={RiRouteLine}
          disabled={routing}
          onClick={() => { setRouting(true); void onEvacuate(device).finally(() => setRouting(false)); }}
        >
          {routing ? "Menghitung…" : "Rute evakuasi"}
        </Button>
        <Button variant="secondary" size="small" trailingIcon={RiArrowRightLine} onClick={() => goTo(`/devices/${device.id}`)}>
          Buka detail alat
        </Button>
      </div>
    </motion.section>
  );
}
