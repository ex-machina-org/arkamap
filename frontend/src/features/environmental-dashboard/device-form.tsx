import { useEffect, useRef, useState, type FormEvent } from "react";
import { RiArrowLeftLine, RiArrowRightLine, RiCheckLine, RiCloseLine, RiCpuLine, RiCrosshair2Line, RiInformationLine, RiListUnordered, RiMap2Line, RiMapPin2Line } from "@remixicon/react";
import { toast } from "sonner";
import { Chip } from "@/components/base/badges/chip";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Select, SelectItem } from "@/components/base/select/select";
import { DEVICE_KIND_LABEL, type DeviceKindChoice, type DeviceOwnership } from "./device-data";
import { api, ApiError, jsonBody, type DTO } from "@/lib/api/client";
import { Map, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import { SESSION_CHANGED } from "@/hooks/use-session";
import { cx } from "@/utils/cx";
import { cardClass, insetClass } from "./components/dashboard-card";
import { DeviceConnect } from "./components/device-connect";
import { KIND_ICON } from "./components/device-helpers";
import { Notice, SectionCard } from "./components/device-ui";

export function LocationPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  const { map, isLoaded } = useMap();
  useEffect(() => { if (!map || !isLoaded) return; const pick = (event: { lngLat: { lat: number; lng: number } }) => onPick(event.lngLat.lat, event.lngLat.lng); map.on("click", pick); return () => { map.off("click", pick); }; }, [map, isLoaded, onPick]);
  return null;
}

/** "Lokasi Saat Ini" or a click on the map; both produce the {lat, lon} the backend maps to a regency. */
export function LocationField({ value, onChange, onError, regionName }: { value?: { lat: number; lon: number }; onChange: (value: { lat: number; lon: number } | undefined) => void; onError: (message: string) => void; regionName?: string | null }) {
  const [picking, setPicking] = useState(false);
  const [locating, setLocating] = useState(false);
  return <div className="flex flex-col gap-3">
    <div className={cx(insetClass, "flex flex-wrap items-center justify-between gap-3 p-3")}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", value ? "bg-status-lime-background text-status-lime-text" : "bg-background-tertiary-default text-text-tertiary")}>
          {value ? <RiCheckLine className="size-5" aria-hidden /> : <RiMapPin2Line className="size-5" aria-hidden />}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-body-medium text-text-primary">{value ? regionName ?? "Titik Lokasi Dipilih" : "Belum Ada Titik Lokasi"}</span>
          <span className="font-mono text-caption-1-regular text-text-secondary tabular-nums">{value ? `${value.lat.toFixed(5)}, ${value.lon.toFixed(5)}` : "Pilih dari lokasi browser atau peta"}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="small" leadingIcon={RiCrosshair2Line} disabled={locating} onClick={() => {
          setLocating(true);
          navigator.geolocation.getCurrentPosition(
            position => { setLocating(false); onChange({ lat: position.coords.latitude, lon: position.coords.longitude }); },
            () => { setLocating(false); onError("Lokasi browser tidak tersedia. Pilih titik di peta."); },
          );
        }}>{locating ? "Mencari Lokasi..." : "Lokasi Saat Ini"}</Button>
        <Button type="button" variant="secondary" size="small" leadingIcon={RiMap2Line} aria-pressed={picking} onClick={() => setPicking(open => !open)}>{picking ? "Tutup Peta" : "Pilih Di Peta"}</Button>
        {value && <Button type="button" variant="ghost" size="small" iconOnly leadingIcon={RiCloseLine} aria-label="Hapus Titik Lokasi" onClick={() => onChange(undefined)} />}
      </div>
    </div>
    {picking && <div className="relative h-72 overflow-hidden rounded-2lg">
      <Map center={value ? [value.lon, value.lat] : [118, -2.5]} zoom={value ? 10 : 4}>
        <LocationPick onPick={(lat, lon) => onChange({ lat, lon })} />
        {value && <MapMarker longitude={value.lon} latitude={value.lat}><MarkerContent><span className="block size-4 rounded-full border-2 border-background-primary-default bg-accent-500 shadow-card" /></MarkerContent></MapMarker>}
      </Map>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-background-primary-default px-3 py-1.5 text-caption-1-medium text-text-primary shadow-card">Klik Peta Untuk Menandai Lokasi Alat</span>
    </div>}
  </div>;
}

const STEPS = [
  { title: "Data Alat", description: "Nama, jenis, dan lokasi" },
  { title: "Hubungkan Alat", description: "Kunci API dan status koneksi" },
] as const;

/** Plain horizontal stepper; a finished step is a button back to it. */
export function Stepper({ active, onSelect }: { active: 0 | 1; onSelect?: (step: 0 | 1) => void }) {
  return <ol aria-label="Tahap Tambah Alat" className="flex items-center gap-3">
    {STEPS.map((step, index) => {
      const done = index < active;
      const current = index === active;
      const content = <>
        <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-body-medium tabular-nums transition-colors duration-150",
          done ? "bg-status-lime-background text-status-lime-text" : current ? "bg-accent-500 text-text-white" : "bg-background-tertiary-default text-text-secondary")}>
          {done ? <RiCheckLine className="size-4" aria-hidden /> : index + 1}
        </span>
        <span className="flex min-w-0 flex-col text-left">
          <span className={cx("text-body-medium", current || done ? "text-text-primary" : "text-text-secondary")}>{step.title}</span>
          <span className="hidden truncate text-caption-1-regular text-text-secondary sm:block">{step.description}</span>
        </span>
      </>;
      return <li key={step.title} aria-current={current ? "step" : undefined} className={cx("flex min-w-0 items-center gap-3", index < STEPS.length - 1 && "flex-1")}>
        {done && onSelect
          ? <button type="button" onClick={() => onSelect(index as 0 | 1)} className="-m-1.5 flex min-w-0 cursor-pointer items-center gap-3 rounded-2lg p-1.5 outline-none transition-colors duration-150 hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring">{content}</button>
          : <span className="flex min-w-0 items-center gap-3">{content}</span>}
        {index < STEPS.length - 1 && <span aria-hidden className={cx("h-0.5 min-w-6 flex-1 rounded-full", done ? "bg-status-lime-background" : "bg-background-tertiary-default")} />}
      </li>;
    })}
  </ol>;
}

/**
 * One control for the type: a dropdown of presets, and choosing "Lainnya"
 * turns the same slot into a text field instead of opening another one.
 */
function KindField({ kind, custom, onKind, onCustom }: { kind: DeviceKindChoice; custom: string; onKind: (kind: DeviceKindChoice) => void; onCustom: (value: string) => void }) {
  return <div className="flex flex-col gap-1.5">
    <span id="device-kind-label" className="text-body-medium text-text-primary">Jenis Alat</span>
    {kind === "other"
      ? <div className="flex items-start gap-2">
        <Input aria-labelledby="device-kind-label" name="customKind" value={custom} onChange={onCustom} autoFocus isRequired maxLength={50} validationBehavior="native"
          leadingIcon={KIND_ICON.other} placeholder="Ketik Jenis Alat, Contoh: Stasiun Cuaca" hint="Dipakai sebagai petunjuk saat server mengelompokkan data." className="min-w-0 flex-1" />
        <Button type="button" variant="secondary" iconOnly leadingIcon={RiListUnordered} aria-label="Pilih Dari Daftar Jenis" onClick={() => onKind("awlr")} />
      </div>
      : <Select aria-labelledby="device-kind-label" selectedKey={kind} className="w-full" popoverClassName="w-(--trigger-width)" onSelectionChange={key => { if (key === "other" || (key && key in DEVICE_KIND_LABEL)) onKind(key as DeviceKindChoice); }}>
        {[...Object.entries(DEVICE_KIND_LABEL), ["other", "Lainnya (Ketik Sendiri)"]].map(([id, label]) => {
          const ItemIcon = KIND_ICON[id as DeviceKindChoice];
          return <SelectItem key={id} id={id} textValue={label}><span className="flex items-center gap-2"><ItemIcon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />{label}</span></SelectItem>;
        })}
      </Select>}
  </div>;
}

type Draft = { name: string; kind: DeviceKindChoice; custom: string; externalId: string; ownership: DeviceOwnership; owner: string; location?: { lat: number; lon: number } };
const EMPTY: Draft = { name: "", kind: "awlr", custom: "", externalId: "", ownership: "byod", owner: "" };

/**
 * Two steps: describe the device, then connect it. Going back after the
 * device exists edits it: name, type hint and location go through PATCH,
 * while ID and owner are locked because the API cannot change them.
 */
export function DeviceForm() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [created, setCreated] = useState<DTO<"DeviceCreated">>();
  const [step, setStep] = useState<0 | 1>(0);
  const [error, setError] = useState<string>();
  const [idError, setIdError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const active = useRef<AbortController | null>(null);
  const set = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  useEffect(() => { const clear = () => { active.current?.abort(); setCreated(undefined); setStep(0); setSaving(false); }; window.addEventListener(SESSION_CHANGED, clear); window.addEventListener("arkamap-session-expired", clear); return () => { active.current?.abort(); window.removeEventListener(SESSION_CHANGED, clear); window.removeEventListener("arkamap-session-expired", clear); }; }, []);

  const category = draft.kind === "other" ? draft.custom.trim() : DEVICE_KIND_LABEL[draft.kind];
  const goTo = (next: 0 | 1) => { setStep(next); window.scrollTo(0, 0); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !category) { setError("Lengkapi nama dan jenis alat."); return; }
    setSaving(true); setError(undefined); setIdError(undefined);
    const controller = new AbortController(); active.current = controller;
    try {
      if (created) {
        const device = created.device;
        const moved = draft.location && (draft.location.lat !== device.lat || draft.location.lon !== device.lon);
        const updated = await api(`/me/devices/${device.id}`, "DeviceOut", { method: "PATCH", signal: controller.signal, ...jsonBody({
          name: draft.name.trim() !== device.name ? draft.name.trim() : undefined,
          category: category !== device.category ? category : undefined,
          location: moved ? draft.location : undefined,
        }) });
        if (controller.signal.aborted) return;
        setCreated({ ...created, device: updated });
        toast.success("Data Alat Diperbarui");
      } else {
        const result = await api("/me/devices", "DeviceCreated", { method: "POST", signal: controller.signal, ...jsonBody({
          name: draft.name.trim(), category, location: draft.location,
          metadata: { external_id: draft.externalId.trim() || undefined, kind: draft.kind === "other" ? undefined : draft.kind, ownership: draft.ownership, owner: draft.owner.trim() || undefined },
        }) });
        if (controller.signal.aborted) return;
        setCreated(result);
      }
      setSaving(false);
      goTo(1);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 409) setIdError("ID ini sudah dipakai alat lain di akun Anda.");
      else setError(cause instanceof Error ? cause.message : "Perangkat belum tersimpan.");
      toast.error("Perangkat Belum Tersimpan");
      setSaving(false);
    }
  }

  if (created && step === 1) return <div className="flex w-full min-w-0 flex-col gap-5">
    <Button variant="secondary" size="small" leadingIcon={RiArrowLeftLine} className="self-start" onClick={() => goTo(0)}>Kembali Ke Data Alat</Button>
    <Stepper active={1} onSelect={goTo} />
    <DeviceConnect created={created} />
  </div>;

  const locked = Boolean(created);
  const savedPoint = created && draft.location?.lat === created.device.lat && draft.location?.lon === created.device.lon;
  return <form onSubmit={submit} className="flex w-full min-w-0 flex-col gap-5">
    <Stepper active={0} />
    {created && <Notice tone="info" title="Mengubah Alat Yang Sudah Dibuat">Kunci API tidak berubah. ID, kepemilikan, dan pemilik tidak bisa diubah lagi.</Notice>}

    <SectionCard icon={RiCpuLine} tone="blue" title="Identitas Alat" description="Nama dan jenis membantu Anda mengenali alat. Field data dikenali otomatis dari kiriman sensor.">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Input label="Nama Alat" name="name" value={draft.name} onChange={name => set({ name })} placeholder="Contoh: Sensor Sawah 1" isRequired maxLength={100} validationBehavior="native" />
        <KindField kind={draft.kind} custom={draft.custom} onKind={kind => set({ kind })} onCustom={custom => set({ custom })} />
      </div>
    </SectionCard>

    <SectionCard icon={RiMapPin2Line} tone="emerald" title="Lokasi Pemasangan" action={<Chip variant="caption" color="neutral">Opsional</Chip>}
      description="Tanpa titik lokasi, alat tidak bisa dibagikan ke komunitas dan tidak mendapat pembanding data wilayah. Nama wilayah ditentukan server dari titik ini.">
      <LocationField value={draft.location} onChange={location => set({ location })} onError={setError} regionName={savedPoint ? created?.device.region_name : undefined} />
    </SectionCard>

    <SectionCard icon={RiInformationLine} tone="purple" title="Info Tambahan" action={<Chip variant="caption" color="neutral">Opsional</Chip>}
      description="ID, kepemilikan, dan pemilik untuk pencatatan. Tidak bisa diubah setelah alat dibuat.">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Input label="ID Atau Nomor Seri" name="id" value={draft.externalId} onChange={externalId => { set({ externalId }); setIdError(undefined); }} isDisabled={locked}
          placeholder="Contoh: ESP32-A1" hint={idError ?? "Unik untuk setiap alat di akun Anda."} isInvalid={Boolean(idError)} maxLength={100} />
        <div className="flex flex-col gap-1.5">
          <span className="text-body-medium text-text-primary">Kepemilikan</span>
          <SegmentedControl aria-label="Kepemilikan" className="self-start" isDisabled={locked} selectedKeys={new Set([draft.ownership])} onSelectionChange={keys => { const next = [...keys][0]; if (next === "byod" || next === "institution") set({ ownership: next }); }}>
            <SegmentedControlItem id="byod">Milik Sendiri (BYOD)</SegmentedControlItem>
            <SegmentedControlItem id="institution">Instansi</SegmentedControlItem>
          </SegmentedControl>
        </div>
        <Input label="Nama Pemilik" name="owner" value={draft.owner} onChange={owner => set({ owner })} isDisabled={locked} placeholder="Nama Instansi, Komunitas, Atau Mitra" maxLength={160} className="sm:col-span-2" />
      </div>
    </SectionCard>

    {error && <Notice tone="danger" title="Alat Belum Tersimpan">{error}</Notice>}
    <div className={cx(cardClass, "flex-row flex-wrap items-center justify-between gap-4")}>
      <p className="max-w-md text-body-2-regular text-pretty text-text-secondary">{created ? "Perubahan disimpan ke alat yang sama, lalu Anda kembali ke langkah Hubungkan Alat." : "Setelah disimpan, Anda mendapat kunci API dan contoh kode untuk menghubungkan alat."}</p>
      <div className="flex items-center gap-2">
        {created
          ? <Button type="button" variant="secondary" onClick={() => goTo(1)}>Batal Mengubah</Button>
          : <ButtonLink href="/devices" variant="secondary" leadingIcon={RiArrowLeftLine}>Batal</ButtonLink>}
        <Button type="submit" trailingIcon={RiArrowRightLine} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Dan Lanjutkan"}</Button>
      </div>
    </div>
  </form>;
}
