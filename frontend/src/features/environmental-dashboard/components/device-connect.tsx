import { useEffect, useState } from "react";
import { RiArrowRightLine, RiCheckLine, RiCodeSSlashLine, RiKey2Line, RiLoader4Line, RiPulseLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { ButtonLink } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { apiList, type DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import { formatRelative, useDevice } from "../device-api";
import { insetClass } from "./dashboard-card";
import { DeviceQuickstart } from "./device-quickstart";
import { Fact, Notice, SecretField, SectionCard } from "./device-ui";

type Phase = "waiting" | "rejected" | "received" | "ready";

function phaseOf(device: DTO<"DeviceOut">): Phase {
  const seen = device.last_seen_at ? Date.parse(device.last_seen_at) : 0;
  const failed = device.last_error_at ? Date.parse(device.last_error_at) : 0;
  if (failed > seen) return "rejected";
  if (!seen) return "waiting";
  return device.layout_by && device.layout?.length ? "ready" : "received";
}

type MilestoneState = "done" | "current" | "pending" | "failed";

function Milestone({ state, title, description, last }: { state: MilestoneState; title: string; description: string; last?: boolean }) {
  return <li className="relative flex gap-3 pb-5 last:pb-0">
    {!last && <span aria-hidden className={cx("absolute top-8 bottom-0 left-[15px] w-0.5 rounded-full", state === "done" ? "bg-status-lime-background" : "bg-background-tertiary-default")} />}
    <span className={cx("relative grid size-8 shrink-0 place-items-center rounded-full",
      state === "done" ? "bg-status-lime-background text-status-lime-text"
        : state === "failed" ? "bg-status-rose-background text-status-rose-text"
          : state === "current" ? "bg-status-blue-background text-status-blue-text" : "bg-background-tertiary-default text-text-tertiary")}>
      {state === "done" ? <RiCheckLine className="size-4" aria-hidden />
        : state === "current" ? <RiLoader4Line className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          : <span className="size-2 rounded-full bg-current" aria-hidden />}
    </span>
    <div className="flex min-w-0 flex-col gap-0.5 pt-1">
      <span className={cx("text-body-medium", state === "pending" ? "text-text-secondary" : "text-text-primary")}>{title}</span>
      <span className="text-body-2-regular text-pretty text-text-secondary">{description}</span>
    </div>
  </li>;
}

const POLL_MS = 5000;

/**
 * Second step of adding a device: keep the key, install the code, then wait
 * until the backend actually receives a reading. "Ready" means data arrived
 * and the AI layout exists; the browser cannot send a test message itself
 * because the web proxy does not forward /ingest.
 */
export function DeviceConnect({ created }: { created: DTO<"DeviceCreated"> }) {
  const id = created.device.id;
  const [saved, setSaved] = useState(false);
  const { device = created.device, error, updatedAt } = useDevice(id, POLL_MS);
  const [fields, setFields] = useState<string[]>([]);
  const phase = phaseOf(device);
  const seen = device.last_seen_at;

  useEffect(() => {
    if (saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved]);

  useEffect(() => {
    if (!seen) return;
    const controller = new AbortController();
    apiList(`/me/devices/${id}/streams`, "Stream", { signal: controller.signal })
      .then(streams => { if (!controller.signal.aborted) setFields([...new Set(streams.flatMap(stream => stream.fields.map(field => field.label)))]); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [id, seen]);

  const received: MilestoneState = phase === "rejected" ? "failed" : phase === "waiting" ? "current" : "done";
  const laidOut: MilestoneState = phase === "ready" ? "done" : phase === "received" ? "current" : "pending";

  return <div className="flex w-full min-w-0 flex-col gap-4">
    <SectionCard icon={RiKey2Line} tone="orange" title="Simpan Kunci API" action={saved ? <Chip variant="caption" color="lime">Tersimpan</Chip> : <Chip variant="caption" color="yellow">Hanya Tampil Sekali</Chip>}
      description="Kunci ini dipakai alat untuk mengirim data. Server hanya menyimpan versi tersandinya, jadi kunci yang hilang harus diganti.">
      <SecretField label="Kunci API" value={created.api_key} />
      <Checkbox isSelected={saved} onChange={setSaved}>Saya sudah menyimpan kunci</Checkbox>
    </SectionCard>

    <SectionCard icon={RiCodeSSlashLine} tone="blue" title="Pasang Kode Pada Alat"
      description="Contoh berikut sudah berisi alamat server, topik, dan kunci alat ini. Isi data bebas, mengikuti sensor Anda.">
      <DeviceQuickstart quickstart={created.quickstart} />
    </SectionCard>

    <SectionCard icon={RiPulseLine} tone="emerald" title="Status Koneksi"
      action={<Chip variant="caption" color={phase === "ready" ? "lime" : phase === "rejected" ? "rose" : phase === "received" ? "yellow" : "neutral"}>
        {phase === "ready" ? "Siap Digunakan" : phase === "rejected" ? "Ditolak" : phase === "received" ? "Data Diterima" : "Menunggu Data"}
      </Chip>}
      description="Halaman ini memeriksa server setiap 5 detik. Nyalakan alat setelah kode terpasang.">
      <ol aria-live="polite" className={cx(insetClass, "flex flex-col p-4")}>
        <Milestone state={saved ? "done" : "current"} title="Kunci Disimpan" description={saved ? "Kunci sudah Anda konfirmasi tersimpan." : "Centang konfirmasi pada bagian Simpan Kunci API."} />
        <Milestone state={received} title="Data Pertama Diterima"
          description={phase === "rejected" ? "Server menolak kiriman terakhir. Lihat alasannya di bawah." : seen ? `Kiriman terakhir ${formatRelative(seen)}.` : "Menunggu kiriman pertama dari alat."} />
        <Milestone last state={laidOut} title="Tampilan Disiapkan" description={phase === "ready" ? "Grafik dan widget sudah ditata dari field yang dikirim." : "Server menata field baru menjadi widget, biasanya beberapa detik."} />
      </ol>
      {phase === "rejected" && <Notice tone="danger" title="Kiriman Ditolak Server">{device.last_error ?? "Alasan tidak diketahui."} Perbaiki format atau kunci, lalu kirim ulang.</Notice>}
      {phase === "ready" && <Notice tone="success" title="Alat Siap Digunakan">Buka detail alat untuk melihat grafik, riwayat kiriman, dan pengaturan.</Notice>}
      {error && <Notice tone="warning" title="Status Belum Bisa Diperiksa">{error}</Notice>}
      {(fields.length > 0 || device.region_name) && <dl className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {fields.length > 0 && <Fact label="Field Terbaca"><span className="flex flex-wrap gap-1.5 whitespace-normal">{fields.map(field => <Chip key={field} variant="caption" color="gray">{field}</Chip>)}</span></Fact>}
        {device.region_name && <Fact label="Wilayah">{device.region_name}</Fact>}
      </dl>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-button-default pt-4">
        <p className="max-w-md text-body-2-regular text-pretty text-text-secondary">
          {saved ? "Anda boleh menutup halaman ini; status tetap bisa dipantau di detail alat." : "Centang konfirmasi kunci sebelum meninggalkan halaman ini."}
          {updatedAt ? ` Diperiksa ${new Date(updatedAt).toLocaleTimeString("id-ID")}.` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/devices" variant="secondary" aria-disabled={!saved || undefined}>Ke Daftar Alat</ButtonLink>
          <ButtonLink href={`/devices/${id}`} trailingIcon={RiArrowRightLine} aria-disabled={!saved || undefined}>Lihat Detail Alat</ButtonLink>
        </div>
      </div>
    </SectionCard>
  </div>;
}
