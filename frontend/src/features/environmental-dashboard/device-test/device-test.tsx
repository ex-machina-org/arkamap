import { useCallback, useEffect, useState } from "react";
import { RiDeleteBinLine, RiFlaskLine, RiHistoryLine, RiKey2Line, RiPlayLine, RiRestartLine, RiTableLine } from "@remixicon/react";
import { toast } from "sonner";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { Tab, TabList, TabPanel, Tabs } from "@/components/base/tabs/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiList, request, validate, type DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import { formatRelative } from "../device-api";
import { insetClass } from "../components/dashboard-card";
import { DeviceQuickstart } from "../components/device-quickstart";
import { useConfirm } from "../components/device-helpers";
import { Notice, SecretField, SectionCard } from "../components/device-ui";
import { DeviceLog } from "../device-detail/device-log";

const POLL_MS = 3000;

const EVENT = {
  diterima: { label: "Diterima", color: "lime" },
  ulang: { label: "Kiriman Ulang", color: "gray" },
  tabel_baru: { label: "Tabel Baru", color: "blue" },
  versi_baru: { label: "Versi Baru", color: "purple" },
  peringatan: { label: "Peringatan", color: "yellow" },
  bahaya: { label: "Bahaya", color: "rose" },
  ditolak: { label: "Ditolak", color: "rose" },
  nama_diganti: { label: "Nama Diganti", color: "cyan" },
  digabung: { label: "Digabung", color: "cyan" },
  dihapus: { label: "Dihapus", color: "neutral" },
} as const satisfies Record<DTO<"DeviceEvent">["kind"], { label: string; color: string }>;

function remaining(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} j ${minutes % 60} m` : `${minutes} m`;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), intervalMs); return () => window.clearInterval(timer); }, [intervalMs]);
  return now;
}

/** The test device has no list of its own: at most one per account, null when none is running. */
const loadTestDevice = (signal?: AbortSignal) => request("/me/test-device", { signal }).then(value => value === null ? null : validate("DeviceOut", value));

/** A sandbox device with a real key: send anything, watch what the server made of it, then delete it all. */
export function DeviceTestLab() {
  const [device, setDevice] = useState<DTO<"DeviceOut"> | null>();
  const [created, setCreated] = useState<DTO<"DeviceCreated">>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { ask, dialog } = useConfirm();
  const expired = useCallback(() => setDevice(null), []);

  useEffect(() => {
    const controller = new AbortController();
    loadTestDevice(controller.signal).then(setDevice).catch(cause => { if (!controller.signal.aborted) { setDevice(null); setError(cause instanceof Error ? cause.message : "Alat uji gagal dimuat."); } });
    return () => controller.abort();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(undefined);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Tindakan gagal."); }
    finally { setBusy(false); }
  }

  const start = () => run(async () => {
    const value = await api("/me/test-device", "DeviceCreated", { method: "POST" });
    setCreated(value); setDevice(value.device);
  });
  const finish = (id: number) => run(async () => {
    await request(`/me/devices/${id}`, { method: "DELETE" });
    setCreated(undefined); setDevice(null);
    toast.success("Pengujian Selesai", { description: "Alat uji dan seluruh datanya sudah dihapus." });
  });

  if (device === undefined) return <div role="status" aria-label="Memuat Alat Uji" className="flex flex-col gap-4">
    <Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" />
  </div>;

  if (!device) return <div className="flex flex-col gap-4">
    {error && <Notice tone="danger" title="Terjadi Kesalahan">{error}</Notice>}
    <SectionCard icon={RiFlaskLine} tone="purple" title="Uji Alat Tanpa Mengotori Data"
      description="Coba kirim data dari sensor sebelum mendaftarkannya. Tidak muncul di daftar alat, dashboard, maupun peta.">
      <ul className={cx(insetClass, "grid gap-4 p-4 sm:grid-cols-3")}>
        {[
          { icon: RiKey2Line, title: "API Key Uji", text: "Kunci asli lengkap dengan tutorial dan contoh kode." },
          { icon: RiTableLine, title: "Hasil Langsung", text: "Tabel data dan log kejadian diperbarui tiap 3 detik." },
          { icon: RiDeleteBinLine, title: "Terhapus Otomatis", text: "Semua data uji hilang 2 jam lagi atau saat Anda selesai." },
        ].map(item => <li key={item.title} className="flex items-start gap-3">
          <item.icon className="mt-0.5 size-5 shrink-0 text-text-secondary" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <span className="text-body-medium text-text-primary">{item.title}</span>
            <span className="text-body-2-regular text-pretty text-text-secondary">{item.text}</span>
          </div>
        </li>)}
      </ul>
      <Button leadingIcon={RiPlayLine} className="self-start" disabled={busy} onClick={() => void start()}>{busy ? "Menyiapkan..." : "Mulai Pengujian"}</Button>
    </SectionCard>
  </div>;

  return <>
    <ActiveTest key={device.id} device={device} created={created?.device.id === device.id ? created : undefined} busy={busy} error={error}
      onRestart={() => ask({ title: "Ulangi Dari Awal?", description: "Data uji sekarang dihapus dan Anda mendapat API key baru. Alat yang memakai kunci lama berhenti terhubung.", confirmLabel: "Ulangi", run: () => void start() })}
      onFinish={() => ask({ title: "Selesai Dan Hapus Data?", description: "Alat uji, API key, dan semua data uji dihapus permanen.", confirmLabel: "Hapus Semua", destructive: true, run: () => void finish(device.id) })}
      onExpired={expired} />
    {dialog}
  </>;
}

function ActiveTest({ device: initial, created, busy, error, onRestart, onFinish, onExpired }: {
  device: DTO<"DeviceOut">; created?: DTO<"DeviceCreated">; busy: boolean; error?: string;
  onRestart: () => void; onFinish: () => void; onExpired: () => void;
}) {
  const id = initial.id;
  const [device, setDevice] = useState(initial);
  const [streams, setStreams] = useState<DTO<"Stream">[]>([]);
  const [events, setEvents] = useState<DTO<"DeviceEvent">[]>();
  const [quickstart, setQuickstart] = useState(created?.quickstart);
  const now = useNow(5000);

  const poll = useCallback(async (signal: AbortSignal) => {
    const [current, nextStreams, nextEvents] = await Promise.all([
      loadTestDevice(signal), apiList(`/me/devices/${id}/streams`, "Stream", { signal }), apiList(`/me/devices/${id}/events`, "DeviceEvent", { signal }),
    ]);
    if (signal.aborted) return;
    if (current?.id !== id) { onExpired(); return; }
    setDevice(current); setStreams(nextStreams); setEvents(nextEvents);
  }, [id, onExpired]);

  useEffect(() => {
    const controller = new AbortController();
    const tick = () => void poll(controller.signal).catch(() => undefined);
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [poll]);

  useEffect(() => {
    if (quickstart) return;
    const controller = new AbortController();
    api(`/me/devices/${id}/quickstart`, "Quickstart", { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setQuickstart(value); }).catch(() => undefined);
    return () => controller.abort();
  }, [id, quickstart]);

  const readings = streams.reduce((sum, stream) => sum + stream.reading_count, 0);

  return <div className="flex w-full min-w-0 flex-col gap-4">
    {error && <Notice tone="danger" title="Terjadi Kesalahan">{error}</Notice>}

    <SectionCard icon={RiFlaskLine} tone="purple" title={device.name}
      description={<span className="tabular-nums">{`${readings.toLocaleString("id-ID")} data · ${streams.length} tabel · terhapus otomatis dalam ${device.test_expires_at ? remaining(device.test_expires_at, now) : "-"}`}</span>}
      action={<div className="flex flex-wrap items-center gap-2">
        <Chip variant="caption" color="yellow">Mode Uji</Chip>
        <Button size="small" variant="secondary" leadingIcon={RiRestartLine} disabled={busy} onClick={onRestart}>Ulangi Dari Awal</Button>
        <Button size="small" variant="danger" leadingIcon={RiDeleteBinLine} disabled={busy} onClick={onFinish}>Selesai & Hapus Data</Button>
      </div>} />

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Tabs defaultSelectedKey={streams.length || initial.last_seen_at ? "results" : "setup"}>
        <TabList aria-label="Bagian Pengujian">
          <Tab id="setup" icon={RiKey2Line}>API Key & Tutorial</Tab>
          <Tab id="results" icon={RiTableLine} count={readings || undefined}>Hasil Uji</Tab>
        </TabList>
        <TabPanel id="setup" className="flex flex-col gap-4 pt-4 outline-none">
          <SectionCard icon={RiKey2Line} tone="orange" title="API Key Uji"
            description="Pakai kunci ini di sensor seperti alat biasa. Kunci ikut terhapus saat pengujian selesai.">
            {created ? <>
              <SecretField label="API Key" value={created.api_key} />
              <p className="text-caption-1-regular text-text-tertiary">Hanya ditampilkan sekarang. Bila hilang, tekan Ulangi Dari Awal.</p>
            </> : <Notice tone="info" title={`Kunci Aktif Berawalan ${device.key_prefix}`}>Kunci lengkap hanya ditampilkan saat pengujian dimulai. Bila hilang, tekan Ulangi Dari Awal.</Notice>}
            {quickstart ? <DeviceQuickstart quickstart={quickstart} /> : <Skeleton className="h-64 rounded-2xl" />}
          </SectionCard>
        </TabPanel>
        <TabPanel id="results" className="pt-4 outline-none">
          <DeviceLog key={streams.map(stream => stream.id).join()} deviceId={id} streams={streams} pollMs={POLL_MS} />
        </TabPanel>
      </Tabs>

      <SectionCard icon={RiHistoryLine} tone="sky" title="Log Terbaru" description="Apa yang server lakukan pada setiap kiriman." className="xl:sticky xl:top-4">
        <ol aria-live="polite" className="-mx-1 flex max-h-[32rem] flex-col gap-1 overflow-auto px-1">
          {events === undefined && [0, 1, 2].map(index => <li key={index}><Skeleton className="h-14 rounded-lg" /></li>)}
          {events?.length === 0 && <li className={cx(insetClass, "flex items-center gap-2 p-4 text-body-2-regular text-text-secondary")}>
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-status-yellow-text motion-safe:animate-pulse" />Menunggu kiriman pertama...
          </li>}
          {events?.map(event => <li key={event.id} className="flex flex-col gap-1 rounded-lg px-2 py-2 hover:bg-background-primary-hover">
            <span className="flex items-center justify-between gap-2">
              <Chip variant="caption" color={EVENT[event.kind].color}>{EVENT[event.kind].label}</Chip>
              <time dateTime={event.at} title={new Date(event.at).toLocaleString("id-ID")} className="text-caption-1-regular text-text-tertiary tabular-nums">{formatRelative(event.at, now)}</time>
            </span>
            <span className="text-body-2-regular text-pretty break-words text-text-primary">{event.message}</span>
          </li>)}
        </ol>
      </SectionCard>
    </div>
  </div>;
}
