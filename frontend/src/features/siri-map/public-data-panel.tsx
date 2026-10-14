import { useEffect, useState, type ReactNode } from "react";
import { RiRefreshLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataFacts } from "@/components/application/agent-chat/data-facts";
import { useApi } from "@/hooks/use-api";
import { apiList, type DTO } from "@/lib/api/client";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-body-2-medium text-text-primary">{title}</h3>
        {hint && <p className="text-body-2-regular text-text-tertiary">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg bg-status-rose-background px-3 py-2 text-caption-1-medium text-status-rose-text">{children}</p>;
}

/** `rail` picks what colours the regions; the rest are national summaries and reports. */
export function PublicDataPanel({ rail }: { rail: ReactNode }) {
  const overview = useApi("/public/overview", "PublicOverview");
  const [regionId, setRegionId] = useState("");
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState<DTO<"RegionRef">[]>([]);
  const [community, setCommunity] = useState<DTO<"CommunityDevice">[]>([]);
  const [error, setError] = useState<string>();
  const report = useApi(regionId ? `/reports/${encodeURIComponent(regionId)}?days=30` : null, "RegionReport");
  useEffect(() => {
    const controller = new AbortController();
    apiList("/community/devices", "CommunityDevice", { signal: controller.signal }).then(setCommunity).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (query.length < 2) { setRegions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => apiList(`/regions?q=${encodeURIComponent(query)}`, "RegionRef", { signal: controller.signal }).then(setRegions).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }), 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query]);

  const failure = overview.error || error || report.error;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-medium text-text-primary">Data publik nasional</p>
          <p className="text-caption-1-regular text-text-tertiary" role="status">
            {overview.loading ? "Memuat data publik..." : overview.data ? `Diperbarui ${new Date(overview.data.generated_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : "Data belum tersedia"}
          </p>
        </div>
        <Button variant="secondary" size="small" iconOnly leadingIcon={RiRefreshLine} aria-label="Perbarui ringkasan" disabled={overview.loading} onClick={overview.refresh} />
      </header>

      {failure && <ErrorText>{failure}</ErrorText>}

      {overview.data && (
        <Section title="Ringkasan dan peringatan">
          {!!overview.data.stale_sources.length && (
            <p className="flex flex-wrap items-center gap-1.5 text-caption-1-regular text-text-secondary">
              <Chip variant="caption" color="yellow">Data terlambat</Chip>
              {overview.data.stale_sources.map(source => source.title).join(", ")}
            </p>
          )}
          <Collapsible>
            <CollapsibleTrigger>Agregat dan peringatan nasional</CollapsibleTrigger>
            <CollapsibleContent>
              <DataFacts value={{ counts: overview.data.counts, fire_risk_top: overview.data.fire_risk_top, quake_alerts: overview.data.quake_alerts, disaster_alerts: overview.data.disaster_alerts }} />
            </CollapsibleContent>
          </Collapsible>
        </Section>
      )}

      <Section title="Warna wilayah" hint="Bawaan mengikuti profil. Pilih data lain untuk mewarnai wilayah.">
        {rail}
      </Section>

      <Section title="Laporan wilayah">
        <Input label="Cari wilayah" placeholder="Ketik minimal 2 huruf" value={query} onChange={setQuery} />
        <Select
          aria-label="Wilayah untuk laporan"
          className="w-full"
          placeholder={query.length < 2 ? "Hasil pencarian muncul di sini" : regions.length ? "Pilih wilayah" : "Tidak ada wilayah yang cocok"}
          isDisabled={!regions.length}
          selectedKey={regionId || null}
          onSelectionChange={key => setRegionId(key ? String(key) : "")}
        >
          {regions.map(region => <SelectItem key={region.id} id={region.id}>{region.name}</SelectItem>)}
        </Select>
        {report.loading && <p role="status" className="text-caption-1-regular text-text-secondary">Memuat laporan...</p>}
        {report.data && (
          <Collapsible open>
            <CollapsibleTrigger>Laporan {report.data.region.name}</CollapsibleTrigger>
            <CollapsibleContent><DataFacts value={report.data} /></CollapsibleContent>
          </Collapsible>
        )}
      </Section>

      <Section title="Sensor komunitas" hint={`${community.length} sensor terdaftar`}>
        {community.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger>Lihat pembacaan terakhir</CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
              {community.map(device => (
                <div key={device.id} className="space-y-1 border-t border-border-button-default pt-3 first:border-t-0 first:pt-0">
                  <p className="text-body-medium text-text-primary">{device.name}</p>
                  <p className="text-caption-1-regular text-text-tertiary">{device.region_name} · {device.latest_at ? new Date(device.latest_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Belum ada pembacaan"}</p>
                  <DataFacts value={device.latest} />
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </Section>
    </div>
  );
}
