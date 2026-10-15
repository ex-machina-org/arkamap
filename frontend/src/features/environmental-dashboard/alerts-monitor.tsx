"use client";

import { useMemo, useState, type ReactNode } from "react";
import { RiAlarmWarningLine, RiArrowDownSLine, RiArrowRightSLine, RiBroadcastLine, RiFireLine, RiPulseLine, RiRefreshLine, RiSearchLine, RiSettings3Line } from "@remixicon/react";
import type { DTO } from "@/lib/api/client";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Pagination } from "@/components/base/pagination/pagination";
import { Switch } from "@/components/base/switch/switch";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Select, SelectItem } from "@/components/base/select/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cx } from "@/utils/cx";
import { dangerItems, fireLevel, mapHref, REGION_LEVEL, TONE, type RowStatus } from "./alert-level";
import { alertEntries, type AlertEntry } from "./components/alert-entries";
import { AlertRow } from "./components/alert-row";
import { AlertEntries } from "./components/alert-list";
import { DashboardCard, insetClass, PanelUnavailable } from "./components/dashboard-card";
import { CodeSnippet } from "./components/device-quickstart";
import { useDevices } from "./device-api";
import { formatDecimal, formatRelative } from "./format";
import { alertRegions, uniqueWarnings } from "./insights";
import { useSources } from "./use-source-catalog";
import { ALERT_CATEGORIES, DEVICE_ALERT_CATEGORIES, deviceAlertCategory, metricUnit, regionCategory, useNotifications, type AlertCategory, type DeviceAlert, type useAlertPrefs } from "./use-alerts";

type Filter = "all" | AlertCategory;

const PAGE_SIZE = 10;
/** Offline devices listed in the status card; the rest wait in the Perangkat menu. */
const MAX_OFFLINE_ROWS = 3;

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

/** How a device reports aman/bahaya and, optionally, which category its alert belongs to.
 *  Closed so it never pushes the alerts down; the summary reads as a call to action instead. */
function AlertTutorial({ connected }: { connected: boolean }) {
  const [example, setExample] = useState<ExampleId>("dasar");
  return <details className={cx(insetClass, "group flex flex-col gap-2 p-3")}>
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring [&::-webkit-details-marker]:hidden">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-secondary-default text-foreground-icon-secondary"><RiBroadcastLine className="size-4" /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-medium text-text-primary">Hubungkan alat ke peringatan</span>
        <span className="text-caption-1 text-text-secondary">{connected ? "Contoh kiriman dan cara memberi kategori" : "Belum ada alat yang melapor. Lihat cara mengirim status aman/bahaya"}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-caption-1-medium text-text-secondary group-hover:text-text-primary">
        <span className="group-open:hidden">Lihat panduan</span><span className="hidden group-open:inline">Tutup</span>
        <RiArrowDownSLine aria-hidden className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </span>
    </summary>
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

/** One thin bar per source or device, like a status page's uptime strip; the counts beside it carry the meaning.
 *  Tooltips open instantly (a native title waits ~1 s, too long for anyone to find it). */
function StatusStrip({ items }: { items: { key: string; color: RowStatus["color"]; title: string }[] }) {
  return <div className="flex flex-col gap-1">
    <ul aria-hidden className="flex flex-wrap">
      {items.map(item => <Tooltip key={item.key}>
        <TooltipTrigger delay={0} closeDelay={0} render={<li className="group/bar cursor-help px-px py-0.5" />}>
          <span className={cx("block h-5 w-1.5 rounded-full transition-transform group-hover/bar:scale-y-125 motion-reduce:transition-none", TONE[item.color].dot)} />
        </TooltipTrigger>
        <TooltipContent>{item.title}</TooltipContent>
      </Tooltip>)}
    </ul>
    <span className="text-caption-1 text-text-tertiary pointer-coarse:hidden">Arahkan kursor ke batang untuk detail</span>
  </div>;
}

function StatusSection({ label, summary, href, linkLabel, strip, children }: {
  label: string; summary: string; href: string; linkLabel: string;
  strip?: ReactNode; children: ReactNode;
}) {
  return <section aria-label={label} className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between gap-2">
      <h4 className="text-body-medium text-text-primary">{label}</h4>
      <span className="text-caption-1 text-text-secondary tabular-nums">{summary}</span>
    </div>
    {strip}
    <ul className="flex flex-col gap-1.5">{children}</ul>
    <a href={href} className="self-start text-caption-1 text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">{linkLabel}</a>
  </section>;
}

/**
 * "Pemantauan status data": whether the feeds behind the alerts are still delivering.
 * A failed source or an offline device means its alerts can be missing or late,
 * so the card lists only what needs a look.
 */
function DataStatus({ sources, failing, checking, devices, offline }: {
  sources?: DTO<"SourceInfo">[];
  failing: DTO<"SourceAlert">[];
  checking: boolean;
  devices: ReturnType<typeof useDevices>;
  offline: ReturnType<typeof useDevices>["devices"];
}) {
  const failed = new Set(failing.map(source => source.id));
  const online = devices.devices.length - offline.length;
  // ponytail: no usage stats per device, so "top" = ones that have reported before (just dropped) ahead of never-connected ones.
  const shownOffline = [...offline].sort((a, b) => Number(a.lastSeen === "Belum ada data") - Number(b.lastSeen === "Belum ada data")).slice(0, MAX_OFFLINE_ROWS);

  return <DashboardCard title="Pemantauan status data" description="Apakah sumber data dan alat Anda masih mengirim data terbaru. Bila terputus, peringatan dari sumber itu bisa terlambat atau tidak muncul.">

    <StatusSection label="Sumber data resmi" href="/sources" linkLabel="Lihat semua sumber"
      summary={sources?.length ? `${sources.length - failed.size} dari ${sources.length} aktif` : failing.length ? `${failing.length} gagal` : ""}
      strip={sources?.length ? <StatusStrip items={sources.map(source => ({
        key: source.id,
        color: failed.has(source.id) ? "rose" : source.last_ok_at ? "lime" : "neutral",
        title: `${source.title} · ${failed.has(source.id) ? "gagal" : source.last_ok_at ? `diperbarui ${formatRelative(source.last_ok_at)}` : "belum pernah berjalan"}`,
      }))} /> : undefined}>
      {checking ? <li className="text-body-2-regular text-text-secondary">Memeriksa sumber...</li>
        : failing.length ? failing.map(source => (
          <AlertRow key={source.id} kind="source" status={{ color: "rose", label: "Gagal diperbarui" }} title={source.title}
            detail={source.last_error} tags={[`Data terakhir ${formatRelative(source.last_ok_at) ?? "belum pernah masuk"}`]} />
        )) : <li className="text-body-2-regular text-text-secondary">BMKG, NASA FIRMS, GDACS, dan sumber lain diperbarui sesuai jadwalnya.</li>}
    </StatusSection>

    <StatusSection label="Alat IoT Anda" href="/devices" linkLabel="Kelola alat"
      summary={devices.devices.length ? `${online} dari ${devices.devices.length} online` : ""}
      strip={devices.devices.length ? <StatusStrip items={devices.devices.map(device => ({
        key: device.id, color: device.status === "offline" ? "yellow" : "lime", title: `${device.name} · ${device.status === "offline" ? "offline" : "online"}`,
      }))} /> : undefined}>
      {devices.loading ? <li className="text-body-2-regular text-text-secondary">Memeriksa alat...</li>
        : devices.error ? <li role="alert" className="text-body-2-regular text-text-error-primary">{devices.error}</li>
        : !devices.devices.length ? <li className="text-body-2-regular text-text-secondary">Belum ada alat terdaftar. Alat yang terhubung ikut memasok peringatan.</li>
        : offline.length ? <>
          {shownOffline.map(device => (
            <AlertRow key={device.id} kind="device" href={`/devices/${device.backendId}`} linkLabel="Lihat alat" status={{ color: "yellow", label: "Offline" }}
              title={device.name} tags={[device.lastSeen === "Belum ada data" ? "Belum pernah mengirim data" : `Terakhir terlihat ${device.lastSeen}`]} />
          ))}
          {offline.length > shownOffline.length && <li><a href="/devices" className="flex items-center justify-center gap-0.5 rounded-lg py-1.5 text-caption-1-medium text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary">
            +{offline.length - shownOffline.length} alat offline lainnya di menu Perangkat<RiArrowRightSLine aria-hidden className="size-4" />
          </a></li>}
        </> : <li className="text-body-2-regular text-text-secondary">Semua alat mengirim data dalam 15 menit terakhir.</li>}
    </StatusSection>
  </DashboardCard>;
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
      <AlertRow kind={id} level={REGION_LEVEL} tags={[`Skor ${formatDecimal(item.normalised)}/100`]}
        title={item.name} detail={note ? `${item.label} · ${note}` : item.label}
        meta={`${formatDecimal(item.value)} ${metricUnit(item.metric)}`.trim()} href={mapHref({ region: item.region_id })} />
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
      <AlertRow kind="device" href={`/devices/${alert.device_id}`} linkLabel="Lihat alat" level={alert.status === "bahaya" ? "bahaya" : undefined}
        status={alert.status === "aman" ? { color: "lime", label: "Aman" } : undefined} tags={[id !== "device" && "Alat IoT"]}
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
        <AlertRow kind="fire" level={fireLevel(item.confirmed)}
          tags={[item.confirmed ? "Dikonfirmasi GDACS" : "Deteksi satelit"]}
          title={item.province ? `${item.name}, ${item.province}` : item.name}
          detail={`${item.clusters} lokasi panas berulang · ${formatDecimal(item.frp_max)} MW · ${item.satellites.join(", ")}`}
          meta={formatRelative(item.last_seen)} href={mapHref(item)} />
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
  const groupTotals = new Map<string, number>();
  for (const entry of entries) groupTotals.set(entry.group, (groupTotals.get(entry.group) ?? 0) + 1);

  const sources = useSources();
  const offline = devices.devices.filter(device => device.status === "offline");
  const failingSources = data?.source_alerts ?? [];
  const issues = failingSources.length + offline.length;
  const deviceBahaya = deviceAlerts.alerts.filter(alert => alert.status === "bahaya").length;
  const safe = deviceAlerts.alerts.length - deviceBahaya;
  const confirmedFires = split.fire.filter(item => item.confirmed).length;
  const dangers = dangerItems(data, deviceAlerts.alerts).filter(item => enabled.has(item.category));
  const scopeName = region && scope === "region" ? region.name ?? "wilayah pantauan" : "seluruh Indonesia";

  const stats: Stat[] = [
    { icon: RiAlarmWarningLine, label: "Bahaya", value: String(dangers.length), delta: `${total - dangers.length} waspada`, deltaColor: dangers.length ? "rose" : "lime", tone: "orange", caption: `Di ${scopeName}`, breakdown: [{ label: "Bahaya", value: dangers.length, color: "rose" }, { label: "Waspada", value: total - dangers.length, color: "yellow" }], hint: "Peringatan berlevel bahaya: cuaca berat/ekstrem, gempa darurat atau siaga tsunami, GDACS merah, kebakaran terkonfirmasi GDACS, dan alat yang melapor bahaya. Hanya ini yang masuk notifikasi dan pop-up. Rawan kebakaran dan hawa panas selalu waspada." },
    { icon: RiBroadcastLine, label: "Alat IoT bahaya", value: String(deviceBahaya), delta: `${safe} aman`, deltaColor: deviceBahaya ? "rose" : "lime", tone: "purple", caption: `${deviceAlerts.alerts.length} laporan alert dari alat`, breakdown: [{ label: "Bahaya", value: deviceBahaya, color: "rose" }, { label: "Aman", value: safe, color: "lime" }], hint: "Status terakhir yang dikirim alat Anda lewat field \"alert\", termasuk yang berkategori (mis. kebakaran) dan tampil di kategorinya. Hanya status bahaya yang memicu notifikasi." },
    { icon: RiFireLine, label: "Kebakaran", value: String(counts.fire), delta: `${confirmedFires} terkonfirmasi`, deltaColor: confirmedFires ? "rose" : "neutral", tone: "pink", caption: `${counts.fireRisk} wilayah rawan kebakaran`, breakdown: [{ label: "Terkonfirmasi GDACS", value: confirmedFires, color: "rose" }, { label: "Deteksi satelit", value: split.fire.length - confirmedFires, color: "yellow" }, { label: "Dari alat", value: deviceDanger("fire"), color: "purple" }], hint: "Kemungkinan kebakaran, belum dicek lapangan: kabupaten/kota dengan titik panas satelit NASA FIRMS yang terdeteksi berulang dalam 48 jam, setelah lokasi panas menetap (industri, suar gas, gunung api) dan pembangkit termal disaring. Terkonfirmasi bila GDACS juga melaporkan kebakaran hutan di dekatnya; hanya itu yang masuk notifikasi. Ditambah alat Anda yang melapor bahaya dengan kategori \"kebakaran\"." },
    { icon: RiPulseLine, label: "Gangguan sistem", value: String(issues), delta: issues ? "Periksa" : "Normal", deltaColor: issues ? "rose" : "lime", tone: "sky", caption: `${devices.devices.length} alat terdaftar`, breakdown: [{ label: "Sumber data gagal", value: failingSources.length, color: "rose" }, { label: "Alat offline", value: offline.length, color: "yellow" }, { label: "Alat online", value: devices.devices.length - offline.length, color: "lime" }], hint: "Sumber data yang gagal diperbarui dan perangkat IoT akun Anda yang tidak mengirim data 15 menit terakhir." },
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <DashboardCard
          className="relative isolate overflow-hidden [&_.shadow-card]:bg-background-inner-default/70 [&_.shadow-card]:backdrop-blur-[2px]"
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
          {/* The ranger mascot behind the list, purely decorative (isolate keeps -z-10 above the card's own background).
              The card's tiles turn slightly translucent so it still shows through the rows in light mode. */}
          <img src="/brand/mascot-ranger.webp" alt="" aria-hidden width={420} height={480} loading="lazy"
            className="pointer-events-none absolute -right-8 -bottom-10 -z-10 w-56 opacity-30 select-none sm:w-80 dark:opacity-10" />
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
                  <AlertEntries entries={pageEntries} totals={groupTotals} />
                </div>
                {pageCount > 1 && <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-body-2-regular text-text-secondary tabular-nums">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, entries.length)} dari {entries.length} peringatan</p>
                  <Pagination page={currentPage} totalPages={pageCount} onChange={setPage} />
                </div>}
              </>}
              {!visibleCount && <PanelUnavailable
                title={total ? "Tidak ada peringatan yang cocok" : "Tidak ada peringatan aktif"}
                description={total ? "Coba kategori atau kata kunci lain." : "Belum ada peringatan dari kategori yang Anda pantau saat ini."} />}
              {show("device") && !deviceAlerts.loading && <AlertTutorial connected={!!deviceAlerts.alerts.length} />}
            </div>
          )}
        </DashboardCard>

        <DataStatus sources={sources} failing={failingSources} checking={!data && notifications.loading} devices={devices} offline={offline} />
      </div>
    </div>
  );
}
