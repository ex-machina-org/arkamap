"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { RiFileTextLine, RiShieldCheckLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapDock } from "./map-dock";
import { SidePanel } from "./side-panel";
import { MapHeader } from "./map-header";
import { MapTools } from "./map-tools";
import { MapViewport, type CameraTarget } from "./map-viewport";
import { MapIncidentCard } from "./map-incident-card";
import { RegionCard } from "./region-card";
import { AnchoredCard } from "./anchored-card";
import { DevicePins, MapDeviceCard } from "./map-devices";
import { useLocatedDevices, type LocatedDevice } from "./use-located-devices";
import { SituationPanel } from "./situation-panel";
import { useSituation, type RankEntry } from "./situation";
import type { ChoroplethSpec, RegionPick } from "./spatial-layers";
import { WelcomeModal } from "./welcome-modal";
import { useFirstVisit } from "./use-first-visit";
import type { FeatureCollection } from "geojson";
import { useApi } from "@/hooks/use-api";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSession } from "@/hooks/use-session";
import { spring } from "@/lib/springs";
import { apiHeaders } from "@/lib/api/connection";
import { cx } from "@/utils/cx";
import { geoJSON } from "@/lib/api/geojson";
import { HOTSPOT_LIMIT, useSpatialData } from "./map-api";
import { useIndonesiaMask, useProvinceFocus, useRegionBoundary } from "@/hooks/use-region-boundary";
import { AccountMenu } from "@/components/application/auth/account-menu";
import { JevAssistantPanel } from "@/components/application/jev-chat/jev-assistant-panel";
import { PublicDataPanel } from "./public-data-panel";
import { LayerRail, type Scope } from "./layer-rail";
import { RankPanel } from "./rank-panel";
import { RegionDetail } from "./region-detail";
import { useMapLayer } from "./use-map-layer";
import { aspectOf, parentName, rampStopsFor } from "./atlas";
import { DataPicker } from "./data-picker";
import { formatCoords } from "./format";
import { HAZARDS, HAZARD_ORDER } from "./hazards";
import type { BasemapType, HazardType, SpatialIncident } from "./types";
import {
  ResponderDialog,
  ResponderRouteLayers,
  ResponderRoutePanel,
  calculateResponderRoute,
  type TacticalPlan,
} from "./responder-route";

const FOCUS_ZOOM = 11.4;
const LAST_FOCUS_KEY = "arkamap:map-focus";

/** The region bbox the map last opened on, so a returning visitor's map starts there. */
function readLastFocus(): number[] | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAST_FOCUS_KEY) ?? "null");
    return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeLastFocus(bbox: number[] | undefined) {
  try {
    if (bbox) localStorage.setItem(LAST_FOCUS_KEY, JSON.stringify(bbox));
    else localStorage.removeItem(LAST_FOCUS_KEY);
  } catch {
    // storage blocked: the next visit just waits for the profile again
  }
}

// The profile's region bounds how far the map can widen: kab/kota → its province → Indonesia.
const SCOPES: Record<string, Scope[]> = { kabkota: ["region", "province", "national"], provinsi: ["province", "national"] };

// Air quality has no point feed; its chip counts the regions in scope above the US AQI "Sedang" limit from /standards.
const AQI_METRIC = "aqi_forecast_max";

const NATIONAL_VIEW: CameraTarget = { coords: [118, -2.5], zoom: 4.6, zoomMode: "exact" };
// the same view as a different object, so MapCameraController flies there again
const NATIONAL_AGAIN: CameraTarget = { ...NATIONAL_VIEW };

/** `/map?lat=&lon=` (an alert's point) or `/map?region=` (an alert's region), as linked from the alerts page. */
function readLinkTarget() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get("lat")), lon = Number(params.get("lon"));
  const point = params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] as [number, number] : null;
  return { point, region: params.get("region") };
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function SiriMapWorkspace() {
  const { isFirstVisit, completeWelcome } = useFirstVisit();
  const { me, loading: sessionLoading } = useSession();
  const dashboard = useApi(me ? "/me/dashboard" : null, "Dashboard");
  const profileView = dashboard.data?.view ?? undefined;
  const profileFocus = profileView?.focus;
  const scopes = SCOPES[profileFocus?.level ?? ""] ?? ["national"];
  const [scopeChoice, setScopeChoice] = useState<Scope>();
  const scope = scopeChoice && scopes.includes(scopeChoice) ? scopeChoice : scopes[0];
  const province = useProvinceFocus(scope === "province" && profileFocus?.level === "kabkota" ? profileFocus.parent_id : null);
  // Until the province outline loads, the map stays on the kab/kota rather than flashing all of Indonesia.
  const focus = scope === "national" ? undefined : scope === "province" ? province ?? profileFocus : profileFocus;
  // Everything below reads the scoped view, so the ranking, colours and events all widen together.
  const view = useMemo(() => profileView && { ...profileView, focus: focus ?? null }, [profileView, focus]);
  const boundary = useRegionBoundary(focus);
  const isRegional = focus?.level === "provinsi" || focus?.level === "kabkota";
  // The map opens on the profile's region, never on Indonesia first: the region seen last time in this browser
  // straight away, else (first visit) the profile's once it answers.
  const [signedIn] = useState(() => apiHeaders().has("Authorization"));
  const [lastFocus] = useState(() => (signedIn ? readLastFocus() : undefined));
  const [link] = useState(readLinkTarget);
  const settled = !sessionLoading && !dashboard.loading;
  // A linked point may lie outside the profile's region, so it opens unframed (inside Indonesia) on that point.
  const startBounds = link.point ? undefined : isRegional ? focus.bbox : settled ? undefined : lastFocus;
  const mapReady = !signedIn || Boolean(lastFocus) || Boolean(link.point) || settled;
  useEffect(() => {
    if (settled) writeLastFocus(profileFocus?.level === "provinsi" || profileFocus?.level === "kabkota" ? profileFocus.bbox : undefined);
  }, [settled, profileFocus]);
  const nationalMask = useIndonesiaMask(!isRegional);
  const { situation, loading: situationLoading, error: situationError, metricLabel, metrics } = useSituation(view, Boolean(me));
  // A signed-in view waits for its field's layers, so the 4,000 hotspots are not fetched twice.
  const spatial = useSpatialData(focus?.id, situation?.windows, situation?.feeds, !dashboard.loading && (!me || situation !== null));
  const [events, setEvents] = useState<FeatureCollection>();
  const isDocked = useMediaQuery("(min-width: 1280px)");
  // "auto" follows the profile; anything else is a metric picked under "Jelajahi data", at `level`.
  const [metricChoice, setMetricChoice] = useState("auto");
  const [showData, setShowData] = useState(true);
  const [wind, setWind] = useState(false);
  // `anchor` is the clicked point on the map; a pick from the list has none and opens beside the region's middle instead.
  const [selectedRegion, setSelectedRegion] = useState<{ entry: RankEntry; position: number; of: number; anchor: [number, number] | null } | null>(null);
  const [regionCenter, setRegionCenter] = useState<{ regionId: string; center: [number, number] } | null>(null);

  const incidents = spatial.incidents;
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const devices = useLocatedDevices(Boolean(me));
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;

  const [camera, setCamera] = useState<CameraTarget>(() => link.point ? { coords: link.point, zoom: 9, zoomMode: "exact" } : NATIONAL_VIEW);
  const [introCamera] = useState(isFirstVisit && !link.point);
  // Opened on last time's region but the profile no longer has one: a new target object flies back to Indonesia.
  const cameraTarget = settled && lastFocus && !isRegional && camera === NATIONAL_VIEW ? NATIONAL_AGAIN : camera;
  const [is3D, setIs3D] = useState(false);
  const [basemap, setBasemap] = useState<BasemapType>("satellite");

  const [activeHazard, setActiveHazard] = useState<HazardType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // The summary is what the screen leads with, so the panel starts open from tablet width up; phones keep the map visible.
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isFirstVisit && window.matchMedia("(min-width: 768px)").matches);
  const [isAssistantActive, setIsAssistantActive] = useState(false);
  const [askRequest, setAskRequest] = useState<{ id: number; text: string }>();
  const reduceMotion = useReducedMotion();
  const [previewIncident, setPreviewIncident] = useState<SpatialIncident | null>(null);
  const [tacticalPlan, setTacticalPlan] = useState<TacticalPlan | null>(null);
  const [tacticalLeg, setTacticalLeg] = useState<"ingress" | "egress" | "both">("both");
  const [isTacticalDialogOpen, setIsTacticalDialogOpen] = useState(false);
  const [tacticalIncident, setTacticalIncident] = useState<SpatialIncident | null>(null);

  useEffect(() => {
    document.title = "Peta Operasional · Arkamap";
  }, []);

  const searchedIncidents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return incidents;
    return incidents.filter((incident) =>
      [incident.title, incident.source, incident.reading, HAZARDS[incident.hazardType].label].some((text) => text.toLowerCase().includes(q)));
  }, [incidents, searchQuery]);

  const filteredIncidents = useMemo(
    () => activeHazard === "all" ? searchedIncidents : searchedIncidents.filter((incident) => incident.hazardType === activeHazard),
    [searchedIncidents, activeHazard],
  );

  // The dock counts what the search leaves, before the hazard filter, so every chip says what picking it would show.
  const aqiLimit = useApi("/standards", "AirStandards").data?.metrics[AQI_METRIC]?.batas;
  const aqiLayer = useMapLayer(situation ? { metric: AQI_METRIC, label: "", level: situation.choropleth.level, parentId: situation.choropleth.parentId } : null);
  const badAirLayer = useMemo(() => aqiLimit == null || !aqiLayer.layer ? undefined : {
    ...aqiLayer.layer,
    features: aqiLayer.layer.features.filter(({ properties }) =>
      // A kab/kota scope still loads its whole province, so only its own region counts.
      (focus?.level !== "kabkota" || properties.region_id === focus.id) && properties.value != null && properties.value > aqiLimit),
  }, [aqiLayer.layer, aqiLimit, focus]);
  const badAirRegions = badAirLayer?.features.length ?? 0;
  const hazardCounts = useMemo(() => {
    if (spatial.loading && incidents.length === 0) return null;
    const counts = Object.fromEntries(HAZARD_ORDER.map((type) => [type, 0])) as Record<HazardType, number>;
    for (const incident of searchedIncidents) counts[incident.hazardType]++;
    counts.air_quality += badAirRegions;
    return counts;
  }, [searchedIncidents, spatial.loading, incidents.length, badAirRegions]);

  // A selection that the filters hide, or that disappeared on refresh, counts as no selection.
  const selectedIncident = useMemo(
    () => filteredIncidents.find((incident) => incident.id === selectedIncidentId) ?? null,
    [filteredIncidents, selectedIncidentId],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && !isTyping(e.target)) {
        setSelectedIncidentId(null);
        setSelectedRegion(null);
        setSelectedDeviceId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const choropleth = useMemo<ChoroplethSpec | null>(() => {
    if (metricChoice === "none") return null;
    if (metricChoice === "auto") return situation ? { ...situation.choropleth, label: situation.rank?.metricLabel ?? metricLabel(situation.choropleth.metric) } : null;
    // A picked metric covers the same scope as the profile's own.
    return { metric: metricChoice, label: metricLabel(metricChoice), level: situation?.choropleth.level ?? "provinsi", parentId: situation?.choropleth.parentId ?? null };
  }, [metricChoice, situation, metricLabel]);
  const mapLayer = useMapLayer(choropleth);
  // Picking the air chip leaves only the regions it counted on the map and in the ranking.
  const shownLayer = activeHazard === "air_quality" && badAirLayer ? badAirLayer : mapLayer.layer;
  const regionList = useMemo(() => (mapLayer.layer?.features ?? []).map((feature) => ({
    id: feature.properties.region_id,
    name: feature.properties.name,
    parent: parentName(feature.properties.parent_id),
  })), [mapLayer.layer]);
  const peerValues = useMemo(() => (mapLayer.layer?.features ?? [])
    .map((feature) => feature.properties.value)
    .filter((value): value is number => value != null), [mapLayer.layer]);
  // The ranking card speaks for the profile's own lens; a manually picked metric gets a plain one.
  const profileLens = metricChoice === "auto" && situation?.rank ? situation.rank : null;

  // Kodama's openers ask about what the map shows right now, so the first tap is already a useful question.
  const scopeName = situation?.scopeName ?? "Indonesia";
  const kodamaSuggestions = useMemo(() => {
    const top = situation?.rank?.entries[0];
    const priority = situation?.priorities?.items[0];
    return [
      // Short, since the placeholder already names the scope.
      top ? `Kenapa ${top.name} paling perlu perhatian?` : "Wilayah mana paling perlu perhatian?",
      activeHazard === "all" ? "Peringatan aktif hari ini" : `Ringkas kejadian ${HAZARDS[activeHazard].label.toLowerCase()}`,
      ...(priority && priority.regionId !== top?.regionId ? [`Apa yang dicek dulu di ${priority.name}?`] : []),
    ];
  }, [situation, activeHazard]);

  function selectRegion(entry: RankEntry, position: number, of: number, anchor: [number, number] | null = null) {
    setSelectedIncidentId(null);
    setSelectedDeviceId(null);
    setSelectedRegion({ entry, position, of, anchor });
    if (!isDocked) setIsSidebarOpen(false);
  }

  function handlePickRegion(pick: RegionPick) {
    const known = profileLens?.entries.find((entry) => entry.regionId === pick.regionId);
    selectRegion(known ?? { regionId: pick.regionId, name: pick.name, score: pick.score, value: pick.value, isYou: false, population: pick.population, details: [] }, pick.position, pick.of, pick.anchor);
  }

  // A pick from the rail or the ranking: the layer says where it stands, and the card opens beside its middle.
  function pickRegionById(regionId: string) {
    const features = mapLayer.layer?.features ?? [];
    const feature = features.find((item) => item.properties.region_id === regionId);
    if (!feature) return;
    const props = feature.properties;
    const ordered = [...features].sort((a, b) => (b.properties.normalised ?? -1) - (a.properties.normalised ?? -1));
    const known = profileLens?.entries.find((entry) => entry.regionId === regionId);
    selectRegion(
      known ?? { regionId, name: props.name, score: props.normalised ?? null, value: props.value ?? null, isYou: false, population: props.population ?? null, details: [] },
      ordered.findIndex((item) => item.properties.region_id === regionId) + 1,
      ordered.length,
    );
  }

  function changeScope(next: Scope) {
    // The picked region may lie outside the new scope, or be at another level.
    setScopeChoice(next);
    setSelectedRegion(null);
    setSelectedIncidentId(null);
  }

  // Open the linked alert's card once its incident (nearest within ~5 km) or region has loaded.
  const linkHandled = useRef(false);
  useEffect(() => {
    if (linkHandled.current) return;
    if (link.point) {
      const [lon, lat] = link.point;
      const near = incidents
        .map((incident) => ({ incident, d: Math.hypot(incident.coords[0] - lon, incident.coords[1] - lat) }))
        .filter(({ d }) => d < 0.05)
        .sort((a, b) => a.d - b.d)[0];
      if (!near) return;
      linkHandled.current = true;
      setSelectedIncidentId(near.incident.id);
      if (!isDocked) setIsSidebarOpen(false);
    } else if (link.region && mapLayer.layer?.features.some((item) => item.properties.region_id === link.region)) {
      linkHandled.current = true;
      pickRegionById(link.region);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once both feeds can answer; pickRegionById reads them
  }, [incidents, mapLayer.layer]);

  const regionAnchor = selectedRegion
    ? selectedRegion.anchor ?? (regionCenter?.regionId === selectedRegion.entry.regionId ? regionCenter.center : null)
    : null;

  function openAssistant() {
    setIsAssistantActive(true);
  }

  function handleAsk(question: string) {
    setAskRequest((prev) => ({ id: (prev?.id ?? 0) + 1, text: question }));
    openAssistant();
  }

  function closeAssistant() {
    // A fresh panel would otherwise send the last map question again.
    setAskRequest(undefined);
    setIsAssistantActive(false);
  }

  function toggleSidebar() {
    setIsSidebarOpen(!isSidebarOpen);
  }

  function handleSelectIncident(incident: SpatialIncident) {
    setSelectedRegion(null);
    setSelectedDeviceId(null);
    setSelectedIncidentId(incident.id);
    setCamera({ coords: incident.coords, zoom: FOCUS_ZOOM, zoomMode: "atLeast" });
    // An overlay panel would cover the map the user just asked to see.
    if (!isDocked) setIsSidebarOpen(false);
  }

  function handleSelectDevice(device: LocatedDevice) {
    setSelectedRegion(null);
    setSelectedIncidentId(null);
    setSelectedDeviceId(device.id);
    if (!isDocked) setIsSidebarOpen(false);
  }

  function handleSelectHazard(hazard: HazardType | "all") {
    setActiveHazard(hazard);
    // Its count is regions, not pins, so the chip shows them by colouring the map with AQI.
    if (hazard === "air_quality") setMetricChoice(AQI_METRIC);
    else if (metricChoice === AQI_METRIC) setMetricChoice("auto");
  }

  async function handleCopyGeoJSON(incident: SpatialIncident) {
    const geo = {
      type: "Feature",
      geometry: { type: "Point", coordinates: incident.coords },
      properties: { title: incident.title, source: incident.source, observed_at: incident.lastUpdated, reading: incident.reading },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(geo, null, 2));
      toast.success("GeoJSON disalin", { description: `Titik ${incident.title} dari ${incident.source}.` });
    } catch {
      toast.error("GeoJSON gagal disalin", { description: "Izinkan akses clipboard di browser, lalu coba lagi." });
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col-reverse gap-3 overflow-hidden bg-background-full p-3 font-sans text-text-primary">
      <MapDock
        activeHazard={activeHazard}
        onSelectHazard={handleSelectHazard}
        counts={hazardCounts}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
        isAssistantActive={isAssistantActive}
        onToggleAssistant={() => (isAssistantActive ? closeAssistant() : openAssistant())}
        dataPicker={
          <DataPicker
            label={choropleth?.label}
            swatch={mapLayer.layer ? rampStopsFor(mapLayer.layer.metric.metric, aspectOf(mapLayer.layer.metric.aspect)) : undefined}
          >
            {(close) => (
              <LayerRail
                metrics={metrics}
                active={metricChoice}
                // A metric or a region is a final pick, so the picker steps aside to show the map; level and search keep it open.
                onPick={(metric) => { setMetricChoice(metric); close(); }}
                scope={scope}
                scopes={scopes}
                onScopeChange={changeScope}
                regions={regionList}
                onPickRegion={(id) => { pickRegionById(id); close(); }}
              />
            )}
          </DataPicker>
        }
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 gap-3">
        <main className="relative h-full min-w-0 flex-1 overflow-hidden rounded-2xl border border-border-button-default bg-background-full shadow-2xs">
          <MapHeader
            signedIn={Boolean(me)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchRef={searchRef}
          >
            <AccountMenu />
          </MapHeader>

          <MapTools
            basemap={basemap}
            onBasemapChange={setBasemap}
            is3D={is3D}
            onIs3DChange={setIs3D}
            showData={showData}
            onShowDataChange={setShowData}
            wind={wind}
            onWindChange={setWind}
            // Phones show the summary headline under the header, so the tools start below it.
            className={cx("absolute right-3 top-15 z-20 transition-[top] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",!isSidebarOpen && situation?.tiles[0] && "max-md:top-31")}
          />

          {/* Phones open on the map, so the headline rides above it and opens the full summary. */}
          <AnimatePresence initial={false}>
          {!isSidebarOpen && situation?.tiles[0] && (
            <motion.button
              key="headline"
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: spring.moderate.exit }}
              // Press feedback through motion: a CSS transform transition here would lag behind the entrance.
              whileTap={{ scale: 0.98 }}
              transition={spring.moderate}
              className="absolute inset-x-3 top-14 z-20 flex items-center gap-2 rounded-2lg bg-background-primary-default/95 px-3 py-2 text-left shadow-card outline-none backdrop-blur-md focus-visible:ring-2 focus-visible:ring-border-focus-ring md:hidden"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-2-regular text-text-secondary">{situation.tiles[0].label}</span>
                <span className="block truncate text-body-medium text-text-primary">{situation.tiles[0].value} · {situation.tiles[0].caption}</span>
              </span>
              <span className="shrink-0 text-body-2-medium text-text-secondary">Lihat</span>
            </motion.button>
          )}
          </AnimatePresence>

          {mapReady ? (
          <MapViewport
            incidents={filteredIncidents}
            selectedIncident={selectedIncident}
            onSelectIncident={handleSelectIncident}
            camera={cameraTarget}
            introCamera={introCamera}
            is3D={is3D}
            basemap={basemap}
            warnings={spatial.warnings}
            choropleth={choropleth}
            layer={shownLayer}
            layerError={mapLayer.error}
            showData={showData}
            wind={wind}
            selectedRegionId={selectedRegion?.entry.regionId ?? null}
            onSelectRegion={handlePickRegion}
            events={events}
            focus={focus?.bbox}
            startBounds={startBounds}
            boundary={boundary}
            nationalMask={nationalMask}
            status={{
              loading: spatial.loading,
              degraded: spatial.errors.length > 0,
              note: spatial.hotspotsTruncated ? `Hanya ${HOTSPOT_LIMIT.toLocaleString("id-ID")} titik terbaru yang tampil.` : undefined,
            }}
            onRegionCenter={(center) => {
              if (selectedRegion) setRegionCenter({ regionId: selectedRegion.entry.regionId, center });
            }}
          >
            {tacticalPlan && (
              <ResponderRouteLayers
                plan={tacticalPlan}
                activeLeg={tacticalLeg}
                onSelectPoi={(poi) => {
                  setCamera({ coords: poi.coords, zoom: 14, zoomMode: "atLeast" });
                }}
              />
            )}

            <DevicePins devices={devices} selectedId={selectedDevice?.id} onSelect={handleSelectDevice} />

            {/* Cards open beside what was picked and follow it while the map moves. */}
            <AnimatePresence>
              {selectedIncident && (
                <AnchoredCard key="incident-card" anchor={selectedIncident.coords}>
                  <MapIncidentCard
                    incident={selectedIncident}
                    onClose={() => setSelectedIncidentId(null)}
                    onDispatchOrder={setPreviewIncident}
                    onCopyGeoJSON={handleCopyGeoJSON}
                    onOpenSidebar={() => setIsSidebarOpen(true)}
                    onOpenResponderRoute={(incident) => {
                      setTacticalIncident(incident);
                      setIsTacticalDialogOpen(true);
                    }}
                  />
                </AnchoredCard>
              )}
              {!selectedIncident && selectedDevice && (
                <AnchoredCard key="device-card" anchor={[selectedDevice.lon, selectedDevice.lat]}>
                  <MapDeviceCard device={selectedDevice} onClose={() => setSelectedDeviceId(null)} />
                </AnchoredCard>
              )}
              {!selectedIncident && !selectedDevice && selectedRegion && (
                <AnchoredCard key="region-card" anchor={regionAnchor}>
                  <RegionCard
                    entry={selectedRegion.entry}
                    position={selectedRegion.position}
                    level={choropleth?.level === "kabkota" ? "kabkota" : "provinsi"}
                    rank={profileLens ?? {
                      metric: choropleth?.metric ?? "",
                      metricLabel: choropleth?.label ?? "Skor wilayah",
                      unit: "",
                      modelled: false,
                      scopeLabel: choropleth?.level === "kabkota" ? "kab/kota" : "provinsi",
                      of: selectedRegion.of,
                      entries: [],
                    }}
                    onClose={() => setSelectedRegion(null)}
                    onAsk={handleAsk}
                    onShowDetail={() => setIsSidebarOpen(true)}
                  />
                </AnchoredCard>
              )}
            </AnimatePresence>
          </MapViewport>
          ) : (
            // a signed-in first visit waits for its region (about 0.2 s) rather than showing Indonesia first
            <div aria-hidden className="size-full bg-background-full" />
          )}

          <AnimatePresence>
            {tacticalPlan && (
              <ResponderRoutePanel
                plan={tacticalPlan}
                activeLeg={tacticalLeg}
                onLegChange={setTacticalLeg}
                onFocusCoords={(coords) =>
                  setCamera({ coords, zoom: 14, zoomMode: "atLeast" })
                }
                onChangeOrigin={() => {
                  setTacticalIncident(
                    incidents.find((i) => i.id === tacticalPlan.incidentId) ?? null
                  );
                  setIsTacticalDialogOpen(true);
                }}
                onClose={() => setTacticalPlan(null)}
              />
            )}
          </AnimatePresence>
        </main>

        <SidePanel
          isOpen={isSidebarOpen}
          selectedIncident={selectedIncident}
          incidents={filteredIncidents}
          loading={spatial.loading}
          errors={spatial.errors}
          onSelectIncident={handleSelectIncident}
          summary={
            <SituationPanel
              situation={situation}
              loading={situationLoading || dashboard.loading}
              error={situationError}
              selectedRegionId={selectedRegion?.entry.regionId ?? null}
              onSelectRegion={(entry) => {
                const entries = situation?.rank?.entries ?? [];
                selectRegion(entry, entries.indexOf(entry) + 1, situation?.rank?.of ?? entries.length);
              }}
              onSelectPriority={(priority) => selectRegion(
                { regionId: priority.regionId, name: priority.name, score: null, value: null, isYou: false, population: priority.population, details: [], priority },
                priority.position,
                priority.outOf,
              )}
              onAsk={handleAsk}
            />
          }
          explore={<PublicDataPanel />}
          ranking={<RankPanel layer={shownLayer} label={choropleth?.label} selectedRegionId={selectedRegion?.entry.regionId ?? null} onSelect={pickRegionById} />}
          detail={selectedRegion && (
            <RegionDetail
              key={selectedRegion.entry.regionId}
              regionId={selectedRegion.entry.regionId}
              metrics={metrics}
              activeMetric={choropleth?.metric ?? null}
              peerValues={peerValues}
              onClose={() => setSelectedRegion(null)}
            />
          )}
        />

        {/* Kodama floats centred above the dock that opened it, Siri-style, so the map and panel keep their width. */}
        <AnimatePresence>
          {isAssistantActive && (
            <motion.div
              key="kodama"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="absolute bottom-3 left-1/2 z-40 flex w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 origin-bottom justify-center"
            >
              <JevAssistantPanel
                variant="floating"
                suggestions={kodamaSuggestions}
                placeholder={`Tanya tentang ${scopeName}`}
                onClose={closeAssistant}
                request={askRequest}
                onEvents={value => { try { setEvents(geoJSON(value)); } catch { toast.error("Visualisasi kejadian tidak valid."); } }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <WelcomeModal isFirstVisit={isFirstVisit} onComplete={completeWelcome} />

      <Dialog open={previewIncident !== null} onOpenChange={(open) => { if (!open) setPreviewIncident(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-status-yellow-background text-status-yellow-text">
                <RiShieldCheckLine className="size-5" aria-hidden="true" />
              </span>
              <div>
                <DialogTitle className="text-title-2-semibold">Disposisi Satgas (preview)</DialogTitle>
                <DialogDescription className="text-body-medium text-text-secondary">
                  Penerbitan perintah dan penugasan tim belum tersedia. Tidak ada yang dikirim.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {previewIncident && (
            <div className="space-y-3 py-2">
              <div className="rounded-xl border border-border-button-default bg-background-secondary-default p-3.5">
                <p className="text-caption-1-medium text-text-secondary">Kejadian yang akan ditindaklanjuti</p>
                <p className="mt-0.5 text-headline-semibold text-text-primary">{previewIncident.title}</p>
                <p className="mt-0.5 text-body-2-regular text-text-tertiary">
                  {previewIncident.reading} · {previewIncident.source} · {formatCoords(previewIncident.coords)}
                </p>
              </div>
              <div className="rounded-xl border border-border-button-default p-3.5 text-body-medium text-text-secondary">
                <div className="mb-1 flex items-center gap-2 text-body-semibold text-text-primary">
                  <RiFileTextLine className="size-4" aria-hidden="true" />
                  <span>Ringkasan sumber</span>
                </div>
                <p>{previewIncident.summary}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" size="medium" onClick={() => setPreviewIncident(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResponderDialog
        incident={tacticalIncident}
        isOpen={isTacticalDialogOpen}
        onClose={() => setIsTacticalDialogOpen(false)}
        onSubmit={async (req) => {
          // Routing and the OSM facility lookup can take a while; the dialog has already closed.
          const pending = toast.loading("Menghitung rute taktis…");
          try {
            const plan = await calculateResponderRoute(req);
            setTacticalPlan(plan);
            setTacticalLeg("both");
            setCamera({ coords: req.incidentCoords, zoom: 12.5, zoomMode: "atLeast" });
            const shelters = plan.tacticalPois.filter((poi) => poi.type === "shelter").length;
            toast.success("Rute taktis berhasil dihitung", {
              id: pending,
              description: shelters ? `${shelters} tempat penampungan terdekat ikut ditampilkan.` : "Tidak ada tempat penampungan tercatat di sekitar kejadian.",
            });
          } catch (cause) {
            toast.error("Rute taktis gagal dihitung", { id: pending, description: cause instanceof Error ? cause.message : "Coba lagi nanti." });
          }
        }}
      />
    </div>
  );
}
