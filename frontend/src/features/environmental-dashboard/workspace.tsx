"use client";

import { goTo } from "@/lib/navigate";
import { useDevices } from "./device-api";
import { ApiDashboard } from "./components/api-dashboard";
import { useSession } from "@/hooks/use-session";
import { greeting } from "./greeting";
import { useProfileSwitcher } from "@/hooks/use-profile-switcher";
import { profileArtwork } from "@/lib/profile-artwork";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

// Loaded when shown: each of these pulls in maplibre (device pages, the preview map) or the whole chat (Kodama's panel),
// which the dashboard itself does not need to appear.
const DeviceForm = lazy(() => import("./device-form").then(module => ({ default: module.DeviceForm })));
const DeviceDetail = lazy(() => import("./device-detail/device-detail").then(module => ({ default: module.DeviceDetail })));
const DeviceTestLab = lazy(() => import("./device-test/device-test").then(module => ({ default: module.DeviceTestLab })));
const PreviewIncidentMap = lazy(() => import("./preview-incident-map").then(module => ({ default: module.PreviewIncidentMap })));
const JevAssistantPanel = lazy(() => import("@/components/application/jev-chat/jev-assistant-panel").then(module => ({ default: module.JevAssistantPanel })));
import type { MapPreset } from "./map-controller";
import {
  RiAddLine,
  RiFlaskLine,
  RiBroadcastLine,
  RiChatAiLine,
  RiCompass3Line,
  RiDownload2Line,
  RiFileList3Line,
  RiFireLine,
  RiMapPinLine,
  RiSearchLine,
  RiSendPlane2Fill,
  RiShieldCheckLine,
  RiUserLocationLine,
  RiWindyLine,
} from "@remixicon/react";
import { toast } from "sonner";

// Registered Design System Components
import {
  JointsAppShell,
  type AppShellNotification,
} from "@/components/application/app-shell/joints-app-shell";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { LogRow } from "@/components/application/agent-log/agent-log";
import { EnvironmentalDataTable } from "./environmental-data-table";
import { DataSources } from "./data-sources";
import { AlertsMonitor } from "./alerts-monitor";
import { useAlertPrefs, useDeviceAlerts, useNotifications, useSeenAlerts } from "./use-alerts";
import { dangerItems } from "./alert-level";
import { DangerAlertDialog } from "./components/danger-alert-dialog";
import { DeviceRegistry } from "./device-registry";
import { NAVIGATION_ITEMS } from "./navigation";

import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/buttons/button-group";
import { Badge } from "@/components/base/badges/badge";
import { Chip } from "@/components/base/badges/chip";
import { StatusDot } from "@/components/base/badges/status-dot";
import { Breadcrumb, BreadcrumbItem } from "@/components/base/breadcrumb/breadcrumb";
import { Kbd } from "@/components/base/kbd/kbd";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Select, SelectItem } from "@/components/base/select/select";
import { Switch } from "@/components/base/switch/switch";
import { Tabs, TabList, Tab, TabPanel } from "@/components/base/tabs/tabs";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";

import { AuditCard } from "@/components/ui/audit-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FadeDivider } from "@/components/ui/fade-divider";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { SyncProgress, type SyncStep } from "@/components/ui/sync-progress";
import { TruncatedText } from "@/components/ui/truncated-text";

import {
  INITIAL_AUDIT_LOGS,
  INITIAL_INCIDENTS,
  type EnvironmentalIncident,
  type HazardType,
  type ModeType,
} from "./environmental-data";
import { KodamaMark } from "@/components/foundations/brand/kodama-icon";


const NOTIFICATIONS: AppShellNotification[] = [
  {
    id: "notif-1",
    title: "VIIRS Pass 02:15 WIB",
    detail: "8 hotspot Siak terklasifikasi Kritis (Conf 96%).",
  },
  {
    id: "notif-2",
    title: "Citarum TMA 185 cm",
    detail: "Jembatan Karangligar terisolasi. Arus 2,4 m/s.",
  },
  {
    id: "notif-3",
    title: "ONLIMO #08 DO Anomaly",
    detail: "DO 1,42 mg/L di hilir industri Batujajar.",
  },
];

const STATS_DATA: Stat[] = [
  {
    icon: RiFireLine,
    label: "Hotspot & Bencana",
    value: "18 Titik",
    delta: "+4 baru",
    deltaColor: "rose",
    tone: "orange",
    caption: "3 Kritis · 3 Tinggi",
    hint: "VIIRS & Sentinel-1 SAR dalam 24 jam terakhir.",
  },
  {
    icon: RiUserLocationLine,
    label: "Populasi Berisiko",
    value: "142.850",
    delta: "+8,2%",
    deltaColor: "rose",
    tone: "pink",
    caption: "Radius buffer < 3,5 km",
    hint: "Overlay pemukiman BPS pada perimeter bahaya aktif.",
  },
  {
    icon: RiBroadcastLine,
    label: "Grid Sensor IoT",
    value: "98,6%",
    delta: "140 / 142",
    deltaColor: "lime",
    tone: "emerald",
    caption: "2 node kalibrasi",
    hint: "Node telemetri TMA gambut, AWLR sungai, dan PM2.5.",
  },
  {
    icon: RiWindyLine,
    label: "ISPU Rata-rata",
    value: "148 AQI",
    delta: "Tidak Sehat",
    deltaColor: "rose",
    tone: "blue",
    caption: "PM2.5 dominan",
    hint: "Rata-rata tertimbang stasiun KLHK & sensor warga.",
  },
];

const SYNC_PIPELINE_STEPS: SyncStep[] = [
  { id: "s1", label: "140 / 142 Stasiun AWLR & ISPU Online", status: "complete" },
  { id: "s2", label: "NASA VIIRS NOAA-20 Pass 02:15 WIB Terverifikasi", status: "complete" },
  { id: "s3", label: "Sentinel-1 SAR Radar Inundation Mask", status: "complete" },
  { id: "s4", label: "Model Propagasi Karhutla & Genangan Jev", status: "current" },
];

export default function EnvironmentalDashboardWorkspace({ devicePage, deviceId, page, preview = false }: { devicePage?: "list" | "new" | "detail" | "test"; deviceId?: number; page?: "sources" | "alerts"; preview?: boolean } = {}) {
  const [activeNav, setActiveNav] = useState(page ?? (devicePage ? "sensors" : "overview"));
  // The live dashboard puts its arrange controls in the page header, next to the greeting.
  const [dashboardActions, setDashboardActions] = useState<HTMLDivElement | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const { devices: accountDevices } = useDevices();
  const deviceCount = accountDevices.length;
  const session = useSession();
  const profileSwitcher = useProfileSwitcher();
  const alertPrefs = useAlertPrefs();
  const signedIn = !preview && !!session.me;
  // Alerts follow the active profile's region; without one they cover all of Indonesia.
  const alertRegion = session.me?.profile?.region_id ? { id: session.me.profile.region_id, name: session.me.profile.region_name } : undefined;
  const deviceAlerts = useDeviceAlerts(signedIn);
  const regionalAlerts = useNotifications(!signedIn ? null : alertRegion ? `/notifications?region_id=${encodeURIComponent(alertRegion.id)}` : "/notifications");
  // Only "bahaya" reaches the bell and the pop-up; "waspada" stays on the alerts page.
  const dangerAlerts = useMemo(
    () => dangerItems(regionalAlerts.data, deviceAlerts.alerts).filter(item => alertPrefs.enabled.has(item.category)),
    [regionalAlerts.data, deviceAlerts.alerts, alertPrefs.enabled],
  );
  const { seen: seenAlerts, markSeen } = useSeenAlerts();
  const unseenDangers = dangerAlerts.filter(item => !seenAlerts.has(item.key));
  // The red alerts menu reopens every active danger on click; "?bahaya" carries that click across a page load.
  const [showAllDangers, setShowAllDangers] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bahaya"));
  const dialogDangers = showAllDangers ? dangerAlerts : unseenDangers;
  const closeDangers = () => {
    markSeen(dialogDangers.map(item => item.key));
    setShowAllDangers(false);
    if (window.location.search.includes("bahaya")) window.history.replaceState(null, "", window.location.pathname);
  };
  const [selectedMode, setSelectedMode] = useState<ModeType | "all">("all");
  const [selectedHazard, setSelectedHazard] = useState<HazardType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [incidents, setIncidents] = useState<EnvironmentalIncident[]>(INITIAL_INCIDENTS);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>("inc-01");
  const [mapPreset, setMapPreset] = useState<MapPreset>("all");
  const [activeRightTab, setActiveRightTab] = useState<string>("evidence");

  // Layer switches
  const [showHotspots, setShowHotspots] = useState(true);
  const [showFloods, setShowFloods] = useState(true);
  const [showAirQuality, setShowAirQuality] = useState(true);
  const [showSensors, setShowSensors] = useState(true);

  // Modals & Drawers
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [confirmDispatchOpen, setConfirmDispatchOpen] = useState(false);
  const [forensicSheetOpen, setForensicSheetOpen] = useState(false);
  const [reportType, setReportType] = useState("all-hazards");
  const [dispatchUnit, setDispatchUnit] = useState("manggala-agni");

  // Assistant State
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantResponse, setAssistantResponse] = useState<string | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);

  useEffect(() => {
    if (activeNav === "responder") setSelectedMode("responder");
    else if (activeNav === "protect") setSelectedMode("protect");
    else if (activeNav === "plan") setSelectedMode("plan");
    else if (activeNav === "overview") setSelectedMode("all");
  }, [activeNav]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((item) => {
      if (selectedMode !== "all" && item.mode !== selectedMode) return false;
      if (selectedHazard !== "all" && item.hazardType !== selectedHazard) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesLoc = item.location.toLowerCase().includes(query);
        const matchesProv = item.province.toLowerCase().includes(query);
        if (!matchesTitle && !matchesLoc && !matchesProv) return false;
      }
      return true;
    });
  }, [incidents, selectedMode, selectedHazard, searchQuery]);

  const activeIncident = useMemo(() => {
    return (
      incidents.find((i) => i.id === selectedIncidentId) ||
      filteredIncidents[0] ||
      incidents[0]
    );
  }, [incidents, selectedIncidentId, filteredIncidents]);

  function handleSelectIncident(incident: EnvironmentalIncident) {
    setSelectedIncidentId(incident.id);
  }

  function handleConfirmDispatchOrder() {
    setIncidents((prev) =>
      prev.map((i) =>
        i.id === selectedIncidentId ? { ...i, status: "Dalam Penanganan" } : i
      )
    );
    toast.success("Surat Perintah Disposisi Telah Terbit", {
      description: `Unit pengerahan menerima koordinat ${activeIncident?.coords.join(", ")} untuk evakuasi & pemadaman.`,
    });
  }

  function handleBatchDispatch(selectedIncidents: EnvironmentalIncident[]) {
    setIncidents((prev) =>
      prev.map((inc) =>
        selectedIncidents.some((s) => s.id === inc.id)
          ? { ...inc, status: "Dalam Penanganan" }
          : inc
      )
    );
    toast.success(`Disposisi Massal (${selectedIncidents.length} Tim Terbit)`, {
      description: `Surat perintah pengerahan serentak untuk: ${selectedIncidents.map((s) => s.title).join(", ")}.`,
    });
  }

  function handleBatchDownloadGeoJSON(selectedIncidents: EnvironmentalIncident[]) {
    toast.success(`Paket GeoJSON Terunduh (${selectedIncidents.length} Wilayah)`, {
      description: "Polygon multi-hazard diekspor ke GeoJSON format standar.",
    });
  }

  function handleGenerateReport(e: React.FormEvent) {
    e.preventDefault();
    setReportModalOpen(false);
    toast.success("Dokumen Intelijen Terunduh", {
      description: "Briefing PDF multi-hazard & paket GeoJSON terkompilasi.",
    });
  }

  function handleAskAssistant(promptText?: string) {
    const query = promptText || assistantQuery;
    if (!query.trim()) return;
    setAssistantLoading(true);
    setAssistantResponse(null);

    setTimeout(() => {
      setAssistantLoading(false);
      if (query.toLowerCase().includes("kritis") || query.toLowerCase().includes("hotspot")) {
        setAssistantResponse(
          "Prioritas Utama: Siak (Skor 9.6) & Karawang (Skor 9.3). Keduanya mengancam fasilitas puskesmas dan sekolah radius <3 km. Rekomendasi: ground deployment Manggala Agni dan perahu evakuasi BPBD."
        );
        setSelectedIncidentId("inc-01");
      } else if (query.toLowerCase().includes("karawang") || query.toLowerCase().includes("banjir")) {
        setAssistantResponse(
          "Jembatan Telukjambe terendam TMA 185 cm. Rute dialihkan via Lingkar Barat (+14 menit, aman genangan)."
        );
        setSelectedIncidentId("inc-02");
      } else if (query.toLowerCase().includes("marunda") || query.toLowerCase().includes("polusi")) {
        setAssistantResponse(
          "Pola emisi nocturnal Marunda (23:00-04:00) PM2.5 >170 µg/m³. Rekomendasi: Sidak DLH ke 3 peleburan logam KBN."
        );
        setSelectedIncidentId("inc-04");
      } else {
        setAssistantResponse(
          `Hasil analisis: 18 titik bahaya terverifikasi, 142.850 jiwa dalam radius pemantauan darurat.`
        );
      }
      toast.info("Analisis Kodama selesai");
    }, 550);
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      {/* Sync Node Indicator with Tooltip */}
      <TooltipTrigger delay={100}>
        <button
          type="button"
          onClick={() => setActiveRightTab("telemetry")}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-1 text-xs transition-colors hover:bg-background-primary-hover"
        >
          <StatusDot color="green" />
          <span className="font-medium text-text-secondary">140/142 Synced</span>
          <Badge color="neutral" className="ml-1 text-[10px]">98%</Badge>
        </button>
        <Tooltip size="sm">Grid telemetri IoT & citra satelit NASA terhubung aktif</Tooltip>
      </TooltipTrigger>

      <Button
        variant="secondary"
        size="small"
        leadingIcon={KodamaMark}
        onClick={() => {
          setActiveRightTab("assistant");
          handleAskAssistant("Wilayah paling kritis ditangani sekarang");
        }}
      >
        Tanya Kodama
      </Button>

      <Button
        variant="primary"
        size="small"
        leadingIcon={RiFileList3Line}
        onClick={() => setReportModalOpen(true)}
      >
        Briefing PDF
      </Button>
    </div>
  );

  return (
    <>
      <JointsAppShell
        navigation={NAVIGATION_ITEMS.map((item) => item.id === "sensors" ? { ...item, badge: String(deviceCount) } : item.id === "alerts" && dangerAlerts.length ? { ...item, tone: "danger" as const, badge: dangerAlerts.length > 99 ? "99+" : String(dangerAlerts.length) } : item)}
        activeId={activeNav}
        assistant={!preview && assistantOpen ? <Suspense fallback={null}><JevAssistantPanel onClose={() => setAssistantOpen(false)} /></Suspense> : undefined}
        onAskAssistant={preview ? undefined : () => setAssistantOpen(true)}
        identity={preview ? undefined : {
          name: session.me?.user.name ?? "Pengunjung",
          role: session.me?.profile?.role ?? "Map publik",
          avatarSrc: session.me?.profile ? profileArtwork(session.me.profile.mode) : undefined,
        }}
        onAccountAction={preview ? undefined : label => { if (label === "Keluar" && session.me) void session.logout().catch(cause => toast.error(cause.message)); else window.dispatchEvent(new Event("arkamap-profile-open")); }}
        profiles={preview ? undefined : profileSwitcher.options}
        activeMode={preview ? selectedMode : session.me?.profile?.mode === "protected" ? "protect" : session.me?.profile?.mode === "responden" ? "responder" : session.me?.profile?.mode === "plan" ? "plan" : "all"}
        onModeChange={(m) => {
          setSelectedMode(m);
          if (m === "all") setActiveNav("overview");
          else setActiveNav(m);
        }}
        onNavigate={(id) => {
          if (!preview && ["forensics", "simulator"].includes(id)) { toast.info("Fitur masih Preview", { description: "Backend belum menyediakan alur operasional fitur ini." }); return; }
          if (!preview && id === "reports") { goTo("/map"); return; }
          if (id === "components") goTo("/design-system");
          else if (id === "map" || id === "siri-map") goTo("/map");
          else if (id === "forensics") setForensicSheetOpen(true);
          else if (id === "reports") setReportModalOpen(true);
          else if (id === "simulator") {
            toast.info("Simulator Spasial Aktif", {
              description: "Model prediksi dispersi asap & pergerakan banjir dibuka.",
            });
          }
          else if (id === "alerts" && dangerAlerts.length) {
            if (!preview && page !== "alerts") goTo("/alerts?bahaya");
            else { setActiveNav("alerts"); setShowAllDangers(true); }
          }
          // every menu has its own address, so Back works and a link can be shared; the session stays loaded
          else if (!preview) goTo(NAVIGATION_ITEMS.find(item => item.id === id)?.href ?? (id === "sensors" ? "/devices" : "/dashboard"));
          else setActiveNav(id);
        }}
        title={devicePage === "new" ? "Tambah Alat" : devicePage === "test" ? "Uji Alat" : devicePage === "detail" ? "Detail Alat" : activeNav === "sensors" ? "Perangkat IoT & BYOD" : activeNav === "sources" ? "Sumber Data" : activeNav === "alerts" ? "Pemantauan & Peringatan" : !preview && session.me ? greeting(session.me.user.name) : "Environmental Command Center"}
        breadcrumbs={devicePage === "new" || devicePage === "detail" || devicePage === "test" ? [{ label: "Home", href: "/dashboard" }, { label: "Perangkat IoT & BYOD", href: "/devices" }, { label: devicePage === "new" ? "Tambah Alat" : devicePage === "test" ? "Uji Alat" : "Detail Alat", current: true }] : undefined}
        description={
          devicePage === "new" ? "Daftarkan alat lalu hubungkan ke server Arkamap" : devicePage === "test" ? "Coba kirim data dengan API key sementara; semua data uji terhapus otomatis" : devicePage === "detail" ? "Data terbaru, riwayat kiriman, dan pengaturan alat" : activeNav === "sensors"
            ? "Pantau status alat milik instansi dan perangkat mitra (BYOD)"
            : activeNav === "sources" ? "Sumber data API dan IoT yang dipakai Arkamap"
            : activeNav === "alerts" ? "Peringatan bahaya aktif dan kesehatan sumber data serta perangkat"
            : preview ? "Multi-hazard spatial intelligence & telemetry" : "Environmental Command Center"
        }
        actions={<>{devicePage === "new" || devicePage === "detail" || devicePage === "test" ? undefined : activeNav === "sensors" ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="small" leadingIcon={RiFlaskLine} onClick={() => goTo("/devices/test")}>
              Uji Alat
            </Button>
            <Button variant="primary" size="small" leadingIcon={RiAddLine} onClick={() => goTo("/devices/new")}>
              Tambah Alat
            </Button>
          </div>
        ) : preview ? headerActions : activeNav === "alerts" || activeNav === "sources" ? undefined : <div ref={setDashboardActions} className="flex items-center gap-2" />}</>}
        notifications={preview ? NOTIFICATIONS : dangerAlerts.map(item => ({ id: item.key, title: `Bahaya: ${item.title}`, detail: item.detail, unread: !seenAlerts.has(item.key) }))}
        onNotificationsOpen={preview ? undefined : () => markSeen(dangerAlerts.map(item => item.key))}
        commands={preview ? [
          {
            id: "cmd-hotspot",
            label: "Fokus ke Hotspot Siak (9.6 Kritis)",
            group: "Prioritas",
            onSelect: () => setSelectedIncidentId("inc-01"),
          },
          {
            id: "cmd-flood",
            label: "Fokus ke Banjir Karawang (9.3 Kritis)",
            group: "Prioritas",
            onSelect: () => setSelectedIncidentId("inc-02"),
          },
          {
            id: "cmd-briefing",
            label: "Unduh Dokumen Briefing Situasi",
            group: "Aksi",
            onSelect: () => setReportModalOpen(true),
          },
          {
            id: "cmd-forensic",
            label: "Buka Forensik Spasial Multi-Sensor",
            group: "Analisis",
            onSelect: () => setForensicSheetOpen(true),
          },
        ] : [{ id: "cmd-map", label: "Buka pantauan dan laporan wilayah", group: "Navigasi", onSelect: () => goTo("/map") }]}
      >
        {devicePage === "new" ? <Suspense fallback={null}><DeviceForm /></Suspense> : devicePage === "test" ? <Suspense fallback={null}><DeviceTestLab /></Suspense> : devicePage === "detail" && deviceId !== undefined ? <Suspense fallback={null}><DeviceDetail id={deviceId} /></Suspense> : activeNav === "sensors" ? <DeviceRegistry /> : activeNav === "sources" ? <DataSources /> : activeNav === "alerts" ? <AlertsMonitor deviceAlerts={deviceAlerts} regional={regionalAlerts} region={alertRegion} prefs={alertPrefs} /> : !preview ? <ApiDashboard actionSlot={dashboardActions} /> : (
        <div className="flex flex-col gap-3">
          {/* 2. Sleek Filter Bar with SegmentedControl & Kbd */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-button-default bg-background-primary-default p-2 shadow-2xs">
            {/* Mode Switching via SegmentedControl */}
            <div className="overflow-x-auto [scrollbar-width:none]">
              <SegmentedControl
                selectedKeys={[selectedMode]}
                onSelectionChange={(keys) => {
                  const k = Array.from(keys)[0];
                  if (k) setSelectedMode(k as ModeType | "all");
                }}
              >
                <SegmentedControlItem id="all">
                  Semua ({incidents.length})
                </SegmentedControlItem>
                <SegmentedControlItem id="responder">
                  <span className="flex items-center gap-1">
                    <RiFireLine className="size-3 text-text-error-primary" />
                    Responder (4)
                  </span>
                </SegmentedControlItem>
                <SegmentedControlItem id="protect">
                  <span className="flex items-center gap-1">
                    <RiShieldCheckLine className="size-3 text-info" />
                    Protect (2)
                  </span>
                </SegmentedControlItem>
                <SegmentedControlItem id="plan">
                  <span className="flex items-center gap-1">
                    <RiCompass3Line className="size-3 text-success" />
                    Plan (2)
                  </span>
                </SegmentedControlItem>
              </SegmentedControl>
            </div>

            {/* Search Input with Kbd hint + Hazard Select */}
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <RiSearchLine className="absolute left-2.5 size-3.5 text-text-tertiary" />
                <input
                  type="text"
                  placeholder="Cari wilayah..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-36 sm:w-48 rounded-md border border-border-button-default bg-background-primary-default pl-7 pr-8 text-xs text-text-primary outline-none focus:border-accent-500"
                />
                <Kbd className="absolute right-1.5 text-[9px] px-1 py-0 text-text-tertiary">⌘K</Kbd>
              </div>

              <Select
                aria-label="Filter bahaya"
                selectedKey={selectedHazard}
                onSelectionChange={(k) => setSelectedHazard(k as HazardType | "all")}
                triggerClassName="h-8 text-xs py-0 px-2.5"
              >
                <SelectItem id="all">Semua Bahaya</SelectItem>
                <SelectItem id="hotspot">Karhutla (Hotspot)</SelectItem>
                <SelectItem id="flood">Banjir (SAR Inundation)</SelectItem>
                <SelectItem id="air_quality">Kualitas Udara (ISPU)</SelectItem>
                <SelectItem id="iot_sensor">Sensor DAS & Limbah</SelectItem>
              </Select>
            </div>
          </div>

          {/* 3. Stat Cards */}
          <StatCards variant="footer" columns={4} stats={STATS_DATA} />

          {/* 4. Split Main Workspace */}
          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            {/* Left Column: Spatial Map & Priority Table */}
            <div className="flex min-w-0 flex-col gap-3.5">
              {/* Map Card */}
              <Card size="sm" className="relative overflow-hidden shadow-2xs">
                <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2">
                  <div className="flex items-center gap-2">
                    <RiMapPinLine className="size-4 text-accent-600" />
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider">
                      Peta Spasial Indonesia ({filteredIncidents.length} Titik Bahaya)
                    </CardTitle>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Geographic Presets via ButtonGroup */}
                    <ButtonGroup size="small">
                      <ButtonGroupItem
                        selected={mapPreset === "all"}
                        onClick={() => setMapPreset("all")}
                      >
                        Nasional
                      </ButtonGroupItem>
                      <ButtonGroupItem
                        selected={mapPreset === "sumatra"}
                        onClick={() => setMapPreset("sumatra")}
                      >
                        Sumatra
                      </ButtonGroupItem>
                      <ButtonGroupItem
                        selected={mapPreset === "jawa"}
                        onClick={() => setMapPreset("jawa")}
                      >
                        Jawa
                      </ButtonGroupItem>
                      <ButtonGroupItem
                        selected={mapPreset === "kalimantan"}
                        onClick={() => setMapPreset("kalimantan")}
                      >
                        Kalimantan
                      </ButtonGroupItem>
                    </ButtonGroup>

                    <Separator orientation="vertical" className="h-5 hidden sm:block" />

                    {/* Layer Switches */}
                    <div className="flex items-center gap-3 text-xs">
                      <Switch size="sm" isSelected={showHotspots} onChange={setShowHotspots}>
                        <span className="text-[11px] text-text-secondary">Hotspot</span>
                      </Switch>
                      <Switch size="sm" isSelected={showFloods} onChange={setShowFloods}>
                        <span className="text-[11px] text-text-secondary">Banjir</span>
                      </Switch>
                      <Switch size="sm" isSelected={showAirQuality} onChange={setShowAirQuality}>
                        <span className="text-[11px] text-text-secondary">ISPU</span>
                      </Switch>
                      <Switch size="sm" isSelected={showSensors} onChange={setShowSensors}>
                        <span className="text-[11px] text-text-secondary">IoT</span>
                      </Switch>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="relative h-[380px] w-full overflow-hidden rounded-b-xl bg-background-full">
                    <Suspense fallback={null}>
                      <PreviewIncidentMap filteredIncidents={filteredIncidents} activeIncident={activeIncident} mapPreset={mapPreset}
                        showHotspots={showHotspots} showFloods={showFloods} showAirQuality={showAirQuality} showSensors={showSensors}
                        handleSelectIncident={handleSelectIncident} />
                    </Suspense>
                  </div>
                </CardContent>
              </Card>

              {/* Registered BoardUI Data Table with Multi-Select, Sorting & Pagination */}
              {filteredIncidents.length === 0 ? (
                <EmptyState
                  title="Tidak ada insiden ditemukan"
                  description="Coba sesuaikan kata kunci pencarian atau filter bahaya."
                  action={
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => {
                        setSelectedMode("all");
                        setSelectedHazard("all");
                        setSearchQuery("");
                      }}
                    >
                      Reset Filter
                    </Button>
                  }
                  className="m-3"
                />
              ) : (
                <EnvironmentalDataTable
                  data={filteredIncidents}
                  activeIncidentId={activeIncident?.id}
                  onSelectIncident={handleSelectIncident}
                  onOpenForensic={(incident) => {
                    handleSelectIncident(incident);
                    setForensicSheetOpen(true);
                  }}
                  onBatchDispatch={handleBatchDispatch}
                  onBatchDownloadGeoJSON={handleBatchDownloadGeoJSON}
                  pageSize={5}
                  showDensityToggle={true}
                />
              )}
            </div>

            {/* Right Column: Multi-tab Inspection Suite */}
            <div className="flex min-w-0 flex-col gap-3">
              <Tabs
                selectedKey={activeRightTab}
                onSelectionChange={(k) => setActiveRightTab(k as string)}
                className="w-full"
              >
                <div className="rounded-xl border border-border-button-default bg-background-primary-default p-1 shadow-2xs">
                  <TabList>
                    <Tab id="evidence" icon={RiShieldCheckLine} count="Aktif">
                      Bukti Spasial
                    </Tab>
                    <Tab id="assistant" icon={RiChatAiLine} count="AI">
                      Kodama
                    </Tab>
                    <Tab id="telemetry" icon={RiBroadcastLine} count="140">
                      Grid & Sync
                    </Tab>
                  </TabList>
                </div>

                {/* Panel 1: Bukti Spasial & Rekomendasi Jev */}
                <TabPanel id="evidence" className="space-y-3 pt-1">
                  <div className="rounded-xl border border-border-button-default bg-background-primary-default p-3.5 shadow-2xs">
                    {/* Geographic Breadcrumb Navigation */}
                    <div className="mb-2">
                      <Breadcrumb>
                        <BreadcrumbItem icon={RiCompass3Line} onClick={() => setMapPreset("all")}>
                          Nasional
                        </BreadcrumbItem>
                        <BreadcrumbItem icon={RiMapPinLine} onClick={() => {}}>
                          {activeIncident.province}
                        </BreadcrumbItem>
                        <BreadcrumbItem icon={RiMapPinLine} current>
                          {activeIncident.location.split(",")[0]}
                        </BreadcrumbItem>
                      </Breadcrumb>
                    </div>

                    <div className="flex items-center justify-between border-b border-border-button-default pb-2.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-accent-600">
                          Forensik Intelijen Lapangan
                        </p>
                        <h3 className="font-semibold text-sm text-text-primary truncate">
                          {activeIncident.title}
                        </h3>
                      </div>
                      <StatusBadge tone={activeIncident.urgency === "critical" ? "danger" : "warning"}>
                        Skor {activeIncident.urgencyScore} / 10
                      </StatusBadge>
                    </div>

                    <div className="mt-3 space-y-2.5 text-xs">
                      <TruncatedText className="text-text-secondary leading-snug">
                        {activeIncident.summary}
                      </TruncatedText>

                      {/* 2x2 High-Density Data Grid */}
                      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border-button-default bg-background-supporting-default p-2 text-[11px]">
                        <div>
                          <span className="text-text-tertiary">Radius Bahaya:</span>
                          <p className="font-semibold text-text-primary">
                            {activeIncident.evidence.threatRadiusKm} km
                          </p>
                        </div>
                        <div>
                          <span className="text-text-tertiary">Populasi Terdampak:</span>
                          <p className="font-semibold text-text-primary">
                            {activeIncident.populationAtRisk.toLocaleString("id-ID")} jiwa
                          </p>
                        </div>
                        <div>
                          <span className="text-text-tertiary">Satelit Sensor:</span>
                          <p className="font-semibold text-text-primary truncate">
                            {activeIncident.evidence.satellitePass?.split("(")[0]}
                          </p>
                        </div>
                        <div>
                          <span className="text-text-tertiary">Bacaan Telemetri:</span>
                          <p className="font-semibold text-text-primary truncate">
                            {activeIncident.evidence.sensorReading?.split(":")[1]?.trim() || "-"}
                          </p>
                        </div>
                      </div>

                      {/* Critical Facilities Affected with Chip */}
                      <div>
                        <span className="text-[11px] font-medium text-text-secondary">
                          Fasilitas Kritis Terdampak:
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {activeIncident.evidence.criticalFacilities.map((fac) => (
                            <Chip key={fac} variant="caption" color="soft">
                              {fac}
                            </Chip>
                          ))}
                        </div>
                      </div>

                      {/* Single Directive Recommendation */}
                      <div className="rounded-lg border-l-2 border-accent-600 bg-accent-50/60 p-2.5 text-[11px] dark:bg-accent-950/30">
                        <strong className="text-accent-800 dark:text-accent-300">Rekomendasi:</strong>{" "}
                        <span className="text-text-primary">{activeIncident.recommendation}</span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="primary"
                          size="small"
                          className="flex-1"
                          onClick={() => setDispatchModalOpen(true)}
                        >
                          Disposisi Tim
                        </Button>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => setForensicSheetOpen(true)}
                        >
                          Forensik Spasial
                        </Button>
                        <Button
                          variant="secondary"
                          size="small"
                          leadingIcon={RiDownload2Line}
                          onClick={() => toast.success("GeoJSON Bahaya Terunduh")}
                        >
                          GeoJSON
                        </Button>
                      </div>
                    </div>
                  </div>

                  <AuditCard title="Aktivitas Terverifikasi" entries={INITIAL_AUDIT_LOGS.slice(0, 3)} />
                </TabPanel>

                {/* Panel 2: Jev AI Assistant & Agent Reasoning Log */}
                <TabPanel id="assistant" className="space-y-3 pt-1">
                  <div className="rounded-xl border border-border-button-default bg-background-primary-default p-3 shadow-2xs">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <RiChatAiLine className="size-3.5 text-accent-600" />
                        <span className="text-xs font-semibold text-text-primary">Kodama</span>
                      </div>
                      <Badge color="primary">LLM + RAG Spasial</Badge>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Kueri analitik spasial..."
                        value={assistantQuery}
                        onChange={(e) => setAssistantQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAskAssistant()}
                        className="h-8.5 w-full rounded-lg border border-border-button-default bg-background-primary-default pl-2.5 pr-12 text-xs outline-none focus:border-accent-500"
                      />
                      <div className="absolute right-1 top-1 flex items-center gap-1">
                        <Kbd className="text-[9px] px-1 py-0">↵</Kbd>
                        <button
                          type="button"
                          aria-label="Kirim kueri"
                          onClick={() => handleAskAssistant()}
                          disabled={assistantLoading}
                          className="grid size-6.5 place-items-center rounded bg-button-primary text-white"
                        >
                          <RiSendPlane2Fill className="size-3" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Suggestion Chips */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button type="button" onClick={() => handleAskAssistant("Wilayah paling kritis")}>
                        <Chip variant="caption" color="neutral" className="cursor-pointer hover:bg-background-tertiary-hover">
                          "Wilayah paling kritis"
                        </Chip>
                      </button>
                      <button type="button" onClick={() => handleAskAssistant("Rute evakuasi Karawang")}>
                        <Chip variant="caption" color="neutral" className="cursor-pointer hover:bg-background-tertiary-hover">
                          "Rute Karawang"
                        </Chip>
                      </button>
                      <button type="button" onClick={() => handleAskAssistant("Sidak Marunda PM2.5")}>
                        <Chip variant="caption" color="neutral" className="cursor-pointer hover:bg-background-tertiary-hover">
                          "Sidak Marunda"
                        </Chip>
                      </button>
                    </div>

                    {/* Agent Thinking Indicator */}
                    {assistantLoading && (
                      <div className="mt-3 rounded-lg border border-accent-200/60 bg-accent-50/40 p-2.5 dark:border-accent-900/40 dark:bg-accent-950/20">
                        <AgentThinking
                          variant="stars"
                          label="Mengkorelasikan VIIRS pass, SAR banjir, dan 142 sensor..."
                          tone="accent"
                          showTimer
                        />
                      </div>
                    )}

                    {/* Assistant Response Card */}
                    {assistantResponse && !assistantLoading && (
                      <div className="mt-3 rounded-lg border border-accent-200 bg-accent-50/60 p-2.5 text-xs text-text-primary dark:border-accent-900/60 dark:bg-accent-950/20">
                        <p className="font-semibold text-accent-700 dark:text-accent-300 text-[10px] uppercase tracking-wider">
                          Insight Rekomendasi Kodama:
                        </p>
                        <p className="mt-1 text-[11px] leading-snug">{assistantResponse}</p>
                      </div>
                    )}

                    {/* Structured Agent Log Steps */}
                    <div className="mt-3 rounded-lg border border-border-button-default bg-background-supporting-default p-2.5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                          Protokol Validasi Multi-Sensor
                        </span>
                        <span className="text-[10px] font-medium text-accent-600">3 Langkah Tuntas</span>
                      </div>
                      <ol className="space-y-1.5 text-xs">
                        <LogRow first={true} last={false} reduce={false}>
                          <p className="text-[11px] text-text-primary">1. Filter hotspot VIIRS confidence &gt; 90%</p>
                        </LogRow>
                        <LogRow first={false} last={false} reduce={false}>
                          <p className="text-[11px] text-text-primary">2. Spasial buffer 3,5 km terhadap fasilitas kritis BPS</p>
                        </LogRow>
                        <LogRow first={false} last={true} reduce={false}>
                          <p className="text-[11px] text-text-primary">3. Komputasi rute aman evakuasi bebas genangan</p>
                        </LogRow>
                      </ol>
                    </div>
                  </div>
                </TabPanel>

                {/* Panel 3: Sync Progress & Telemetry Stations */}
                <TabPanel id="telemetry" className="space-y-3 pt-1">
                  {/* SyncProgress Component */}
                  <SyncProgress
                    title="Sinkronisasi Telemetri & Satelit"
                    percent={98}
                    steps={SYNC_PIPELINE_STEPS}
                  />

                  {/* Active Sensor Nodes Grid */}
                  <div className="rounded-xl border border-border-button-default bg-background-primary-default p-3 shadow-2xs">
                    <h4 className="text-xs font-semibold text-text-primary mb-2">
                      Status Node Sensor Lapangan
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between rounded-lg border border-border-button-default bg-background-supporting-default px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <StatusDot color="green" />
                          <span className="font-medium text-text-primary">TMA Gambut Dayun Siak</span>
                        </div>
                        <span className="font-mono text-caption-2 text-success font-semibold">-48 cm (Kering)</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border-button-default bg-background-supporting-default px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <StatusDot color="green" />
                          <span className="font-medium text-text-primary">AWLR Telukjambe Citarum</span>
                        </div>
                        <span className="font-mono text-caption-2 text-info font-semibold">185 cm (Siaga I)</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border-button-default bg-background-supporting-default px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <StatusDot color="indigo" />
                          <span className="font-medium text-text-primary">PM2.5 Stasiun Marunda</span>
                        </div>
                        <span className="font-mono text-caption-2 text-chart-4 font-semibold">182 µg/m³</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border-button-default bg-background-supporting-default px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <StatusDot color="yellow" />
                          <span className="font-medium text-text-primary">ONLIMO Batujajar Citarum</span>
                        </div>
                        <span className="font-mono text-caption-2 text-warning font-semibold">DO 1,42 mg/L</span>
                      </div>
                    </div>
                  </div>
                </TabPanel>
              </Tabs>
            </div>
          </div>
        </div>
        )}
      </JointsAppShell>

      <DangerAlertDialog
        items={dialogDangers}
        regionName={alertRegion?.name}
        onClose={closeDangers}
        onOpenAlerts={() => {
          closeDangers();
          if (devicePage || page) goTo("/alerts");
          else setActiveNav("alerts");
        }}
      />

      {/* Forensic Deep Dive Sheet (Sliding Side Drawer) */}
      <Sheet open={forensicSheetOpen} onOpenChange={setForensicSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-5">
          <SheetHeader>
            <SheetTitle>Forensik Spasial & Telemetri Multi-Sensor</SheetTitle>
            <SheetDescription>
              Dekomposisi spektral satelit dan data telemetri real-time untuk verifikasi hukum & evakuasi.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="rounded-lg border border-border-button-default bg-background-supporting-default p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-600">
                Identitas Insiden
              </span>
              <h4 className="font-semibold text-sm text-text-primary">{activeIncident.title}</h4>
              <p className="text-text-secondary mt-0.5">{activeIncident.location} · {activeIncident.province}</p>
            </div>

            <div className="space-y-2">
              <h5 className="font-semibold text-text-primary">Dekomposisi Spektral & Radar</h5>
              <div className="space-y-1.5">
                <div className="flex justify-between rounded border border-border-button-default p-2">
                  <span className="text-text-secondary">Band SWIR 2.2µm (Thermal):</span>
                  <span className="font-mono font-medium text-text-error-primary">348 Kelvin (Hotspot)</span>
                </div>
                <div className="flex justify-between rounded border border-border-button-default p-2">
                  <span className="text-text-secondary">Sentinel-1 SAR Backscatter:</span>
                  <span className="font-mono font-medium text-info">-18.4 dB (Inundation)</span>
                </div>
                <div className="flex justify-between rounded border border-border-button-default p-2">
                  <span className="text-text-secondary">Confidence Algoritma Jev:</span>
                  <span className="font-mono font-medium text-success">96.4% Terverifikasi</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="font-semibold text-text-primary">Koordinat & Batas Wilayah</h5>
              <p className="font-mono rounded bg-background-supporting-default p-2 text-caption-2 text-text-secondary">
                Latitude: {activeIncident.coords[1].toFixed(5)}, Longitude: {activeIncident.coords[0].toFixed(5)}
              </p>
            </div>

            <FadeDivider />

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="small"
                className="flex-1"
                onClick={() => {
                  setForensicSheetOpen(false);
                  setDispatchModalOpen(true);
                }}
              >
                Disposisi Tim
              </Button>
              <Button
                variant="secondary"
                size="small"
                leadingIcon={RiDownload2Line}
                onClick={() => toast.success("Paket Bukti GeoTIFF & GeoJSON Diunduh")}
              >
                Unduh Data
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Briefing PDF Dialog */}
      <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Laporan Briefing Situasi</DialogTitle>
            <DialogDescription>
              Kompilasi ringkas data multi-hazard untuk pengambil keputusan (BPBD, KLHK, Pemda).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerateReport} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-primary">
                Cakupan Laporan:
              </label>
              <Select selectedKey={reportType} onSelectionChange={(k) => setReportType(k as string)}>
                <SelectItem id="all-hazards">Nasional (Multi-Hazard)</SelectItem>
                <SelectItem id="riau-hotspot">Karhutla Riau & Kalbar</SelectItem>
                <SelectItem id="pantura-flood">Banjir Pantura</SelectItem>
              </Select>
            </div>

            <DialogFooter>
              <DialogClose className="rounded-lg border border-border-button-default px-3 py-1.5 text-xs text-text-primary">
                Batal
              </DialogClose>
              <Button type="submit" variant="primary" size="small">
                Unduh PDF & GeoJSON
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dispatch Selection Modal */}
      <Dialog open={dispatchModalOpen} onOpenChange={setDispatchModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disposisi Tim Lapangan</DialogTitle>
            <DialogDescription>
              Kirim surat perintah penugasan penanganan darurat ke wilayah {activeIncident?.title}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-primary">
                Pilih Kesatuan Reaksi Cepat:
              </label>
              <Select selectedKey={dispatchUnit} onSelectionChange={(k) => setDispatchUnit(k as string)}>
                <SelectItem id="manggala-agni">Manggala Agni Daops Siak</SelectItem>
                <SelectItem id="bpbd-trc">TRC BPBD Karawang</SelectItem>
                <SelectItem id="gakkum-klhk">Penyidik Gakkum KLHK</SelectItem>
              </Select>
            </div>

            <p className="rounded bg-background-supporting-default p-2 font-mono text-[11px] text-text-secondary">
              Target: {activeIncident?.coords[1].toFixed(4)}, {activeIncident?.coords[0].toFixed(4)} ({activeIncident?.location})
            </p>

            <DialogFooter>
              <DialogClose className="rounded-lg border border-border-button-default px-3 py-1.5 text-xs text-text-primary">
                Batal
              </DialogClose>
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setDispatchModalOpen(false);
                  setConfirmDispatchOpen(true);
                }}
              >
                Lanjutkan Penugasan →
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ConfirmDialog for Consequential Team Dispatch */}
      <ConfirmDialog
        open={confirmDispatchOpen}
        onOpenChange={setConfirmDispatchOpen}
        title="Konfirmasi Perintah Operasional"
        description={`Anda akan menerbitkan Surat Perintah Tugas resmi untuk ${
          dispatchUnit === "manggala-agni" ? "Manggala Agni Daops Siak" : "TRC BPBD Karawang"
        } ke zona ${activeIncident?.title}. Status insiden akan diperbarui menjadi 'Dalam Penanganan'.`}
        confirmLabel="Terbitkan Perintah"
        destructive={false}
        requireReason={false}
        onConfirm={handleConfirmDispatchOrder}
      />
    </>
  );
}
