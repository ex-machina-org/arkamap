import { useState } from "react";
import { RiDeleteBinLine, RiGroupLine, RiLayoutGridLine, RiSettings3Line, RiShareLine, RiStackLine } from "@remixicon/react";
import { toast } from "sonner";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { Switch } from "@/components/base/switch/switch";
import { api, apiList, jsonBody, request, type DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import { deviceKindLabel } from "../device-data";
import { deviceView } from "../device-api";
import { LocationField } from "../device-form";
import { insetClass } from "../components/dashboard-card";
import { useConfirm } from "../components/device-helpers";
import { Fact, Notice, SectionCard } from "../components/device-ui";
import { MAX_NAMES } from "./device-connection";
import { CATEGORY_LABEL, WIDGET_LABEL } from "./readings";

const COMMUNITY = {
  none: { label: "Privat", color: "neutral" },
  pending: { label: "Menunggu Tinjauan", color: "yellow" },
  approved: { label: "Tampil Di Komunitas", color: "lime" },
  rejected: { label: "Ditolak Admin", color: "rose" },
} as const;

const fieldKeys = (stream: DTO<"Stream">) => stream.fields.map(field => field.key).sort().join("\n");

export function DeviceSettings({ device, streams, onChanged }: { device: DTO<"DeviceOut">; streams: DTO<"Stream">[]; onChanged: () => void }) {
  const path = `/me/devices/${device.id}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState(device.name);
  const [hint, setHint] = useState(device.category ?? "");
  const [location, setLocation] = useState(device.lat != null && device.lon != null ? { lat: device.lat, lon: device.lon } : undefined);
  const { ask, dialog } = useConfirm();
  const view = deviceView(device);

  async function mutate(action: () => Promise<unknown>, success?: string) {
    setBusy(true); setError(undefined);
    try { await action(); onChanged(); if (success) toast.success(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Perubahan gagal disimpan."); }
    finally { setBusy(false); }
  }

  const locationChanged = location && (location.lat !== device.lat || location.lon !== device.lon);
  const generalChanged = name.trim() !== device.name || hint.trim() !== (device.category ?? "") || locationChanged;
  const editLayout = (edit: Partial<DTO<"WidgetSpec">> & { field: string }) => mutate(() => apiList(`${path}/layout`, "WidgetSpec", { method: "PUT", ...jsonBody([edit]) }));
  const status = COMMUNITY[device.community_status];
  const shared = device.community_status === "pending" || device.community_status === "approved";

  return <div className="flex flex-col gap-4">
    {error && <Notice tone="danger" title="Perubahan Gagal Disimpan">{error}</Notice>}

    <SectionCard icon={RiSettings3Line} tone="blue" title="Umum" description="Nama, petunjuk jenis data, dan lokasi alat. Nama wilayah diperbarui otomatis dari titik lokasi.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="Nama Alat" value={name} onChange={setName} maxLength={100} placeholder="Contoh: Sensor Sawah 1" />
        <Input label="Jenis Atau Petunjuk Data" value={hint} onChange={setHint} maxLength={50} placeholder="Contoh: Stasiun Cuaca" hint="Membantu server mengenali isi data. Kategori sebenarnya ditentukan per field." />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-body-medium text-text-primary">Lokasi Pemasangan</span>
        <LocationField value={location} onChange={setLocation} onError={setError} regionName={locationChanged ? undefined : device.region_name} />
      </div>
      <dl className={cx(insetClass, "grid gap-4 p-4")}>
        <Fact label="Jenis Terdaftar">{deviceKindLabel(view)}</Fact>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-button-default pt-4">
        <p className="max-w-md text-body-2-regular text-pretty text-text-secondary">Jenis terdaftar ditetapkan otomatis oleh server saat payload pertama diterima.</p>
        <Button size="small" disabled={busy || !generalChanged || !name.trim()} onClick={() => void mutate(() => api(path, "DeviceOut", { method: "PATCH", ...jsonBody({
          name: name.trim() !== device.name ? name.trim() : undefined,
          category: hint.trim() && hint.trim() !== device.category ? hint.trim() : undefined,
          location: locationChanged ? location : undefined,
        }) }), "Perubahan Disimpan")}>Simpan Perubahan</Button>
      </div>
    </SectionCard>

    {device.layout && device.layout.length > 0 && <SectionCard icon={RiLayoutGridLine} tone="purple" title="Tampilan Data"
      description="Atur label, bentuk tampilan, dan kategori tiap field. Pilihan Anda tidak ditimpa AI.">
      <div className="flex flex-col gap-2">
        {device.layout.map(widget => <div key={widget.field} className={cx(insetClass, "grid items-end gap-3 p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]", widget.hidden && "opacity-70")}>
          <Input label={<span className="flex items-center gap-2">Label <code className="font-mono text-caption-1-regular text-text-tertiary">{widget.field}</code></span>} defaultValue={widget.label} maxLength={100}
            onBlur={event => { const label = event.currentTarget.value.trim(); if (label && label !== widget.label) void editLayout({ field: widget.field, label }); }} />
          <div className="flex flex-col gap-1.5">
            <span className="text-body-medium text-text-primary">Tampilan</span>
            <Select aria-label={`Tampilan ${widget.label}`} selectedKey={widget.widget} onSelectionChange={value => { if (value !== widget.widget) void editLayout({ field: widget.field, widget: value as DTO<"WidgetSpec">["widget"] }); }}>
              {Object.entries(WIDGET_LABEL).map(([id, label]) => <SelectItem key={id} id={id}>{label}</SelectItem>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-body-medium text-text-primary">Kategori</span>
            <Select aria-label={`Kategori ${widget.label}`} selectedKey={widget.category ?? "lainnya"} onSelectionChange={value => { if (value !== (widget.category ?? "lainnya")) void editLayout({ field: widget.field, category: value as DTO<"WidgetSpec">["category"] }); }}>
              {Object.entries(CATEGORY_LABEL).map(([id, label]) => <SelectItem key={id} id={id}>{label}</SelectItem>)}
            </Select>
          </div>
          <Switch className="pb-2" isSelected={!widget.hidden} isDisabled={busy} onChange={visible => void editLayout({ field: widget.field, hidden: !visible })}>Tampilkan</Switch>
        </div>)}
      </div>
    </SectionCard>}

    {streams.length > 0 && <SectionCard icon={RiStackLine} tone="sky" title="Kelompok Data"
      description={`Satu tabel per "nama" yang dikirim alat, maksimal ${MAX_NAMES}. Hanya kelompok dengan field yang sama persis yang bisa digabung.`}>
      <div className="flex flex-col gap-2">
        {streams.map(stream => <div key={stream.id} className={cx(insetClass, "grid items-end gap-3 p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]")}>
          <Input label={<span className="flex items-center gap-2">Nama Kelompok <Chip variant="caption" color="soft">{stream.reading_count.toLocaleString("id-ID")} Pembacaan</Chip></span>} defaultValue={stream.name} maxLength={100}
            onBlur={event => { const value = event.currentTarget.value.trim(); if (value && value !== stream.name) void mutate(() => apiList(`${path}/streams/${stream.id}`, "Stream", { method: "PATCH", ...jsonBody({ name: value }) }), "Nama Kelompok Disimpan"); }} />
          {streams.length > 1 ? (() => {
            // mirrors the backend: only tables with exactly the same fields merge
            const keys = fieldKeys(stream);
            const targets = streams.filter(other => other.id !== stream.id && fieldKeys(other) === keys);
            return <div className="flex flex-col gap-1.5">
            <span className="text-body-medium text-text-primary">Gabungkan Ke</span>
            {targets.length ? <Select aria-label={`Gabungkan ${stream.name}`} placeholder="Pilih Kelompok Tujuan" selectedKey={null} onSelectionChange={value => {
              const target = streams.find(other => String(other.id) === String(value));
              if (target) ask({
                title: `Gabungkan "${stream.name}"?`,
                description: `Semua pembacaan dipindah ke "${target.name}" dan kelompok ini dihapus. Tindakan ini tidak bisa dibatalkan.`,
                confirmLabel: "Gabungkan Kelompok",
                run: () => void mutate(() => request(`${path}/streams/${stream.id}/merge`, { method: "POST", ...jsonBody({ into: target.id }) }), "Kelompok Digabung"),
              });
            }}>{targets.map(other => <SelectItem key={other.id} id={String(other.id)}>{other.name}</SelectItem>)}</Select>
              : <p className="text-body-2-regular text-pretty text-text-tertiary">Tidak ada kelompok dengan field yang sama persis.</p>}
          </div>;
          })() : <span />}
          <Button size="small" variant="secondary" leadingIcon={RiDeleteBinLine} disabled={busy} onClick={() => ask({
            title: `Hapus Pembacaan "${stream.name}"?`,
            description: `${stream.reading_count.toLocaleString("id-ID")} pembacaan dihapus permanen. Field dan pengaturan tampilan tetap ada.`,
            confirmLabel: "Hapus Pembacaan",
            destructive: true,
            run: () => void mutate(() => api(`${path}/readings/delete`, "ReadingsDeleted", { method: "POST", ...jsonBody({ stream_id: stream.id }) }), "Pembacaan Dihapus"),
          })}>Hapus Pembacaan</Button>
        </div>)}
      </div>
    </SectionCard>}

    <SectionCard icon={RiGroupLine} tone="emerald" title="Komunitas" action={<Chip variant="caption" color={status.color}>{status.label}</Chip>}
      description="Alat yang disetujui admin tampil publik di peta beserta nilai terakhirnya. Field yang disembunyikan tidak ikut dibagikan.">
      {device.community_note && <Notice tone={device.community_status === "rejected" ? "warning" : "info"} title="Catatan Admin">{device.community_note}</Notice>}
      {!shared && device.lat == null && <Notice tone="warning" title="Lokasi Diperlukan">Tentukan lokasi alat di bagian Umum sebelum mengajukan ke komunitas.</Notice>}
      <Button size="small" variant="secondary" leadingIcon={RiShareLine} className="self-start" disabled={busy || (!shared && device.lat == null)}
        onClick={() => void mutate(() => api(`${path}/share`, "DeviceOut", { method: "POST", ...jsonBody({ share: !shared }) }), shared ? "Alat Kembali Privat" : "Pengajuan Dikirim")}>
        {shared ? "Jadikan Privat" : "Ajukan Ke Komunitas"}
      </Button>
    </SectionCard>

    <SectionCard icon={RiDeleteBinLine} tone="pink" title="Hapus Alat" className="ring-1 ring-border-error-default"
      description="Alat, login MQTT-nya, dan seluruh pembacaannya dihapus permanen."
      action={<Button size="small" variant="danger" leadingIcon={RiDeleteBinLine} disabled={busy} onClick={() => ask({
        title: `Hapus "${device.name}"?`,
        description: "Alat, kunci, login MQTT, dan seluruh pembacaannya dihapus permanen. Tindakan ini tidak bisa dibatalkan.",
        confirmLabel: "Hapus Alat",
        destructive: true,
        run: () => void mutate(async () => { await request(path, { method: "DELETE", ...jsonBody({}) }); window.location.assign("/devices"); }),
      })}>Hapus Alat</Button>} />

    {dialog}
  </div>;
}
