import { useEffect, useState } from "react";
import { RiArrowLeftLine, RiDashboard3Line, RiHistoryLine, RiKey2Line, RiMapPinLine, RiRefreshLine, RiSettings3Line } from "@remixicon/react";
import { StatIconTile } from "@/components/application/dashboard/stat-cards";
import { Chip } from "@/components/base/badges/chip";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Switch } from "@/components/base/switch/switch";
import { Tab, TabList, TabPanel, Tabs } from "@/components/base/tabs/tabs";
import { apiList, type DTO } from "@/lib/api/client";
import { deviceKindLabel } from "../device-data";
import { deviceView, formatRelative, isOnline, useDevice } from "../device-api";
import { PanelUnavailable, cardClass, insetClass } from "../components/dashboard-card";
import { KIND_ICON } from "../components/device-helpers";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/utils/cx";
import { DeviceConnection, NameWarnings } from "./device-connection";
import { DeviceLog } from "./device-log";
import { DeviceOverview } from "./device-overview";
import { DeviceSettings } from "./device-settings";
import { RANGES, useReadings } from "./readings";

/** There is no push channel, so "live" means re-reading the device and its newest readings on this interval. */
const LIVE_MS = 15_000;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), intervalMs); return () => window.clearInterval(timer); }, [intervalMs]);
  return now;
}

export function DeviceDetail({ id }: { id: number }) {
  const [live, setLive] = useState(true);
  const [hours, setHours] = useState(24);
  const [version, setVersion] = useState(0);
  const pollMs = live ? LIVE_MS : undefined;
  const { device, error, loading, missing, updatedAt, refresh } = useDevice(id, pollMs);
  const readings = useReadings(id, { hours, limit: 5000, reload: version }, hours === 24 ? pollMs : undefined);
  // an empty range would blank every card; show the newest readings the history tab can see instead
  const latest = useReadings(id, { hours: 24 * 90, limit: 1000, reload: version, skip: readings.data?.readings.length !== 0 });
  const [streams, setStreams] = useState<DTO<"Stream">[]>([]);
  const now = useNow(5000);
  const seen = device?.last_seen_at;

  useEffect(() => {
    const controller = new AbortController();
    apiList(`/me/devices/${id}/streams`, "Stream", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setStreams(value); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [id, seen, version]);

  if (loading && !device) return <div role="status" aria-label="Memuat Alat" className="flex flex-col gap-4">
    <Skeleton className="h-32 rounded-2xl" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div>
    <Skeleton className="h-72 rounded-2xl" />
  </div>;
  if (missing || !device) return <PanelUnavailable title={error ? "Alat Gagal Dimuat" : "Alat Tidak Ditemukan"} description={error ?? "Alat ini tidak ada di akun Anda atau sudah dihapus."}
    action={<ButtonLink href="/devices" variant="secondary" leadingIcon={RiArrowLeftLine}>Kembali Ke Daftar Alat</ButtonLink>} />;

  const view = deviceView(device);
  const online = isOnline(seen);
  const changed = () => { refresh(); setVersion(value => value + 1); };
  const status = seen ? online ? { label: "Online", color: "lime" as const } : { label: "Offline", color: "rose" as const } : { label: "Belum Terhubung", color: "neutral" as const };

  return <div className="flex w-full min-w-0 flex-col gap-4">
    <section className={cx(cardClass, "gap-3")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <StatIconTile icon={KIND_ICON[view.kind]} tone={seen ? online ? "emerald" : "orange" : "blue"} className="size-12 rounded-xl" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-title-1-medium text-balance text-text-primary">{device.name}</h2>
              <Chip variant="caption" color={status.color} className="gap-1.5">
                {online && <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />}{status.label}
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip variant="caption" color="gray">{deviceKindLabel(view)}</Chip>
              <Chip variant="caption" color="soft" className="gap-1"><RiMapPinLine className="size-3.5" aria-hidden />{device.region_name ?? "Lokasi Belum Ditentukan"}</Chip>
            </div>
          </div>
        </div>
        <div className={cx(insetClass, "flex items-center gap-3 py-1.5 pr-1.5 pl-3")}>
          <Switch isSelected={live} onChange={setLive}>Perbarui Otomatis</Switch>
          <Button size="small" variant="secondary" iconOnly aria-label="Muat Ulang" leadingIcon={RiRefreshLine} onClick={changed} />
        </div>
      </div>
      <p className="text-caption-1-regular text-text-secondary tabular-nums" aria-live="polite">
        Data terakhir {formatRelative(seen, now)}{updatedAt ? ` · diperiksa ${formatRelative(new Date(updatedAt).toISOString(), now)}` : ""}{live ? " · diperbarui setiap 15 detik" : " · pembaruan otomatis dijeda"}
      </p>
    </section>

    <NameWarnings key={device.id} deviceId={device.id} streams={streams} />
    <Tabs defaultSelectedKey="overview">
      <TabList aria-label="Bagian Detail Alat">
        <Tab id="overview" icon={RiDashboard3Line}>Ringkasan</Tab>
        <Tab id="log" icon={RiHistoryLine} count={streams.length > 1 ? streams.length : undefined}>Riwayat</Tab>
        <Tab id="settings" icon={RiSettings3Line}>Pengaturan</Tab>
        <Tab id="api-key" icon={RiKey2Line}>API Key</Tab>
      </TabList>
      <TabPanel id="overview" className="flex flex-col gap-4 pt-4 outline-none">
        <DeviceOverview device={device} streams={streams} readings={readings.data} latest={latest.data} hours={hours} loading={readings.loading} error={readings.error}
          range={<SegmentedControl aria-label="Rentang Waktu" selectedKeys={new Set([String(hours)])} onSelectionChange={keys => { const next = [...keys][0]; if (next) setHours(Number(next)); }}>
            {RANGES.map(range => <SegmentedControlItem key={range.id} id={range.id}>{range.label}</SegmentedControlItem>)}
          </SegmentedControl>}
          note={hours !== 24 && live ? "Grafik rentang panjang tidak diperbarui otomatis. Tekan Muat Ulang untuk data terbaru." : undefined} />
      </TabPanel>
      <TabPanel id="log" className="pt-4 outline-none">
        <DeviceLog key={streams.map(stream => stream.id).join()} deviceId={id} streams={streams} pollMs={pollMs} />
      </TabPanel>
      <TabPanel id="settings" className="pt-4 outline-none">
        <DeviceSettings key={device.id} device={device} streams={streams} onChanged={changed} />
      </TabPanel>
      <TabPanel id="api-key" className="pt-4 outline-none">
        <DeviceConnection key={device.id} device={device} streams={streams} onChanged={changed} />
      </TabPanel>
    </Tabs>
  </div>;
}
