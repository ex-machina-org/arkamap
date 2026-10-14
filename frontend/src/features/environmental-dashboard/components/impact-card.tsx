import { RiExternalLinkLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { DTO } from "@/lib/api/client";
import { magnitudeColor } from "../event-kinds";
import { formatDateTime, formatDecimal, formatInteger, formatRelative } from "../format";
import { cx } from "@/utils/cx";
import { severityLabel } from "../labels";
import { DashboardCard, insetClass, PanelUnavailable } from "./dashboard-card";
import { StatHint } from "@/components/application/dashboard/stat-cards";

function RegionList({ regions }: { regions: DTO<"ImpactRegion">[] }) {
  if (!regions.length) return null;
  return <Collapsible>
    <CollapsibleTrigger>{regions.length} kabupaten/kota dalam cakupan</CollapsibleTrigger>
    <CollapsibleContent>
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{regions.map(region => <li key={region.id} className="flex items-baseline justify-between gap-2">
        <span className="truncate text-text-primary">{region.name}</span>
        <span className="shrink-0 text-body-2-regular tabular-nums">{region.population != null ? formatInteger(region.population) : "populasi belum tersedia"}</span>
      </li>)}</ul>
    </CollapsibleContent>
  </Collapsible>;
}

function QuakeItem({ quake }: { quake: DTO<"ImpactQuake"> }) {
  return <article className={cx(insetClass, "flex flex-col gap-3 p-3")}>
    <div className="flex flex-wrap items-center gap-2">
      <Chip variant="bold" color={magnitudeColor(quake.mag)}>M {formatDecimal(quake.mag)}</Chip>
      <h4 className="min-w-0 flex-1 text-body-medium text-text-primary">{quake.place ?? "Gempa tercatat"}</h4>
      {quake.tsunami && <Chip variant="caption" color="rose">Tsunami: ditandai sumber</Chip>}
    </div>
    <p className="text-body-2-regular text-text-secondary">{formatRelative(quake.observed_at) ?? "Waktu tidak diketahui"} · {formatDateTime(quake.observed_at)} · {quake.source_id}</p>
    <dl className="grid grid-cols-2 gap-3 text-body-2-regular sm:grid-cols-3">
      <div><dt className="text-text-secondary">Populasi dalam radius</dt><dd className="text-body-medium text-text-primary tabular-nums">{formatInteger(quake.population)}</dd></div>
      <div><dt className="text-text-secondary">Radius model</dt><dd className="text-body-medium text-text-primary tabular-nums">{formatDecimal(quake.radius_km)} km</dd></div>
      <div><dt className="text-text-secondary">Dirasakan</dt><dd className="text-body-medium text-text-primary">{quake.felt ?? "Belum ada laporan"}</dd></div>
    </dl>
    {quake.potensi && <p className="text-body-2-regular text-text-secondary">{quake.potensi}</p>}
    <RegionList regions={quake.regions} />
  </article>;
}

function WarningItem({ warning }: { warning: DTO<"ImpactWarning"> }) {
  const severity = severityLabel(warning.severity);
  return <article className={cx(insetClass, "flex flex-col gap-3 p-3")}>
    <div className="flex flex-wrap items-center gap-2">
      {severity && <Chip variant="bold" color={severity.color}>{severity.label}</Chip>}
      <h4 className="min-w-0 flex-1 text-body-medium text-text-primary">{warning.headline ?? warning.event ?? "Peringatan cuaca"}</h4>
    </div>
    {warning.description && <p className="text-body-2-regular text-text-secondary">{warning.description}</p>}
    <p className="text-body-2-regular text-text-secondary">
      {warning.area ? `${warning.area} · ` : ""}Populasi dalam cakupan {formatInteger(warning.population)}
      {warning.expires ? ` · berlaku sampai ${formatDateTime(warning.expires) ?? warning.expires}` : ""}
    </p>
    <RegionList regions={warning.regions} />
    {warning.url && <a className="inline-flex w-fit items-center gap-1 text-body-2-medium text-text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring" href={warning.url} target="_blank" rel="noreferrer noopener">Sumber peringatan<RiExternalLinkLine className="size-4" aria-hidden /></a>}
  </article>;
}

/** Recorded quakes and weather warnings with the people inside their reach (mode `protected`). */
export function ImpactCard({ impact }: { impact: DTO<"ImpactPanel"> }) {
  const count = impact.quakes.length + impact.warnings.length;
  return <DashboardCard title="Dampak tercatat" value={count} className="max-h-[344px]"
    action={<StatHint label="Dampak tercatat" hint={impact.radius_note} />}>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {count ? <div className="flex flex-col gap-2">
        {impact.quakes.map(quake => <QuakeItem key={`${quake.observed_at}:${quake.lat}:${quake.lon}`} quake={quake} />)}
        {impact.warnings.map(warning => <WarningItem key={warning.id} warning={warning} />)}
      </div> : <PanelUnavailable title="Belum ada dampak tercatat" description="Tidak ada gempa atau peringatan cuaca pada cakupan ini." />}
    </div>
  </DashboardCard>;
}
