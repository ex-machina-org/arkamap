import { useMemo } from "react";
import { RiFlaskLine, RiSensorLine } from "@remixicon/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/application/data-table/data-table";
import { StatHint } from "@/components/application/dashboard/stat-cards";
import { Chip } from "@/components/base/badges/chip";
import type { DTO } from "@/lib/api/client";
import { clampPercent, formatDecimal, formatPeriodText } from "../format";
import { prettifyId } from "../labels";
import { useSourceName } from "../use-source-catalog";
import { Pill } from "./pill";

type Row = DTO<"OurIndicator"> & { id: string };

/** BoardUI DataTable of the metrics the AI picked for the profile's region; reasons live in the info hint. */
export function IndicatorTable({ region, title }: { region: DTO<"OurRegion">; title?: string }) {
  const sourceName = useSourceName();
  const rows = useMemo<Row[]>(() => region.indicators.map(indicator => ({ ...indicator, id: indicator.metric })), [region.indicators]);
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    {
      accessorKey: "label",
      header: "Indikator",
      cell: ({ row }) => <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-body-medium text-text-primary">{row.original.label}</span>
        <StatHint label={row.original.label} hint={row.original.reason} />
        {row.original.is_modelled && <Pill icon={RiFlaskLine} iconClassName="text-purple-500">Model</Pill>}
        {row.original.added_for_sensor && <Pill icon={RiSensorLine} iconClassName="text-cyan-500">Sensor</Pill>}
      </div>,
    },
    {
      accessorKey: "value",
      header: "Nilai",
      cell: ({ row }) => <span className="text-body-medium text-text-primary tabular-nums">{formatDecimal(row.original.value)} <span className="text-text-secondary">{row.original.unit}</span></span>,
    },
    {
      accessorKey: "normalised",
      header: "Tingkat perhatian",
      cell: ({ row }) => <div className="flex min-w-36 items-center gap-2">
        <div role="meter" aria-label={`Tingkat perhatian ${row.original.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.original.normalised} className="h-2 flex-1 overflow-hidden rounded-full bg-chart-track">
          <div className="h-full rounded-full bg-chart-1-active" style={{ width: `${clampPercent(row.original.normalised)}%` }} />
        </div>
        <span className="w-8 text-right text-body-2-medium text-text-secondary tabular-nums">{Math.round(row.original.normalised)}</span>
      </div>,
    },
    { accessorKey: "source_id", header: "Sumber", cell: ({ row }) => <span className="text-text-secondary">{sourceName(row.original.source_id)}</span> },
    { accessorKey: "period", header: "Periode", cell: ({ row }) => <span className="text-text-secondary tabular-nums">{formatPeriodText(row.original.period)}</span> },
    { accessorKey: "confidence", header: "Keyakinan", cell: ({ row }) => <span className="text-text-secondary tabular-nums">{row.original.confidence}/5</span> },
  ], [sourceName]);

  return <DataTable
    data={rows}
    columns={columns}
    label={`Indikator pilihan untuk ${region.name}`}
    emptyMessage="Belum ada indikator untuk wilayah ini."
    pageSize={8}
    toolbar={<>
      <div className="flex min-w-0 items-center gap-2 px-1">
        <p className="text-body-medium text-text-primary">{title ?? `Indikator pilihan untuk ${region.name}`}</p>
        <StatHint label="Indikator pilihan" hint="Dipilih AI dari profil Anda. Arahkan ke ikon info untuk alasan tiap indikator. Tingkat perhatian 0-100, 100 paling perlu perhatian." />
      </div>
      {!!region.missing.length && <Chip variant="subtle" color="neutral" title={region.missing.map(prettifyId).join(", ")}>{region.missing.length} data belum tersedia</Chip>}
    </>}
  />;
}
