"use client";

import { useMemo, useState } from "react";
import { navigate } from "@/lib/navigate";
import {
  RiMore2Fill,
  RiFileCopyLine,
  RiInformationLine,
  RiSearchLine,
  RiBroadcastLine,
  RiAlertLine,
  RiCheckboxCircleLine,
  RiUserSharedLine,
} from "@remixicon/react";
import { toast } from "sonner";

import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Chip } from "@/components/base/badges/chip";
import { Dropdown, DropdownTrigger, DropdownPopover, DropdownGroup, DropdownItem } from "@/components/base/dropdown/dropdown";
import { DataTable } from "@/components/application/data-table/data-table";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import type { ColumnDef } from "@tanstack/react-table";
import { useDevices } from "./device-api";
import { cx } from "@/utils/cx";
import {
  DEVICE_KIND_LABEL,
  DEVICE_STATUS_LABEL,
  deviceKindLabel,
  type DeviceStatus,
  type IotDevice,
} from "./device-data";

const STATUS_TONE = {
  online: "lime",
  offline: "rose",
  calibration: "yellow",
} as const satisfies Record<DeviceStatus, "lime" | "rose" | "yellow">;

const LOW_BATTERY_THRESHOLD = 20;

function DeviceActions({ device }: { device: IotDevice }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Dropdown isOpen={isOpen} onOpenChange={setIsOpen}>
      <DropdownTrigger
        aria-label={`Aksi ${device.name}`}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-2lg border border-border-button-default bg-background-primary-default text-text-secondary shadow-xs outline-none hover:border-border-button-hover hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <RiMore2Fill className="size-4" aria-hidden />
      </DropdownTrigger>
      <DropdownPopover aria-label={`Aksi ${device.name}`} placement="bottom end" className="w-48 p-2">
        <DropdownGroup>
          <DropdownItem onSelect={() => {
            setIsOpen(false);
            if (device.backendId) { navigate(`/devices/${device.backendId}`); return; }
            toast.info(device.name, { description: `${device.id} ? ${device.owner} ? ${DEVICE_STATUS_LABEL[device.status]} ? ${device.location}` });
          }} className="gap-2 px-2 py-1.5">
            <RiInformationLine className="size-4" aria-hidden />Lihat Detail
          </DropdownItem>
          <DropdownItem onSelect={() => {
            setIsOpen(false);
            toast.promise(navigator.clipboard.writeText(device.id), {
              loading: "Menyalin ID Perangkat...", success: "ID Perangkat Disalin", error: "ID Perangkat Gagal Disalin",
            });
          }} className="gap-2 px-2 py-1.5">
            <RiFileCopyLine className="size-4" aria-hidden />Salin ID
          </DropdownItem>
        </DropdownGroup>
      </DropdownPopover>
    </Dropdown>
  );
}

const DEVICE_COLUMNS: ColumnDef<IotDevice>[] = [
  // Position in the filtered, sorted list, so numbering continues across pages.
  {
    id: "no", header: "No", enableSorting: false, enableHiding: false,
    cell: ({ row, table }) => <span className="text-text-secondary tabular-nums">{table.getSortedRowModel().rows.indexOf(row) + 1}</span>,
  },
  {
    accessorKey: "name", header: "Perangkat",
    cell: ({ row: { original: device } }) => (
      <div className="flex min-w-0 flex-col">
        <span className="whitespace-nowrap font-medium text-text-primary">{device.name}</span>
        <span className="text-caption-1 text-text-secondary">{device.id}</span>
      </div>
    ),
  },
  { accessorFn: (device) => deviceKindLabel(device), id: "kind", header: "Jenis" },
  {
    accessorKey: "owner", header: "Pemilik",
    cell: ({ row: { original: device } }) => (
      <div className="flex items-center gap-2 whitespace-nowrap">
        {device.owner}
        {device.ownership === "byod" && <Chip variant="caption" color="purple">BYOD</Chip>}
      </div>
    ),
  },
  {
    accessorKey: "location", header: "Lokasi",
    cell: ({ row: { original: device } }) => (
      <div className="flex flex-col whitespace-nowrap">
        <span>{device.location}</span>
        <span className="text-caption-1 text-text-secondary">{device.province}</span>
      </div>
    ),
  },
  {
    accessorKey: "status", header: "Status",
    cell: ({ row: { original: device } }) => (
      <Chip variant="caption" color={STATUS_TONE[device.status]}>{DEVICE_STATUS_LABEL[device.status]}</Chip>
    ),
  },
  {
    accessorKey: "battery", header: "Baterai",
    cell: ({ row: { original: device } }) => device.battery === null ? (
      <span className="text-text-tertiary">Listrik</span>
    ) : (
      <span className={cx("font-medium", device.battery < LOW_BATTERY_THRESHOLD ? "text-text-error-primary" : "text-text-primary")}>
        {device.battery}%
      </span>
    ),
  },
  {
    id: "lastSeen", header: "Terakhir Aktif",
    accessorFn: (device) => {
      const amount = Number.parseInt(device.lastSeen, 10);
      return Number.isNaN(amount) ? Number.POSITIVE_INFINITY : amount * (device.lastSeen.includes("jam") ? 60 : 1);
    },
    cell: ({ row }) => row.original.lastSeen,
  },
  { id: "actions", header: "Aksi", enableSorting: false, cell: ({ row }) => <DeviceActions device={row.original} /> },
];

export function DeviceRegistry() {
  const { devices, error, loading } = useDevices();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const filteredDevices = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id");
    return devices.filter((device) =>
      (statusFilter === "all" || device.status === statusFilter) &&
      (kindFilter === "all" || device.kind === kindFilter) &&
      (ownershipFilter === "all" || device.ownership === ownershipFilter) &&
      [device.id, device.name, device.owner, device.location, device.province, deviceKindLabel(device), DEVICE_STATUS_LABEL[device.status]]
      .some((value) => value.toLocaleLowerCase("id").includes(search)));
  }, [devices, query, statusFilter, kindFilter, ownershipFilter]);

  const stats = useMemo<Stat[]>(() => {
    const total = devices.length;
    const online = devices.filter((d) => d.status === "online").length;
    const attention = devices.filter(
      (d) => d.status !== "online" || (d.battery !== null && d.battery < LOW_BATTERY_THRESHOLD),
    ).length;
    const byod = devices.filter((d) => d.ownership === "byod").length;
    const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

    return [
      {
        icon: RiBroadcastLine,
        label: "Total Alat",
        value: String(total),
        delta: `${new Set(devices.map((d) => d.province)).size} provinsi`,
        deltaColor: "neutral",
        tone: "blue",
        caption: "Instansi & BYOD",
        hint: "Seluruh perangkat IoT yang terdaftar pada platform, termasuk milik instansi dan mitra.",
      },
      {
        icon: RiCheckboxCircleLine,
        label: "Alat Online",
        value: String(online),
        delta: pct(online),
        deltaColor: "lime",
        tone: "emerald",
        caption: `${total - online} tidak aktif`,
        hint: "Perangkat yang mengirim telemetri dalam interval terakhir.",
      },
      {
        icon: RiAlertLine,
        label: "Perlu Perhatian",
        value: String(attention),
        delta: pct(attention),
        deltaColor: attention > 0 ? "rose" : "neutral",
        tone: "orange",
        caption: "Offline / baterai rendah",
        hint: "Perangkat offline, sedang kalibrasi, atau berbaterai rendah.",
      },
      {
        icon: RiUserSharedLine,
        label: "Alat BYOD",
        value: String(byod),
        delta: pct(byod),
        deltaColor: "neutral",
        tone: "purple",
        caption: "Milik warga & mitra",
        hint: "Perangkat milik warga, komunitas, atau mitra yang dihubungkan sendiri (Bring Your Own Device).",
      },
    ];
  }, [devices]);

  return (
    <>
      {error && <p role="alert" className="text-body-regular text-text-error-primary">{error}</p>}
      {loading && <p role="status" className="text-body-regular text-text-secondary">Memuat perangkat...</p>}
    <div className="flex flex-col gap-3">
      <StatCards variant="footer" columns={4} stats={stats} />

      <DataTable
        data={filteredDevices}
        columns={DEVICE_COLUMNS}
        label="Daftar Perangkat IoT Dan BYOD"
        size="md"
        emptyMessage="Tidak ada perangkat yang cocok. Coba nama, pemilik, atau lokasi lain."
        className="min-w-[1000px]"
        toolbar={
          <>
            <div className="flex flex-col justify-center">
              <p className="text-body-medium text-text-tertiary">Total Hasil</p>
              <p className="text-body-medium text-text-primary">{filteredDevices.length} Perangkat</p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
              <Select aria-label="Filter Status" selectedKey={statusFilter} onSelectionChange={(key) => setStatusFilter(String(key))}>
                <SelectItem id="all">Semua Status</SelectItem>
                {Object.entries(DEVICE_STATUS_LABEL).map(([id, label]) => <SelectItem key={id} id={id}>{label}</SelectItem>)}
              </Select>
              <Select aria-label="Filter Jenis" selectedKey={kindFilter} onSelectionChange={(key) => setKindFilter(String(key))}>
                <SelectItem id="all">Semua Jenis</SelectItem>
                {Object.entries(DEVICE_KIND_LABEL).map(([id, label]) => <SelectItem key={id} id={id}>{label}</SelectItem>)}
                <SelectItem id="other">Lainnya</SelectItem>
              </Select>
              <Select aria-label="Filter Pemilik" selectedKey={ownershipFilter} onSelectionChange={(key) => setOwnershipFilter(String(key))}>
                <SelectItem id="all">Semua Pemilik</SelectItem>
                <SelectItem id="institution">Instansi</SelectItem>
                <SelectItem id="byod">BYOD</SelectItem>
              </Select>
              <Input
                aria-label="Cari Perangkat"
                placeholder="Cari Perangkat"
                leadingIcon={RiSearchLine}
                value={query}
                onChange={setQuery}
                fieldClassName="rounded-full bg-background-supporting-default"
                className="min-w-0 flex-1 sm:w-64 md:w-72 lg:w-80 sm:flex-none"
              />
            </div>
          </>
        }
      />
    </div>
    </>
  );
}
