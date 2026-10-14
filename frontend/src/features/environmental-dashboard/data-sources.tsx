"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RiAlertLine, RiBroadcastLine, RiCheckboxCircleLine, RiDatabase2Line, RiExternalLinkLine, RiSearchLine } from "@remixicon/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/application/data-table/data-table";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Chip } from "@/components/base/badges/chip";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { apiList, type DTO } from "@/lib/api/client";
import { formatRelative, isOnline } from "./device-api";

type Source = DTO<"SourceInfo">;
/** The table keys rows by a string `id`; the API's device id is a number. */
type Device = Omit<DTO<"DeviceOut">, "id"> & { id: string };
type Health = "ok" | "failed" | "idle";

const HEALTH_LABEL = { ok: "Normal", failed: "Gagal", idle: "Belum berjalan" } as const satisfies Record<Health, string>;
const HEALTH_TONE = { ok: "lime", failed: "rose", idle: "neutral" } as const satisfies Record<Health, "lime" | "rose" | "neutral">;

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("id-ID") + value.slice(1);

/** A source has failed when its latest run is newer than its latest success and it recorded an error. */
function sourceHealth(source: Source): Health {
  if (!source.last_ok_at) return source.last_error ? "failed" : "idle";
  const failedSince = source.last_run_at && Date.parse(source.last_run_at) > Date.parse(source.last_ok_at);
  return source.last_error && failedSince ? "failed" : "ok";
}

/** One request that reports its own loading and error state, so a failing list never hides the other one. */
function useList<T>(load: (signal: AbortSignal) => Promise<T[]>) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error?: string }>({ items: [], loading: true });
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then(items => { if (!controller.signal.aborted) setState({ items, loading: false }); })
      .catch(cause => { if (!controller.signal.aborted) setState({ items: [], loading: false, error: cause instanceof Error ? cause.message : "Gagal memuat data." }); });
    return () => controller.abort();
    // `load` is a module-level function, so the request runs once per mount.
  }, [load]);
  return state;
}

const loadSources = (signal: AbortSignal) => apiList("/sources", "SourceInfo", { signal });
const loadDevices = (signal: AbortSignal) =>
  apiList("/me/devices", "DeviceOut", { signal }).then(items => items.map((device): Device => ({ ...device, id: String(device.id) })));

const SOURCE_COLUMNS: ColumnDef<Source>[] = [
  {
    accessorKey: "title", header: "Sumber",
    cell: ({ row: { original: source } }) => (
      <div className="flex min-w-[16rem] max-w-sm flex-col">
        <span className="font-medium text-text-primary">{source.title}</span>
        {source.url.startsWith("http") ? (
          <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-caption-1 text-text-secondary underline-offset-2 outline-none hover:text-text-primary hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring">
            {source.publisher}<RiExternalLinkLine className="size-3" aria-hidden />
          </a>
        ) : <span className="text-caption-1 text-text-secondary">{source.publisher}</span>}
      </div>
    ),
  },
  { accessorKey: "aspect", header: "Aspek", cell: ({ row }) => capitalize(row.original.aspect) },
  { accessorKey: "cadence", header: "Pembaruan", cell: ({ row }) => capitalize(row.original.cadence) },
  {
    accessorKey: "is_modelled", header: "Jenis",
    cell: ({ row }) => <Chip variant="caption" color={row.original.is_modelled ? "purple" : "neutral"}>{row.original.is_modelled ? "Model" : "Observasi"}</Chip>,
  },
  { accessorKey: "license", header: "Lisensi", cell: ({ row }) => <span className="block min-w-32 max-w-56">{row.original.license}</span> },
  {
    id: "last_ok", header: "Terakhir berhasil",
    accessorFn: source => (source.last_ok_at ? Date.parse(source.last_ok_at) : 0),
    cell: ({ row }) => <span className="whitespace-nowrap">{formatRelative(row.original.last_ok_at)}</span>,
  },
  {
    id: "status", header: "Status",
    accessorFn: source => HEALTH_LABEL[sourceHealth(source)],
    cell: ({ row }) => {
      const health = sourceHealth(row.original);
      return <Chip variant="caption" color={HEALTH_TONE[health]}>{HEALTH_LABEL[health]}</Chip>;
    },
  },
];

const DEVICE_COLUMNS: ColumnDef<Device>[] = [
  {
    accessorKey: "name", header: "Perangkat",
    cell: ({ row: { original: device } }) => (
      <div className="flex min-w-0 flex-col">
        <a href={`/devices/${device.id}`} className="w-fit whitespace-nowrap font-medium text-text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring">{device.name}</a>
        <span className="text-caption-1 text-text-secondary">{device.key_prefix}</span>
      </div>
    ),
  },
  { id: "region", header: "Wilayah", accessorFn: device => device.region_name ?? "Belum ditentukan" },
  {
    id: "last_seen", header: "Terakhir aktif",
    accessorFn: device => (device.last_seen_at ? Date.parse(device.last_seen_at) : 0),
    cell: ({ row }) => <span className="whitespace-nowrap">{formatRelative(row.original.last_seen_at)}</span>,
  },
  {
    id: "status", header: "Status",
    accessorFn: device => (isOnline(device.last_seen_at) ? "Online" : "Offline"),
    cell: ({ row }) => {
      const online = isOnline(row.original.last_seen_at);
      return <Chip variant="caption" color={online ? "lime" : "rose"}>{online ? "Online" : "Offline"}</Chip>;
    },
  },
  {
    id: "notes", header: "Catatan", enableSorting: false,
    cell: ({ row: { original: device } }) => {
      const parts = [
        device.rejected_count ? `${device.rejected_count} ditolak` : "",
        device.warning_count ? `${device.warning_count} peringatan` : "",
      ].filter(Boolean);
      return parts.length ? <span className="whitespace-nowrap text-text-error-primary">{parts.join(" · ")}</span> : <span className="text-text-tertiary">Tidak ada</span>;
    },
  },
];

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="px-1">
        <h2 className="text-title-3-medium text-text-primary">{title}</h2>
        <p className="text-body-2-regular text-text-secondary">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** The page behind "Sumber Data": the public API sources Arkamap ingests and the account's own IoT devices. */
export function DataSources() {
  const sources = useList<Source>(loadSources);
  const devices = useList<Device>(loadDevices);
  const [query, setQuery] = useState("");
  const [aspect, setAspect] = useState("all");

  const aspects = useMemo(() => [...new Set(sources.items.map(source => source.aspect))].sort(), [sources.items]);
  const visibleSources = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id-ID");
    return sources.items.filter(source =>
      (aspect === "all" || source.aspect === aspect) &&
      (!search || [source.title, source.publisher, source.license, source.cadence, source.aspect].some(value => value.toLocaleLowerCase("id-ID").includes(search))));
  }, [sources.items, query, aspect]);

  const stats = useMemo<Stat[]>(() => {
    const total = sources.items.length;
    const healthy = sources.items.filter(source => sourceHealth(source) === "ok").length;
    const failing = sources.items.filter(source => sourceHealth(source) === "failed").length;
    const online = devices.items.filter(device => isOnline(device.last_seen_at)).length;
    const modelled = sources.items.filter(source => source.is_modelled).length;
    return [
      { icon: RiDatabase2Line, label: "Sumber API", value: String(total), delta: `${modelled} model`, deltaColor: "neutral", tone: "blue", caption: "Data publik dan turunan", hint: "Sumber data publik yang dibaca Arkamap, termasuk indikator turunan model." },
      { icon: RiCheckboxCircleLine, label: "Berjalan normal", value: String(healthy), delta: total ? `${Math.round((healthy / total) * 100)}%` : "0%", deltaColor: "lime", tone: "emerald", caption: `${total - healthy - failing} belum berjalan`, hint: "Sumber yang proses pembaruan terakhirnya berhasil." },
      { icon: RiBroadcastLine, label: "Perangkat IoT", value: String(devices.items.length), delta: `${online} online`, deltaColor: online > 0 ? "lime" : "neutral", tone: "purple", caption: "Milik akun Anda", hint: "Perangkat yang mengirim telemetri dalam 15 menit terakhir dihitung online." },
      { icon: RiAlertLine, label: "Perlu perhatian", value: String(failing + devices.items.length - online), delta: `${failing} sumber`, deltaColor: failing > 0 ? "rose" : "neutral", tone: "orange", caption: `${devices.items.length - online} perangkat offline`, hint: "Sumber API yang gagal diperbarui dan perangkat yang sedang offline." },
    ];
  }, [sources.items, devices.items]);

  return (
    <div className="flex flex-col gap-4">
      <StatCards variant="footer" columns={4} stats={stats} />

      <Section title="Sumber API" description="Data publik yang diambil dan diperbarui Arkamap.">
        {sources.error && <p role="alert" className="px-1 text-body-regular text-text-error-primary">{sources.error}</p>}
        {sources.loading ? <p role="status" className="px-1 text-body-regular text-text-secondary">Memuat sumber data...</p> : (
          <DataTable
            data={visibleSources}
            columns={SOURCE_COLUMNS}
            label="Daftar sumber API"
            size="md"
            emptyMessage="Tidak ada sumber yang cocok. Coba kata kunci atau aspek lain."
            className="min-w-[1000px]"
            toolbar={
              <>
                <div className="flex flex-col justify-center">
                  <p className="text-body-medium text-text-tertiary">Total hasil</p>
                  <p className="text-body-medium text-text-primary">{visibleSources.length} sumber</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
                  <Select aria-label="Filter aspek" selectedKey={aspect} onSelectionChange={key => setAspect(String(key))}>
                    <SelectItem id="all">Semua aspek</SelectItem>
                    {aspects.map(item => <SelectItem key={item} id={item}>{capitalize(item)}</SelectItem>)}
                  </Select>
                  <Input
                    aria-label="Cari sumber"
                    placeholder="Cari sumber"
                    leadingIcon={RiSearchLine}
                    value={query}
                    onChange={setQuery}
                    fieldClassName="rounded-full bg-background-supporting-default"
                    className="min-w-0 flex-1 sm:w-64 sm:flex-none"
                  />
                </div>
              </>
            }
          />
        )}
      </Section>

      <Section title="Perangkat IoT" description="Alat yang terhubung ke akun Anda dan mengirim data langsung ke Arkamap.">
        {devices.error && <p role="alert" className="px-1 text-body-regular text-text-error-primary">{devices.error}</p>}
        {devices.loading ? <p role="status" className="px-1 text-body-regular text-text-secondary">Memuat perangkat...</p> : (
          <DataTable
            data={devices.items}
            columns={DEVICE_COLUMNS}
            label="Daftar perangkat IoT"
            size="md"
            emptyMessage="Belum ada perangkat. Tambahkan alat dari menu Perangkat IoT & BYOD."
            className="min-w-[700px]"
            toolbar={
              <div className="flex flex-col justify-center">
                <p className="text-body-medium text-text-tertiary">Total perangkat</p>
                <p className="text-body-medium text-text-primary">{devices.items.length} perangkat</p>
              </div>
            }
          />
        )}
      </Section>
    </div>
  );
}
