import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RiArrowLeftLine, RiArrowLeftRightLine, RiNotification3Line } from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Select, SelectItem } from "@/components/base/select/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SeriesTable, TimeSeriesChart } from "@/components/application/data-viz/time-series-chart";
import { SERIES } from "@/components/application/data-viz/format";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api, apiList } from "@/lib/api/client";
import { ASPECTS, ASPECT_ORDER, LEVELS, aspectOf, fmt, fmtAuto, type Level, type MapLayer, type MetricDef } from "./atlas";
import { HBarList, Histogram, Mini, Scatter, ShareList, StatTile, type Point } from "./analysis-charts";
import { URGENCY_COLOR, URGENCY_LABEL, URGENCY_ORDER, pearson, strength, summary } from "./analysis-stats";

const SECTIONS = [
  ["jev", "Klasifikasi Jev"],
  ["riwayat", "Riwayat"],
  ["peringkat", "Peringkat"],
  ["perbandingan", "Perbandingan"],
] as const;

type HistoryMetric = "quake" | "hotspot" | "disaster";
const HISTORY_LABEL: Record<HistoryMetric, string> = { quake: "Gempa", hotspot: "Titik panas", disaster: "Bencana" };
const ASPECT_SERIES: Record<string, string> = { lingkungan: SERIES[0], energi: SERIES[1], urban: SERIES[2] };

function Section({ id, title, description, actions, children }: { id: string; title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-5 rounded-xl border border-border-button-default bg-background-primary-default p-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-title-3-medium text-text-primary">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-body-2-regular text-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-body-2-medium text-text-secondary">{children}</h3>;
}

function Segmented<T extends string | number>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <SegmentedControl
      aria-label={label}
      selectedKeys={[String(value)]}
      onSelectionChange={(keys) => {
        const key = Array.from(keys)[0];
        const hit = options.find(option => String(option.value) === key);
        if (hit) onChange(hit.value);
      }}
    >
      {options.map(option => <SegmentedControlItem key={String(option.value)} id={String(option.value)} className="px-3 text-caption-1-medium">{option.label}</SegmentedControlItem>)}
    </SegmentedControl>
  );
}

function MetricSelect({ label, metrics, value, onChange, className = "w-60" }: { label: string; metrics: MetricDef[]; value: string | null; onChange: (metric: string) => void; className?: string }) {
  return (
    <Select aria-label={label} placeholder={label} className={className} selectedKey={value} onSelectionChange={key => { if (key) onChange(String(key)); }}>
      {metrics.map(metric => <SelectItem key={metric.metric} id={metric.metric} textValue={metric.label}>{ASPECTS[aspectOf(metric.aspect)].label} · {metric.label}</SelectItem>)}
    </Select>
  );
}

/** The map's data read as numbers: Jev's classifications, event history, rankings and how two indicators move together. */
export function AnalysisWorkspace() {
  const { me } = useSession();
  const stats = useApi("/stats/classification", "ClassificationStats");
  const notifications = useApi("/notifications", "Notifications");
  const quakes = useApi("/quakes?days=90&min_mag=3.5&limit=2000", "QuakeCollection");
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [level, setLevel] = useState<Level>("provinsi");

  const [historyMetric, setHistoryMetric] = useState<HistoryMetric>("quake");
  const [historyDays, setHistoryDays] = useState(90);
  const history = useApi(`/history/events?metric=${historyMetric}&days=${historyDays}&bucket=${historyDays > 30 ? "week" : "day"}`, "EventHistory");

  const [rankMetric, setRankMetric] = useState<string | null>(null);
  const [rankLayer, setRankLayer] = useState<MapLayer | null>(null);
  const [topN, setTopN] = useState(25);
  const [regionQuery, setRegionQuery] = useState("");

  const [xMetric, setXMetric] = useState<string | null>(null);
  const [yMetric, setYMetric] = useState<string | null>(null);
  const [pair, setPair] = useState<[MapLayer, MapLayer] | null>(null);

  useEffect(() => {
    document.title = "Analisis · Arkamap";
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiList("/metrics", "MetricDef", { signal: controller.signal }).then(list => {
      const sorted = [...list].sort((a, b) => ASPECT_ORDER.indexOf(aspectOf(a.aspect)) - ASPECT_ORDER.indexOf(aspectOf(b.aspect)) || a.label.localeCompare(b.label));
      setMetrics(sorted);
      const has = (metric: string) => sorted.some(item => item.metric === metric);
      const first = sorted[0]?.metric ?? null;
      // Defaults every region has, so the page does not open on an empty chart.
      setRankMetric(has("fire_risk") ? "fire_risk" : first);
      setXMetric(has("dry_days") ? "dry_days" : first);
      setYMetric(has("fire_risk") ? "fire_risk" : first);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  // Ranking and comparison often ask for the same layer; one request each.
  const cache = useRef(new Map<string, Promise<MapLayer>>());
  const loadLayer = useCallback((metric: string, lv: Level) => {
    const key = `${metric}|${lv}`;
    let promise = cache.current.get(key);
    if (!promise) {
      promise = api(`/map/${encodeURIComponent(metric)}?level=${lv}&simplify=0.5`, "MapLayer");
      promise.catch(() => cache.current.delete(key));
      cache.current.set(key, promise);
    }
    return promise;
  }, []);

  useEffect(() => {
    if (!rankMetric) return;
    let live = true;
    loadLayer(rankMetric, level).then(layer => { if (live) setRankLayer(layer); }).catch(() => {});
    return () => { live = false; };
  }, [rankMetric, level, loadLayer]);

  useEffect(() => {
    if (!xMetric || !yMetric) return;
    let live = true;
    Promise.all([loadLayer(xMetric, level), loadLayer(yMetric, level)]).then(([a, b]) => { if (live) setPair([a, b]); }).catch(() => {});
    return () => { live = false; };
  }, [xMetric, yMetric, level, loadLayer]);

  const defOf = useCallback((metric: string | null) => metrics.find(item => item.metric === metric), [metrics]);

  /* Jev */
  const urgencyItems = useMemo(() => stats.data
    ? URGENCY_ORDER.filter(u => stats.data!.quake_urgency[u]).map(u => ({ key: u, label: URGENCY_LABEL[u], value: stats.data!.quake_urgency[u], color: URGENCY_COLOR[u] }))
    : [], [stats.data]);
  const quakeFeatures = useMemo(() => quakes.data?.features ?? [], [quakes.data]);
  const quakePoints = useMemo<Point[]>(() => quakeFeatures
    .flatMap((feature, i) => {
      const p = feature.properties;
      if (p.depth_km == null) return [];
      const u = p.urgency ?? "none";
      const confidence = p.urgency_confidence != null ? ` · keyakinan ${Math.round(p.urgency_confidence * 100)}%` : "";
      return [{ id: String(i), label: p.place ?? "Lokasi tidak diketahui", x: p.mag, y: p.depth_km, color: URGENCY_COLOR[u] ?? URGENCY_COLOR.none, detail: `${URGENCY_LABEL[u] ?? u}${confidence} · ${new Date(p.observed_at).toLocaleDateString("id-ID")}` }];
    })
    // Unclassified first, so Jev's points draw on top and stay hoverable.
    .sort((a, b) => Number(a.color !== URGENCY_COLOR.none) - Number(b.color !== URGENCY_COLOR.none)), [quakeFeatures]);
  const recentClassified = useMemo(() => quakeFeatures
    .filter(feature => feature.properties.urgency)
    .sort((a, b) => b.properties.observed_at.localeCompare(a.properties.observed_at))
    .slice(0, 8), [quakeFeatures]);

  /* History */
  const historyBuckets = history.data?.buckets;
  const historySeries = useMemo(() => {
    const per = new Map<string, number>();
    for (const bucket of historyBuckets ?? []) per.set(bucket.bucket, (per.get(bucket.bucket) ?? 0) + bucket.count);
    return [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => ({ t, v }));
  }, [historyBuckets]);
  const historyStats = useMemo(() => {
    if (!historySeries.length) return null;
    const values = historySeries.map(point => point.v);
    const total = values.reduce((a, b) => a + b, 0);
    const half = Math.floor(values.length / 2);
    const first = values.slice(0, half).reduce((a, b) => a + b, 0);
    const last = values.slice(values.length - half).reduce((a, b) => a + b, 0);
    const peak = values.indexOf(Math.max(...values));
    return { total, avg: total / values.length, peak: values[peak], peakAt: historySeries[peak].t, trend: first ? ((last - first) / first) * 100 : null };
  }, [historySeries]);
  const historyUrgency = useMemo(() => {
    if (historyMetric !== "quake") return [];
    const per = new Map<string, number>();
    for (const bucket of historyBuckets ?? []) per.set(bucket.urgency ?? "none", (per.get(bucket.urgency ?? "none") ?? 0) + bucket.count);
    return [...URGENCY_ORDER, "none"].filter(u => per.get(u)).map(u => ({ key: u, label: URGENCY_LABEL[u], value: per.get(u)!, color: URGENCY_COLOR[u] }));
  }, [historyBuckets, historyMetric]);

  /* Ranking */
  const rankDef = defOf(rankMetric);
  const rankAll = useMemo(() => (rankLayer?.features ?? [])
    .filter(feature => feature.properties.value != null)
    .map(feature => ({ id: feature.properties.region_id, label: feature.properties.name, value: feature.properties.value as number, norm: feature.properties.normalised ?? 0 }))
    .sort((a, b) => b.norm - a.norm)
    .map((row, i) => ({ ...row, rank: i + 1 })), [rankLayer]);
  const rankShown = useMemo(() => {
    const q = regionQuery.trim().toLowerCase();
    const hit = q ? rankAll.filter(row => row.label.toLowerCase().includes(q)) : rankAll;
    return topN ? hit.slice(0, topN) : hit;
  }, [rankAll, regionQuery, topN]);
  const rankStats = summary(rankAll.map(row => row.value));
  const rankColor = ASPECT_SERIES[aspectOf(rankDef?.aspect)];

  /* Comparison */
  const xDef = defOf(xMetric), yDef = defOf(yMetric);
  const points = useMemo<Point[]>(() => {
    if (!pair) return [];
    const [xLayer, yLayer] = pair;
    const ys = new Map(yLayer.features.map(feature => [feature.properties.region_id, feature.properties.value]));
    const color = ASPECT_SERIES[aspectOf(yLayer.metric.aspect)];
    return xLayer.features.flatMap(feature => {
      const y = ys.get(feature.properties.region_id);
      return feature.properties.value != null && y != null ? [{ id: feature.properties.region_id, label: feature.properties.name, x: feature.properties.value, y, color }] : [];
    });
  }, [pair]);
  const r = pearson(points.map(p => p.x), points.map(p => p.y));

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const notice = notifications.data;

  return (
    // The map route locks body scrolling, so this page scrolls on its own.
    <div className="h-dvh overflow-y-auto bg-background-full font-sans text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border-button-default bg-background-primary-default/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <ButtonLink href="/map" variant="ghost" size="small" iconOnly leadingIcon={RiArrowLeftLine} aria-label="Kembali ke peta" />
          <div className="min-w-0">
            <h1 className="text-title-3-medium text-text-primary">Analisis</h1>
            <p className="hidden text-caption-1-regular text-text-tertiary sm:block">Data yang sama dengan peta</p>
          </div>
          <nav aria-label="Bagian analisis" className="ml-4 hidden items-center gap-1 lg:flex">
            {SECTIONS.map(([id, label]) => <Button key={id} variant="ghost" size="small" onClick={() => scrollTo(id)}>{label}</Button>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Segmented label="Tingkat wilayah" value={level} onChange={setLevel} options={(Object.keys(LEVELS) as Level[]).map(id => ({ value: id, label: LEVELS[id] }))} />
            {me && <ButtonLink href="/alerts" variant="secondary" size="small" iconOnly leadingIcon={RiNotification3Line} aria-label="Notifikasi" />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {stats.data
            ? <StatTile label="Gempa diberi urgensi" accent={URGENCY_COLOR.pantau} value={fmt(stats.data.total_quakes_classified)} sub={`dari ${fmt(quakeFeatures.length)} gempa 90 hari terakhir`} />
            : <Skeleton className="h-24 rounded-xl" />}
          {historyStats
            ? <StatTile label={`${HISTORY_LABEL[historyMetric]} tercatat`} accent={URGENCY_COLOR.none} value={fmt(historyStats.total)} sub={`${historyDays} hari terakhir`} />
            : <Skeleton className="h-24 rounded-xl" />}
          {notice
            ? <StatTile label="Notifikasi aktif" accent={URGENCY_COLOR.darurat} value={fmt(notice.count)} sub={`${notice.quake_alerts.length} gempa · ${notice.region_alerts.length} wilayah · ${notice.source_alerts.length} sumber`} />
            : <Skeleton className="h-24 rounded-xl max-lg:col-span-2" />}
        </div>

        <Section id="jev" title="Klasifikasi otomatis (Jev)" description="Tingkat urgensi gempa diberikan oleh Jev saat data masuk, tanpa melatih model machine learning sendiri. Setiap keputusan disertai tingkat keyakinan; yang ragu (di bawah 50%) sengaja dibiarkan tanpa label.">
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <Heading>Magnitudo terhadap kedalaman</Heading>
              <p className="mb-2 text-body-2-regular text-text-tertiary">Gempa dangkal dengan magnitudo besar paling berbahaya, pola yang dibaca Jev bersama lokasi dan status tsunami.</p>
              {quakes.data ? <Scatter points={quakePoints} xLabel="Magnitudo" yLabel="Kedalaman (km)" yReverse /> : <Skeleton className="h-60" />}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption-1-regular text-text-secondary">
                {[...URGENCY_ORDER, "none"].map(u => (
                  <span key={u} className="flex items-center gap-1"><span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: URGENCY_COLOR[u] }} />{URGENCY_LABEL[u]}</span>
                ))}
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <Heading>Urgensi gempa</Heading>
                {stats.data ? (urgencyItems.length ? <ShareList items={urgencyItems} /> : <p className="py-6 text-center text-body-2-regular text-text-secondary">Belum ada gempa yang diklasifikasi.</p>) : <Skeleton className="h-28" />}
              </div>
              <div>
                <Heading>Keputusan Jev terbaru</Heading>
                {!quakes.data ? <Skeleton className="h-40" /> : recentClassified.length === 0 ? <p className="py-6 text-center text-body-2-regular text-text-secondary">Belum ada.</p> : (
                  <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {recentClassified.map((feature, i) => {
                      const p = feature.properties;
                      const confidence = Math.round((p.urgency_confidence ?? 0) * 100);
                      return (
                        <li key={i} className="rounded-lg bg-background-supporting-default px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded px-1.5 py-0.5 text-caption-2-medium text-text-white" style={{ backgroundColor: URGENCY_COLOR[p.urgency ?? "none"] }}>{URGENCY_LABEL[p.urgency ?? "none"]}</span>
                            <span className="min-w-0 flex-1 truncate text-body-2-regular text-text-primary" title={p.place ?? undefined}>{p.place ?? "Lokasi tidak diketahui"}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-caption-1-regular tabular-nums text-text-tertiary">
                            <span>M{fmtAuto(p.mag)} · {fmtAuto(p.depth_km)} km</span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-background-primary-default"><div className="h-full rounded-full" style={{ width: `${confidence}%`, backgroundColor: SERIES[0] }} /></div>
                            <span>{confidence}%</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </Section>

        <Section id="riwayat" title="Riwayat kejadian" description="Jumlah kejadian tercatat per periode. Untuk gempa, rincian urgensi dari Jev ditampilkan di samping."
          actions={<>
            <Segmented label="Jenis kejadian" value={historyMetric} onChange={setHistoryMetric} options={(Object.keys(HISTORY_LABEL) as HistoryMetric[]).map(id => ({ value: id, label: HISTORY_LABEL[id] }))} />
            <Segmented label="Rentang waktu" value={historyDays} onChange={setHistoryDays} options={[{ value: 7, label: "7 hari" }, { value: 30, label: "30 hari" }, { value: 90, label: "90 hari" }, { value: 365, label: "1 tahun" }]} />
          </>}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="Total" value={historyStats ? fmt(historyStats.total) : "–"} />
            <Mini label={`Rata-rata per ${historyDays > 30 ? "minggu" : "hari"}`} value={historyStats ? fmtAuto(historyStats.avg) : "–"} />
            <Mini label="Puncak" value={historyStats ? `${fmt(historyStats.peak)} · ${new Date(historyStats.peakAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : "–"} />
            <Mini label="Tren paruh akhir" value={historyStats?.trend == null ? "–" : `${historyStats.trend > 0 ? "naik" : "turun"} ${fmt(Math.abs(historyStats.trend))}%`} />
          </div>
          <div className={historyUrgency.length ? "grid gap-6 lg:grid-cols-[2fr_1fr]" : ""}>
            {history.loading ? <Skeleton className="h-48" /> : history.error ? <p role="alert" className="rounded-lg bg-status-rose-background px-3 py-2 text-body-2-medium text-status-rose-text">{history.error}</p> : historySeries.length ? (
              <div>
                <TimeSeriesChart points={historySeries} label={HISTORY_LABEL[historyMetric]} variant="bar" height={200} />
                <details className="mt-2">
                  <summary className="cursor-pointer text-body-2-medium text-text-secondary">Lihat sebagai tabel</summary>
                  <div className="mt-2"><SeriesTable points={historySeries} label={HISTORY_LABEL[historyMetric]} /></div>
                </details>
              </div>
            ) : <p className="py-10 text-center text-body-2-regular text-text-secondary">Belum ada kejadian dalam rentang ini.</p>}
            {historyUrgency.length > 0 && <div><Heading>Menurut urgensi</Heading><ShareList items={historyUrgency} /></div>}
          </div>
        </Section>

        <Section id="peringkat" title="Peringkat wilayah" description={rankDef ? rankDef.description : "Urutan wilayah menurut satu indikator."}
          actions={<>
            <MetricSelect label="Pilih indikator" metrics={metrics} value={rankMetric} onChange={setRankMetric} />
            <Segmented label="Jumlah ditampilkan" value={topN} onChange={setTopN} options={[{ value: 10, label: "10" }, { value: 25, label: "25" }, { value: 50, label: "50" }, { value: 0, label: "Semua" }]} />
          </>}>
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="min-w-0 space-y-2">
              <Input label={`Cari ${level === "kabkota" ? "kabupaten/kota" : "provinsi"}`} placeholder="Ketik nama wilayah" value={regionQuery} onChange={setRegionQuery} />
              <p className="text-caption-1-regular tabular-nums text-text-tertiary">{rankShown.length} dari {rankAll.length} wilayah</p>
              {rankLayer ? <div className="max-h-[30rem] overflow-y-auto pr-1"><HBarList rows={rankShown} color={rankColor} unit={rankDef?.unit ?? ""} /></div> : <Skeleton className="h-80" />}
              <p className="text-caption-1-regular text-text-tertiary">Panjang batang adalah skor perhatian 0 sampai 100 (makin panjang makin perlu perhatian); angka adalah nilai asli.</p>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Mini label="Terendah" value={rankStats ? fmtAuto(rankStats.min) : "–"} />
                <Mini label="Tertinggi" value={rankStats ? fmtAuto(rankStats.max) : "–"} />
                <Mini label="Median" value={rankStats ? fmtAuto(rankStats.median) : "–"} />
                <Mini label="Rata-rata" value={rankStats ? fmtAuto(rankStats.mean) : "–"} />
              </div>
              <div>
                <Heading>Sebaran nilai</Heading>
                {rankLayer ? <Histogram values={rankAll.map(row => row.value)} color={rankColor} unit={rankDef?.unit ?? ""} /> : <Skeleton className="h-36" />}
              </div>
              {rankLayer && <p className="text-caption-1-regular text-text-tertiary">Data tersedia untuk {fmt(rankAll.length)} dari {fmt(rankLayer.features.length)} wilayah ({fmt((rankAll.length / Math.max(rankLayer.features.length, 1)) * 100)}%).</p>}
            </div>
          </div>
        </Section>

        <Section id="perbandingan" title="Perbandingan dua indikator" description="Setiap titik adalah satu wilayah. Garis putus-putus adalah tren linear; korelasi menunjukkan seberapa searah kedua indikator, bukan sebab-akibat."
          actions={<>
            <MetricSelect label="Sumbu X" metrics={metrics} value={xMetric} onChange={setXMetric} className="w-52" />
            <Button variant="secondary" size="small" iconOnly leadingIcon={RiArrowLeftRightLine} aria-label="Tukar sumbu" onClick={() => { setXMetric(yMetric); setYMetric(xMetric); }} />
            <MetricSelect label="Sumbu Y" metrics={metrics} value={yMetric} onChange={setYMetric} className="w-52" />
          </>}>
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            {pair ? <Scatter points={points} xLabel={xDef?.label ?? "X"} yLabel={yDef?.label ?? "Y"} fit /> : <Skeleton className="h-64" />}
            <div className="space-y-3">
              <div className="rounded-xl border border-border-button-default p-4">
                <p className="text-caption-1-medium text-text-secondary">Korelasi (r)</p>
                <p className="mt-1 text-title-1-medium tabular-nums text-text-primary">{r == null ? "–" : fmt(r, 2)}</p>
                {r != null && <>
                  <div className="relative mt-3 h-1.5 rounded-full bg-background-supporting-default">
                    <span aria-hidden="true" className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-primary" style={{ left: `${((r + 1) / 2) * 100}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-caption-1-regular tabular-nums text-text-tertiary"><span>−1</span><span>0</span><span>+1</span></div>
                  <p className="mt-2 text-body-2-regular text-text-primary">{strength(r)}.</p>
                </>}
              </div>
              <Mini label="Wilayah dibandingkan" value={fmt(points.length)} />
              {xDef && yDef && <p className="text-caption-1-regular text-text-tertiary">Membandingkan {xDef.label} ({xDef.unit}) dengan {yDef.label} ({yDef.unit}) di tingkat {LEVELS[level].toLowerCase()}.</p>}
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}
