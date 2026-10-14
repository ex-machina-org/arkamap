"use client";

import { useMemo, useState } from "react";
import { RiAlarmWarningLine, RiBroadcastLine, RiFireLine, RiPulseLine, RiRefreshLine, RiSearchLine, RiSettings3Line } from "@remixicon/react";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Pagination } from "@/components/base/pagination/pagination";
import { Switch } from "@/components/base/switch/switch";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Select, SelectItem } from "@/components/base/select/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cx } from "@/utils/cx";
import { dangerItems, fireLevel, REGION_LEVEL } from "./alert-level";
import { alertEntries, type AlertEntry } from "./components/alert-entries";
import { AlertRow } from "./components/alert-row";
import { AlertEntries } from "./components/alert-list";
import { DashboardCard, insetClass, PanelUnavailable } from "./components/dashboard-card";
import { CodeSnippet } from "./components/device-quickstart";
import { useDevices } from "./device-api";
import { formatDecimal, formatRelative } from "./format";
import { alertRegions, uniqueWarnings } from "./insights";
import { ALERT_CATEGORIES, DEVICE_ALERT_CATEGORIES, deviceAlertCategory, metricUnit, regionCategory, useNotifications, type AlertCategory, type DeviceAlert, type useAlertPrefs } from "./use-alerts";

type Filter = "all" | AlertCategory;

const PAGE_SIZE = 10;

/** "dasar" has no kategori (general Alat IoT); "kategori" files the bahaya report under, and notifies as, Kebakaran. */
const ALERT_EXAMPLES = {
  dasar: { nama: "pompa", data: { tekanan_bar: 0.4 }, alert: { status: "bahaya", pesan: "Tekanan pompa di bawah batas" } },
  kategori: { nama: "gudang", data: { suhu: 71.5, asap_ppm: 830 }, alert: { status: "bahaya", pesan: "Asap terdeteksi di gudang", kategori: "kebakaran" } },
};
type ExampleId = keyof typeof ALERT_EXAMPLES;

const alertExample = (id: ExampleId) => {
  const { nama, data, alert } = ALERT_EXAMPLES[id];
  return JSON.stringify({ nama, waktu: "2026-10-13T08:00:00+07:00", data, alert }, null, 2);
};

const code = (text: string) => <code className="font-mono text-text-primary">{text}</code>;

const categoryLabel = (id: AlertCategory) => ALERT_CATEGORIES.find(category => category.id === id)!.label;

const matches = (search: string, ...values: (string | null | undefined)[]) =>
  !search || values.some(value => value?.toLocaleLowerCase("id-ID").includes(search));

/** How a device reports aman/bahaya and, optionally, which category its alert belongs to. Open until the first alert arrives. */
function AlertTutorial({ open }: { open: boolean }) {
  const [example, setExample] = useState<ExampleId>("dasar");
  return <details open={open || undefined} className={cx(insetClass, "flex flex-col gap-2 p-3")}>
    <summary className="cursor-pointer text-body-medium text-text-primary">Hubungkan alat ke peringatan</summary>
    <div className="mt-2 flex flex-col gap-3">
      <p className="text-body-2-regular text-text-secondary">
        Tambahkan field {code("\"alert\"")} berisi {code("\"aman\"")} atau {code("\"bahaya\"")} pada kiriman alat. Kartu alat muncul otomatis di sini; hanya status bahaya yang mengirim notifikasi.
      </p>
      <SegmentedControl aria-label="Contoh kiriman" className="self-start" selectedKeys={new Set([example])} onSelectionChange={keys => { const next = [...keys][0]; if (next) setExample(next as ExampleId); }}>
        <SegmentedControlItem id="dasar">Dasar</SegmentedControlItem>
        <SegmentedControlItem id="kategori">Dengan kategori</SegmentedControlItem>
      </SegmentedControl>
      <CodeSnippet code={alertExample(example)} label={example === "dasar" ? "kiriman-alat.json" : "kiriman-kategori.json"} />
      {example === "kategori" && <p className="text-body-2-regular text-text-secondary">
        Isi {code("kategori")} dengan {Object.entries(DEVICE_ALERT_CATEGORIES).map(([kategori, id], index) => <span key={kategori}>{index ? ", " : ""}{code(`"${kategori}"`)} ({categoryLabel(id)})</span>)}.
        Alert tampil di kategori itu dengan label Alat IoT. Tanpa kategori, alert masuk ke Alat IoT biasa.
      </p>}
    </div>
  </details>;
}

/**
 * The page behind "Pemantauan & Peringatan": the categories the user chose,
 * the aman/bahaya state their own devices report, and the health of the
 * sources and devices that feed them.
 */
export function AlertsMonitor({ deviceAlerts, regional, region, prefs }: {
  deviceAlerts: { alerts: DeviceAlert[]; loading: boolean; error?: string };
  /** The workspace's region-scoped feed, shared with the bell and the pop-up. */
  regional: ReturnType<typeof useNotifications>;
  region?: { id: string; name?: string | null };
  prefs: ReturnType<typeof useAlertPrefs>;
}) {
  const [scope, setScope] = useState<"region" | "all">("region");
  const national = useNotifications(region && scope === "all" ? "/notifications" : null);
  const notifications = region && scope === "all" ? national : regional;
  const [onlyDanger, setOnlyDanger] = useState(false);
  const devices = useDevices();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { enabled } = prefs;
  const data = notifications.data;
  const activeFilter = filter !== "all" && !enabled.has(filter) ? "all" : filter;

  // Region indicators split by what they measure: fire-prone conditions, heat, the rest.
  const split = useMemo(() => {
    const regions = data ? alertRegions(data) : [];
    return {
      device: deviceAlerts.alerts.filter(alert => deviceAlertCategory(alert) === "device"),
      fire: data?.fire_alerts ?? [],
      fireRisk: regions.filter(item => regionCategory(item.metric) === "fireRisk"),
      heat: regions.filter(item => regionCategory(item.metric) === "heat"),
      weather: data ? uniqueWarnings(data) : [],
      quake: data?.quake_alerts ?? [],
      disaster: data?.disaster_alerts ?? [],
      region: regions.filter(item => regionCategory(item.metric) === "region"),
    };
  }, [data, deviceAlerts.alerts]);

  // A device alert with "kategori" joins that category; only its bahaya state counts, as for general device alerts.
  const deviceDanger = (id: AlertCategory) => deviceAlerts.alerts.filter(alert => alert.status === "bahaya" && deviceAlertCategory(alert) === id).length;
  const counts: Record<AlertCategory, number> = {
    device: deviceDanger("device"),
    fire: split.fire.length + deviceDanger("fire"),
    fireRisk: split.fireRisk.length,
    heat: split.heat.length + deviceDanger("heat"),
    weather: split.weather.length + deviceDanger("weather"),
    quake: split.quake.length + deviceDanger("quake"),
    disaster: split.disaster.length + deviceDanger("disaster"),
    region: split.region.length,
  };
  const total = ALERT_CATEGORIES.reduce((sum, { id }) => sum + (enabled.has(id) ? counts[id] : 0), 0);

  const search = query.trim().toLocaleLowerCase("id-ID");
  const show = (id: AlertCategory) => enabled.has(id) && (activeFilter === "all" || activeFilter === id);
  const regionRows = (id: "fireRisk" | "heat", note?: string): AlertEntry[] => !show(id) ? [] : split[id]
    .filter(item => matches(search, item.name, item.label))
    .map(item => ({ group: categoryLabel(id), key: `${id}:${item.region_id}:${item.metric}`, level: REGION_LEVEL, node: (
      <AlertRow level={REGION_LEVEL} tag={`${formatDecimal(item.normalised)}/100`}
        title={item.name} detail={note ? `${item.label} · ${note}` : item.label}
        meta={`${formatDecimal(item.value)} ${metricUnit(item.metric)}`.trim()} />
    ) }));
  const hazards = {
    weather_warnings: show("weather") ? split.weather.filter(item => matches(search, item.headline, item.event, item.area)) : [],
    quake_alerts: show("quake") ? split.quake.filter(item => matches(search, item.place)) : [],
    disaster_alerts: show("disaster") ? split.disaster.filter(item => matches(search, item.name, item.type)) : [],
    region_alerts: show("region") ? split.region.filter(item => matches(search, item.name, item.label)) : [],
  };
  // Filed under a hazard, a device alert keeps an "Alat IoT" chip so it never passes for an official source.
  const deviceRows = (id: AlertCategory): AlertEntry[] => !show(id) ? [] : deviceAlerts.alerts
    .filter(alert => deviceAlertCategory(alert) === id && matches(search, alert.device_name, alert.nama, alert.message, alert.region_name))
    .map(alert => ({ group: categoryLabel(id), key: `iot:${alert.device_id}:${alert.nama}`, level: alert.status === "bahaya" ? "bahaya" as const : undefined, node: (
      <AlertRow href={`/devices/${alert.device_id}`} level={alert.status === "bahaya" ? "bahaya" : "aman"}
        tag={id !== "device" ? `Alat IoT · ${alert.status === "bahaya" ? "Bahaya" : "Aman"}` : undefined}
        title={`${alert.device_name} · ${alert.nama}`}
        detail={alert.message ?? alert.region_name}
        meta={formatRelative(alert.status === "bahaya" ? alert.changed_at : alert.updated_at)} />
    ) }));
  const none = { weather_warnings: [], quake_alerts: [], disaster_alerts: [], region_alerts: [] };
  const entries: AlertEntry[] = [
    ...deviceRows("device"),
    ...deviceRows("fire"),
    ...(show("fire") ? split.fire.filter(item => matches(search, item.name, item.province)) : []).map(item => ({
      group: "Kebakaran", key: `fire:${item.region_id}`, level: fireLevel(item.confirmed), node: (
        <AlertRow level={fireLevel(item.confirmed)}
          tag={item.confirmed ? "GDACS" : "Satelit"}
          title={item.province ? `${item.name}, ${item.province}` : item.name}
          detail={`${item.clusters} lokasi panas berulang · ${formatDecimal(item.frp_max)} MW · ${item.satellites.join(", ")}`}
          meta={formatRelative(item.last_seen)} />
      ) })),
    ...deviceRows("weather"),
    ...alertEntries({ ...none, weather_warnings: hazards.weather_warnings }),
    ...deviceRows("quake"),
    ...alertEntries({ ...none, quake_alerts: hazards.quake_alerts }),
    ...deviceRows("disaster"),
    ...alertEntries({ ...none, disaster_alerts: hazards.disaster_alerts }),
    ...regionRows("fireRisk"),
    ...deviceRows("heat"),
    ...regionRows("heat"),
    ...alertEntries({ ...none, region_alerts: hazards.region_alerts }),
  ].filter(entry => !onlyDanger || entry.level === "bahaya");
  const visibleCount = entries.length;
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  // A narrower filter can leave the old page past the end; clamp instead of resetting state in an effect.
  const currentPage = Math.min(page, pageCount);
  const pageEntries = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const offline = devices.devices.filter(device => device.status === "offline");
  const failingSources = data?.source_alerts ?? [];
  const issues = failingSources.length + offline.length;
  const deviceBahaya = deviceAlerts.alerts.filter(alert => alert.status === "bahaya").length;
  const safe = deviceAlerts.alerts.length - deviceBahaya;
  const confirmedFires = split.fire.filter(item => item.confirmed).length;
  const dangers = dangerItems(data, deviceAlerts.alerts).filter(item => enabled.has(item.category));
  const scopeName = region && scope === "region" ? region.name ?? "wilayah pantauan" : "seluruh Indonesia";

  const online = devices.devices.length - offline.length;
  const stats: Stat[] = [
    { icon: RiAlarmWarningLine, label: "Bahaya", value: String(dangers.length), delta: "", deltaColor: dangers.length ? "rose" : "lime", tone: "orange", hint: "Peringatan berlevel bahaya: cuaca berat/ekstrem, gempa darurat atau siaga tsunami, GDACS merah, kebakaran terkonfirmasi GDACS, dan alat yang melapor bahaya. Hanya ini yang masuk notifikasi dan pop-up. Rawan kebakaran dan hawa panas selalu waspada.",
      breakdown: [{ label: "Bahaya", value: dangers.length, tone: "danger" }, { label: "Waspada", value: total - dangers.length, tone: "warning" }] },
    { icon: RiBroadcastLine, label: "Alat IoT", value: String(deviceBahaya), delta: "", deltaColor: deviceBahaya ? "rose" : "lime", tone: "purple", hint: "Status terakhir yang dikirim alat Anda lewat field \"alert\", termasuk yang berkategori (mis. kebakaran) dan tampil di kategorinya. Hanya status bahaya yang memicu notifikasi.",
      breakdown: [{ label: "Bahaya", value: deviceBahaya, tone: "danger" }, { label: "Aman", value: safe, tone: "success" }] },
    { icon: RiFireLine, label: "Kebakaran", value: String(counts.fire), delta: "", deltaColor: confirmedFires ? "rose" : "neutral", tone: "pink", hint: "Kemungkinan kebakaran, belum dicek lapangan: kabupaten/kota dengan titik panas satelit NASA FIRMS yang terdeteksi berulang dalam 48 jam, setelah lokasi panas menetap (industri, suar gas, gunung api) dan pembangkit termal disaring. Terkonfirmasi bila GDACS juga melaporkan kebakaran hutan di dekatnya; hanya itu yang masuk notifikasi. Ditambah alat Anda yang melapor bahaya dengan kategori \"kebakaran\".",
      breakdown: [
        { label: "Terkonfirmasi GDACS", value: confirmedFires, tone: "danger" },
        { label: "Deteksi satelit", value: split.fire.length - confirmedFires, tone: "warning" },
        { label: "Dari alat", value: deviceDanger("fire"), tone: "danger" },
        { label: "Wilayah rawan", value: split.fireRisk.length, tone: "neutral" },
      ] },
    { icon: RiPulseLine, label: "Gangguan sistem", value: String(issues), delta: "", deltaColor: issues ? "rose" : "lime", tone: "sky", hint: "Sumber data yang gagal diperbarui dan perangkat IoT akun Anda yang tidak mengirim data 15 menit terakhir.",
      breakdown: [
        { label: "Sumber gagal", value: failingSources.length, tone: "danger" },
        { label: "Alat offline", value: offline.length, tone: "warning" },
        { label: "Alat online", value: online, tone: "success" },
      ] },
  ];

  const loading = !data && notifications.loading;

  return (
    <div className="flex flex-col gap-4">
      <StatCards variant="breakdown" columns={4} stats={stats} />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-6xl!">
          <DialogHeader>
            <DialogTitle className="text-title-2-semibold">Atur peringatan</DialogTitle>
            <DialogDescription className="text-body-medium text-text-secondary">Pilih peringatan yang ingin Anda pantau. Kategori yang dimatikan tidak tampil dan tidak mengirim notifikasi.</DialogDescription>
          </DialogHeader>
          <ul className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
            {ALERT_CATEGORIES.map(category => (
              <li key={category.id} className={cx(insetClass, "flex flex-col gap-1 p-3")}>
                <Checkbox isSelected={enabled.has(category.id)} onChange={on => prefs.toggle(category.id, on)}>{category.label}</Checkbox>
                <span className="text-body-2-regular text-text-secondary">{category.description}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="primary" onClick={() => setSettingsOpen(false)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <DashboardCard
          title="Peringatan aktif"
          description={notifications.updatedAt ? `${region && scope === "region" ? `Wilayah ${scopeName}` : "Seluruh Indonesia"} · diperbarui ${formatRelative(notifications.updatedAt)}` : "Memuat peringatan..."}
          action={<div className="flex gap-2">
            <Button variant="secondary" size="small" leadingIcon={RiSettings3Line} onClick={() => setSettingsOpen(true)}>Atur</Button>
            <Button variant="secondary" size="small" leadingIcon={RiRefreshLine} disabled={notifications.loading} onClick={notifications.refresh}>Muat ulang</Button>
          </div>}
        >
          <div className="flex flex-wrap items-center gap-2">
            {region && (
              <SegmentedControl aria-label="Cakupan wilayah" selectedKeys={new Set([scope])} onSelectionChange={keys => { const next = [...keys][0]; if (next) { setScope(next as "region" | "all"); setPage(1); } }}>
                <SegmentedControlItem id="region">{region.name ?? "Wilayah pantauan"}</SegmentedControlItem>
                <SegmentedControlItem id="all">Seluruh Indonesia</SegmentedControlItem>
              </SegmentedControl>
            )}
            <Select aria-label="Kategori peringatan" selectedKey={activeFilter} onSelectionChange={key => { setFilter(String(key) as Filter); setPage(1); }}>
              <SelectItem id="all">{`Semua kategori (${total})`}</SelectItem>
              {ALERT_CATEGORIES.filter(category => enabled.has(category.id)).map(category => (
                <SelectItem key={category.id} id={category.id}>{`${category.label} (${counts[category.id]})`}</SelectItem>
              ))}
            </Select>
            <Input aria-label="Cari peringatan" placeholder="Cari lokasi, alat, atau kejadian" leadingIcon={RiSearchLine} value={query} onChange={value => { setQuery(value); setPage(1); }}
              fieldClassName="rounded-full bg-background-supporting-default" className="min-w-48 flex-1" />
            <Switch size="sm" isSelected={onlyDanger} onChange={on => { setOnlyDanger(on); setPage(1); }}>Hanya bahaya</Switch>
          </div>
          {!region && <p className="text-body-2-regular text-text-secondary">Belum ada wilayah di profil; peringatan mencakup seluruh Indonesia.</p>}
          {notifications.error && <p role="alert" className="text-body-regular text-text-error-primary">{notifications.error}</p>}
          {deviceAlerts.error && enabled.has("device") && <p role="alert" className="text-body-regular text-text-error-primary">{deviceAlerts.error}</p>}

          {!enabled.size ? (
            <PanelUnavailable title="Tidak ada kategori dipantau" description="Semua kategori dimatikan. Buka Atur untuk memilih peringatan yang ingin dipantau." />
          ) : loading ? (
            <p role="status" className="text-body-regular text-text-secondary">Memuat peringatan...</p>
          ) : (
            <div className="flex flex-col gap-4">
              {!!entries.length && <>
                <div className="max-h-[32rem] overflow-y-auto pr-1 [scrollbar-width:thin]">
                  <AlertEntries entries={pageEntries} />
                </div>
                {pageCount > 1 && <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-body-2-regular text-text-secondary tabular-nums">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, entries.length)} dari {entries.length} peringatan</p>
                  <Pagination page={currentPage} totalPages={pageCount} onChange={setPage} />
                </div>}
              </>}
              {!visibleCount && <PanelUnavailable
                title={total ? "Tidak ada peringatan yang cocok" : "Tidak ada peringatan aktif"}
                description={total ? "Coba kategori atau kata kunci lain." : "Belum ada peringatan dari kategori yang Anda pantau saat ini."} />}
              {show("device") && !deviceAlerts.loading && <AlertTutorial open={!deviceAlerts.alerts.length} />}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Status pemantauan" description="Kesehatan sumber data dan perangkat yang memasok peringatan.">
          <section aria-label="Sumber data" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-body-medium text-text-secondary">Sumber data</h4>
              <a href="/sources" className="text-caption-1 text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">Lihat semua</a>
            </div>
            <ul className="flex flex-col gap-1.5">
              {!data ? <li className="text-body-2-regular text-text-secondary">{notifications.loading ? "Memeriksa sumber..." : "Status sumber tidak tersedia."}</li>
                : failingSources.length ? failingSources.map(source => (
                  <li key={source.id} className={cx(insetClass, "flex flex-col gap-0.5 px-3 py-2")}>
                    <span className="flex items-center gap-2">
                      <Chip variant="bold" color="rose">Gagal</Chip>
                      <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{source.title}</span>
                    </span>
                    <span className="line-clamp-2 text-body-2-regular text-text-secondary" title={source.last_error ?? undefined}>{source.last_error}</span>
                    <span className="text-caption-1 text-text-tertiary">Terakhir berhasil {formatRelative(source.last_ok_at) ?? "belum pernah"}</span>
                  </li>
                )) : (
                  <li className={cx(insetClass, "flex items-center gap-2 px-3 py-2")}>
                    <Chip variant="bold" color="lime">Normal</Chip>
                    <span className="text-body-medium text-text-primary">Semua sumber berjalan normal</span>
                  </li>
                )}
            </ul>
          </section>

          <section aria-label="Perangkat IoT" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-body-medium text-text-secondary">Perangkat IoT</h4>
              <a href="/devices" className="text-caption-1 text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">Kelola</a>
            </div>
            <ul className="flex flex-col gap-1.5">
              {devices.loading ? <li className="text-body-2-regular text-text-secondary">Memeriksa perangkat...</li>
                : devices.error ? <li role="alert" className="text-body-2-regular text-text-error-primary">{devices.error}</li>
                : !devices.devices.length ? <li className="text-body-2-regular text-text-secondary">Belum ada perangkat terdaftar.</li>
                : <>
                  <li className={cx(insetClass, "flex items-center gap-2 px-3 py-2")}>
                    <Chip variant="bold" color={offline.length ? "yellow" : "lime"}>{devices.devices.length - offline.length}/{devices.devices.length}</Chip>
                    <span className="text-body-medium text-text-primary">Perangkat online</span>
                  </li>
                  {offline.map(device => (
                    <AlertRow key={device.id} href={`/devices/${device.backendId}`} level="waspada" tag="Offline" title={device.name} meta={device.lastSeen} />
                  ))}
                </>}
            </ul>
          </section>
        </DashboardCard>
      </div>
    </div>
  );
}
