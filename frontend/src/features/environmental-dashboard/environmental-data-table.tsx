"use client";

import { useMemo, useState } from "react";
import {
  RiDownload2Line,
  RiNavigationLine,
} from "@remixicon/react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";

import { Chip } from "@/components/base/badges/chip";
import { StatusDot } from "@/components/base/badges/status-dot";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Pagination } from "@/components/base/pagination/pagination";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/base/table/table";
import type { TableSize } from "@/components/base/table/table";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { RankBadge } from "@/components/ui/rank-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ChevronSortDown } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";
import type { EnvironmentalIncident } from "./environmental-data";

function SortChevron({ dir }: { dir: false | "asc" | "desc" }) {
  return (
    <ChevronSortDown
      className={cx(
        "size-4 shrink-0 transition-[transform,color] duration-150",
        dir === "asc" && "rotate-180",
        dir ? "text-accent-600" : "text-text-tertiary",
      )}
    />
  );
}

export interface EnvironmentalDataTableProps {
  data: EnvironmentalIncident[];
  activeIncidentId?: string;
  onSelectIncident: (incident: EnvironmentalIncident) => void;
  onOpenForensic?: (incident: EnvironmentalIncident) => void;
  onBatchDispatch?: (incidents: EnvironmentalIncident[]) => void;
  onBatchDownloadGeoJSON?: (incidents: EnvironmentalIncident[]) => void;
  pageSize?: number;
  showDensityToggle?: boolean;
  className?: string;
}

export function EnvironmentalDataTable({
  data,
  activeIncidentId,
  onSelectIncident,
  onOpenForensic,
  onBatchDispatch,
  onBatchDownloadGeoJSON,
  pageSize = 5,
  showDensityToggle = true,
  className,
}: EnvironmentalDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "urgencyScore", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [size, setSize] = useState<TableSize>("sm");

  const columns = useMemo<ColumnDef<EnvironmentalIncident>[]>(
    () => [
      {
        id: "select_and_rank",
        header: ({ table }) => (
          <div className="flex items-center gap-2">
            <Checkbox
              slot={null}
              aria-label="Pilih semua insiden di halaman ini"
              isSelected={table.getIsAllPageRowsSelected()}
              isIndeterminate={
                table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
              }
              onChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            />
            <span className="text-body-medium text-text-tertiary">Peringkat</span>
          </div>
        ),
        cell: ({ row }) => {
          const index = row.index;
          return (
            <div className="flex items-center gap-2.5">
              <Checkbox
                slot={null}
                aria-label={`Pilih ${row.original.title}`}
                isSelected={row.getIsSelected()}
                onChange={(v) => row.toggleSelected(!!v)}
                onClick={(e) => e.stopPropagation()}
              />
              <RankBadge
                rank={index + 1}
                tier={index === 0 ? "gold" : index === 1 ? "silver" : "bronze"}
              />
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "title",
        header: "Wilayah & Bahaya",
        cell: ({ row }) => {
          const inc = row.original;
          return (
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-text-primary truncate">
                {inc.title}
              </span>
              <span className="text-[11px] text-text-secondary truncate">
                {inc.location} · {inc.province}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "hazardType",
        header: "Kategori",
        cell: ({ row }) => {
          const type = row.original.hazardType;
          return (
            <div>
              {type === "hotspot" && (
                <Chip variant={size === "sm" ? "caption" : "bold"} color="rose">
                  Karhutla
                </Chip>
              )}
              {type === "flood" && (
                <Chip variant={size === "sm" ? "caption" : "bold"} color="cyan">
                  Banjir
                </Chip>
              )}
              {type === "air_quality" && (
                <Chip variant={size === "sm" ? "caption" : "bold"} color="purple">
                  ISPU
                </Chip>
              )}
              {type === "iot_sensor" && (
                <Chip variant={size === "sm" ? "caption" : "bold"} color="lime">
                  IoT Sensor
                </Chip>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "urgencyScore",
        header: "Skor Jev",
        cell: ({ row }) => {
          const score = row.original.urgencyScore;
          return (
            <TooltipTrigger delay={100}>
              <span
                className={`inline-flex rounded px-1.5 py-0.5 text-caption-2 font-bold text-white shadow-xs ${
                  score >= 9.0
                    ? "bg-destructive"
                    : score >= 8.0
                    ? "bg-warning text-text-primary"
                    : "bg-info"
                }`}
              >
                {score.toFixed(1)}
              </span>
              <Tooltip size="sm">
                Skor spasial Jev: {score}/10 (Conf: {row.original.confidence}%)
              </Tooltip>
            </TooltipTrigger>
          );
        },
      },
      {
        accessorKey: "populationAtRisk",
        header: "Populasi",
        cell: ({ row }) => (
          <span className="font-medium text-text-primary whitespace-nowrap">
            {row.original.populationAtRisk.toLocaleString("id-ID")} jiwa
          </span>
        ),
      },
      {
        accessorKey: "source",
        header: "Sumber Data",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-[11px] text-text-secondary whitespace-nowrap">
            <StatusDot color="green" />
            <span>{row.original.source}</span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <StatusBadge
              tone={
                s === "Belum Ditangani"
                  ? "danger"
                  : s === "Dalam Penanganan"
                  ? "warning"
                  : "success"
              }
            >
              {s}
            </StatusBadge>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="text-right block">Aksi</span>,
        cell: ({ row }) => {
          const inc = row.original;
          return (
            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="secondary"
                size="small"
                className="h-6 text-[11px] px-2"
                onClick={() => onOpenForensic?.(inc)}
              >
                Forensik →
              </Button>
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [size, onOpenForensic],
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection, pagination },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
  });

  const headers = table.getHeaderGroups()[0].headers;
  const rows = table.getRowModel().rows;
  const totalPages = table.getPageCount();

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  const colWidths: Record<string, string> = {
    select_and_rank: "w-[130px]",
    title: "w-[220px]",
    hazardType: "w-[120px]",
    urgencyScore: "w-[100px]",
    populationAtRisk: "w-[130px]",
    source: "w-[140px]",
    status: "w-[140px]",
    actions: "w-[100px]",
  };

  return (
    <section
      className={cx(
        "flex w-full flex-col rounded-xl border border-border-table bg-background-primary-default shadow-2xs overflow-hidden",
        className,
      )}
    >
      {/* Table Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border-button-default px-4 py-2.5 bg-background-supporting-default">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
            Matriks Prioritas Lapangan
          </h3>
          <Badge color="neutral">{data.length}</Badge>
          {selectedCount > 0 && (
            <Badge color="primary" className="ml-1">
              {selectedCount} Terpilih
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Batch Actions Bar when rows are selected */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-1.5 mr-1">
              <Button
                variant="primary"
                size="small"
                className="h-7 text-xs px-2.5"
                leadingIcon={RiNavigationLine}
                onClick={() =>
                  onBatchDispatch?.(selectedRows.map((r) => r.original))
                }
              >
                Disposisi ({selectedCount})
              </Button>
              <Button
                variant="secondary"
                size="small"
                className="h-7 text-xs px-2.5"
                leadingIcon={RiDownload2Line}
                onClick={() =>
                  onBatchDownloadGeoJSON?.(selectedRows.map((r) => r.original))
                }
              >
                GeoJSON
              </Button>
              <button
                type="button"
                onClick={() => table.resetRowSelection()}
                className="text-[11px] text-text-secondary hover:text-text-primary underline px-1"
              >
                Batal
              </button>
            </div>
          )}

          {/* Density Toggle */}
          {showDensityToggle && (
            <SegmentedControl
              aria-label="Kerapatan tabel"
              selectedKeys={new Set([size])}
              onSelectionChange={(keys) => {
                const next = [...keys][0];
                if (next) setSize(next as TableSize);
              }}
            >
              <SegmentedControlItem id="sm">Rapat</SegmentedControlItem>
              <SegmentedControlItem id="md">Normal</SegmentedControlItem>
            </SegmentedControl>
          )}
        </div>
      </div>

      {/* TanStack Table rendering the registered BoardUI React Aria Table primitive */}
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <Table
          aria-label="Matriks Prioritas Lapangan"
          size={size}
          selectionMode="none"
          className="min-w-[840px]"
        >
          <TableHeader>
            {headers.map((header) => {
              const id = header.column.id;
              const canSort = header.column.getCanSort();
              const label = flexRender(
                header.column.columnDef.header,
                header.getContext(),
              );
              return (
                <TableColumn
                  key={header.id}
                  id={header.id}
                  className={cx(colWidths[id], "text-xs")}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex cursor-pointer items-center gap-1 font-medium text-text-secondary hover:text-text-primary outline-none focus-visible:ring-1 focus-visible:ring-accent-500 rounded px-0.5"
                    >
                      {label}
                      <SortChevron dir={header.column.getIsSorted()} />
                    </button>
                  ) : (
                    label
                  )}
                </TableColumn>
              );
            })}
          </TableHeader>
          <TableBody
            renderEmptyState={() => (
              <div className="flex h-32 items-center justify-center text-xs text-text-tertiary">
                Tidak ada insiden yang cocok dengan filter aktif.
              </div>
            )}
          >
            {rows.map((row) => {
              const isSelected = row.getIsSelected();
              const isCurrentActive = row.original.id === activeIncidentId;
              return (
                <TableRow
                  key={row.id}
                  id={row.id}
                  className={cx(
                    "cursor-pointer transition-colors duration-150",
                    isCurrentActive
                      ? "bg-accent-50/70 dark:bg-accent-950/40"
                      : isSelected
                      ? "bg-background-primary-active"
                      : "hover:bg-background-primary-hover/60",
                  )}
                  onClick={() => onSelectIncident(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cx(colWidths[cell.column.id], "text-xs")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border-button-default px-4 py-2 bg-background-supporting-default">
          <span className="text-[11px] text-text-secondary">
            Menampilkan {rows.length} dari {data.length} insiden
          </span>
          <Pagination
            page={pagination.pageIndex + 1}
            totalPages={totalPages}
            onChange={(p) => table.setPageIndex(p - 1)}
          />
        </div>
      )}
    </section>
  );
}
