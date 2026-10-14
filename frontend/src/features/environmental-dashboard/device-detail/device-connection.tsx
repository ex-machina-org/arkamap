import { useEffect, useState } from "react";
import { RiArrowDownSLine, RiKey2Line, RiQuestionLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, jsonBody, type DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import { formatRelative } from "../device-api";
import { insetClass } from "../components/dashboard-card";
import { DeviceKeyModal } from "../components/device-key-modal";
import { DeviceQuickstart } from "../components/device-quickstart";
import { useConfirm } from "../components/device-helpers";
import { Fact, Notice, SectionCard } from "../components/device-ui";

/** Mirrors MAX_NAMES in backend/app/iot/ingest.py: past it the server rejects a new "nama". */
export const MAX_NAMES = 10;

export function DeviceConnection({ device, streams, onChanged }: { device: DTO<"DeviceOut">; streams: DTO<"Stream">[]; onChanged: () => void }) {
  const path = `/me/devices/${device.id}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [quickstart, setQuickstart] = useState<DTO<"Quickstart">>();
  const [rotated, setRotated] = useState<DTO<"KeyRotated">>();
  const [help, setHelp] = useState(false);
  const { ask, dialog } = useConfirm();
  const failing = newer(device.last_error_at, device.last_seen_at);

  useEffect(() => {
    const controller = new AbortController();
    api(`${path}/quickstart`, "Quickstart", { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setQuickstart(value); }).catch(() => undefined);
    return () => controller.abort();
  }, [path]);

  async function rotate() {
    setBusy(true); setError(undefined);
    try { setRotated(await api(`${path}/key`, "KeyRotated", { method: "POST", ...jsonBody({}) })); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Kunci gagal diganti."); }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-4">
    {error && <Notice tone="danger" title="Kunci Gagal Diganti">{error}</Notice>}

    <SectionCard icon={RiKey2Line} tone="orange" title="API Key"
      description="Kunci asli hanya ditampilkan sekali. Ganti <API_KEY> di contoh kode dengan kunci Anda."
      action={<div className="flex flex-wrap items-center gap-2">
        <Button size="small" variant="secondary" leadingIcon={RiQuestionLine} onClick={() => setHelp(true)}>
          Ada Masalah?{failing && <span className="size-2 rounded-full bg-status-rose-text" aria-label="Kiriman terakhir ditolak" />}
        </Button>
        <Button size="small" variant="secondary" leadingIcon={RiKey2Line} disabled={busy} onClick={() => ask({
          title: "Ganti Kunci API?",
          description: "Kunci lama langsung tidak berlaku, termasuk untuk login MQTT. Alat berhenti mengirim data sampai kunci baru dipasang.",
          confirmLabel: "Ganti Kunci",
          run: () => void rotate(),
        })}>Ganti Kunci</Button>
      </div>}>
      <dl className={cx(insetClass, "grid gap-4 p-4 sm:grid-cols-2")}>
        <Fact label="Awalan Kunci"><span className="font-mono">{device.key_prefix}</span></Fact>
        <Fact label={`Nama Data (${streams.length}/${MAX_NAMES})`}>
          {streams.length ? <span className="flex flex-wrap gap-1.5">
            {streams.map(stream => <Chip key={stream.id} variant="caption" color="gray"><span className="font-mono">{stream.slug}</span></Chip>)}
          </span> : <span className="text-text-tertiary">Belum ada kiriman</span>}
        </Fact>
      </dl>
      {streams.length >= MAX_NAMES && <Notice tone="danger" title="Batas Nama Tercapai">Nama baru akan ditolak. Gabungkan nama di Pengaturan.</Notice>}
      {quickstart ? <DeviceQuickstart quickstart={quickstart} /> : <p className="text-body-2-regular text-text-secondary">Memuat contoh kode...</p>}
    </SectionCard>

    {dialog}
    {rotated && <DeviceKeyModal value={rotated} onClose={() => setRotated(undefined)} />}
    <TroubleshootingDialog device={device} failing={failing} open={help} onOpenChange={setHelp} />
  </div>;
}

type Problem = { code: string; title: string; message: string; fix: string; match: readonly string[] };

/** Replies from /api/ingest and the mistakes behind them. `message` and `match` follow
 *  the Rejected texts in backend/app/iot/ingest.py, so the device's last error finds its row. */
const PROBLEM_GROUPS: { title: string; items: Problem[] }[] = [
  { title: "Ditolak Server", items: [
    { code: "401", title: "API key tidak valid", message: "API key perangkat tidak valid atau sudah dicabut",
      fix: "Kunci salah ketik atau sudah diganti. Pasang kunci terbaru; bila lupa, tekan Ganti Kunci.", match: ["API key"] },
    { code: "400", title: "Format kiriman salah", message: 'payload bukan JSON · isi sensor harus dibungkus "data"',
      fix: "Samakan dengan template di Contoh Implementasi: nama, waktu, dan data. Cek tanda kutip dan koma JSON.", match: ["bukan JSON", "dibungkus", "data kosong", "wajib diisi"] },
    { code: "400", title: "Waktu salah", message: '"waktu" ada di masa depan; cek jam perangkat',
      fix: 'Jam alat belum tersinkron. Di ESP32 panggil configTime(7 * 3600, 0, "pool.ntp.org") setelah WiFi tersambung.', match: ['"waktu"'] },
    { code: "400", title: "Melebihi batas nama", message: `maksimal ${MAX_NAMES} "nama" per perangkat`,
      fix: "Gabungkan nama yang salah ketik di Pengaturan → Kelompok Data, atau pakai nama yang sudah ada.", match: ["per perangkat; pakai nama"] },
    { code: "400", title: "Kiriman terlalu besar", message: "payload lebih dari 16384 byte · lebih dari 100 field",
      fix: "Kirim ringkasan, bukan data mentah. Pecah ke beberapa nama bila memang berbeda jenis.", match: ["byte", "field", "NaN"] },
    { code: "429", title: "Terlalu cepat", message: "terlalu cepat; maksimal 1 kiriman per 1 detik per perangkat",
      fix: "Beri jeda minimal 1 detik, misalnya delay(1000) di loop.", match: ["terlalu cepat"] },
  ] },
  { title: "Diterima Tapi Belum Sesuai", items: [
    { code: "202", title: "Data tidak muncul", message: '"duplicate": true',
      fix: "Kiriman yang sama persis dengan waktu sama dihitung sekali. Cek juga field tersembunyi di Pengaturan dan rentang waktu di Ringkasan.", match: [] },
    { code: "202", title: "Diterima dengan peringatan", message: '"nama" kosong · "waktu" kosong',
      fix: "Tambahkan nama dan waktu di setiap kiriman agar data masuk ke tabel yang benar dengan waktu ukur sensor.", match: ['" kosong'] },
    { code: "MQTT", title: "Tidak ada balasan", message: "(MQTT tidak membalas pesan yang salah)",
      fix: "Uji payload yang sama lewat HTTP dengan ?dry_run=true untuk melihat pesan kesalahannya.", match: [] },
  ] },
];

const newer = (a?: string | null, b?: string | null) => !!a && (!b || Date.parse(a) > Date.parse(b));
const CODE_COLOR = { "202": "lime", MQTT: "purple", "429": "yellow" } as const;

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" }) {
  return <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-caption-1-regular text-text-secondary">{label}</dt>
    <dd className={cx("truncate text-body-medium tabular-nums", tone === "danger" ? "text-status-rose-text" : tone === "warning" ? "text-status-yellow-text" : "text-text-primary")}>{value}</dd>
  </div>;
}

/** Device health first, then every known reply; the one matching the latest error opens by itself. */
function TroubleshootingDialog({ device, failing, open, onOpenChange }: { device: DTO<"DeviceOut">; failing: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const latest = failing ? device.last_error : newer(device.last_warning_at, device.last_seen_at) || newer(device.last_warning_at, device.last_error_at) ? device.last_warning : undefined;
  const isMatch = (problem: Problem) => !!latest && problem.match.some(text => latest.includes(text));
  const rejected = device.rejected_count ?? 0;
  const warned = device.warning_count ?? 0;
  const count = (value: number) => value.toLocaleString("id-ID");

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[85dvh] flex-col gap-5 overflow-auto sm:max-w-2xl">
    <DialogHeader className="mb-0">
      <DialogTitle>Jika Ada Masalah</DialogTitle>
      <DialogDescription>Lihat status alat, lalu cocokkan kode balasan di Serial Monitor atau terminal dengan daftar di bawah.</DialogDescription>
    </DialogHeader>

    <section aria-label="Status Alat" className="flex flex-col gap-3">
      <dl className={cx(insetClass, "grid grid-cols-2 gap-4 p-4 sm:grid-cols-4")}>
        <Stat label="Kiriman Terakhir" value={device.last_seen_at ? formatRelative(device.last_seen_at) : "Belum ada"} />
        <Stat label="Ditolak" value={count(rejected)} tone={rejected ? "danger" : undefined} />
        <Stat label="Peringatan" value={count(warned)} tone={warned ? "warning" : undefined} />
        <Stat label="Kiriman Ulang" value={count(device.dup_count ?? 0)} />
      </dl>
      {device.last_error && <Notice tone={failing ? "danger" : "info"}
        title={failing ? `Kiriman Terakhir Ditolak · ${formatRelative(device.last_error_at)}` : `Terakhir Ditolak ${formatRelative(device.last_error_at)}, Sesudahnya Berhasil`}>
        <span className="font-mono">{device.last_error}</span>
      </Notice>}
      {device.last_warning && newer(device.last_warning_at, device.last_error_at) && <Notice tone="warning" title={`Peringatan Terakhir · ${formatRelative(device.last_warning_at)}`}>
        <span className="font-mono">{device.last_warning}</span>
      </Notice>}
      {!device.last_error && !device.last_warning && <Notice tone="success" title={device.last_seen_at ? "Belum Ada Kiriman Bermasalah" : "Belum Ada Kiriman"}>
        {device.last_seen_at ? "Semua kiriman sejauh ini diterima server." : "Kirim data pertama, lalu buka lagi jendela ini bila gagal."}
      </Notice>}
    </section>

    {PROBLEM_GROUPS.map(group => <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
      <h3 className="text-caption-1-medium text-text-secondary">{group.title}</h3>
      <div className="divide-y divide-border-button-default overflow-hidden rounded-2lg ring-1 ring-border-button-default ring-inset">
        {group.items.map(problem => {
          const matched = isMatch(problem);
          return <details key={problem.title} open={matched || undefined} className={cx("group", matched && "bg-background-supporting-default")}>
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-background-primary-hover [&::-webkit-details-marker]:hidden">
              <Chip variant="caption" color={CODE_COLOR[problem.code as keyof typeof CODE_COLOR] ?? "rose"} className="w-12 justify-center font-mono">{problem.code}</Chip>
              <span className="min-w-0 flex-1 text-body-2-medium text-text-primary">{problem.title}</span>
              {matched && <Chip variant="caption" color="rose">Terjadi Terakhir</Chip>}
              <RiArrowDownSLine className="size-4 shrink-0 text-text-tertiary transition-transform duration-150 group-open:rotate-180" aria-hidden />
            </summary>
            <dl className="grid gap-2 px-3 pb-3 pl-18 text-body-2-regular">
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption-1-regular text-text-tertiary">Balasan Server</dt>
                <dd className="font-mono text-caption-1-regular break-words text-text-primary">{problem.message}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption-1-regular text-text-tertiary">Solusi</dt>
                <dd className="text-pretty text-text-secondary">{problem.fix}</dd>
              </div>
            </dl>
          </details>;
        })}
      </div>
    </section>)}
  </DialogContent></Dialog>;
}

const dismissedKey = (deviceId: number) => `arkamap:dismissed-names:${deviceId}`;

function readDismissed(deviceId: number): number[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(dismissedKey(deviceId)) ?? "[]"); return Array.isArray(value) ? value.filter(Number.isInteger) : []; }
  catch { return []; }
}

/** A reminder per "nama" after the first: usually a typo of the main one. Dismissing only hides it, in this browser. */
export function NameWarnings({ deviceId, streams }: { deviceId: number; streams: DTO<"Stream">[] }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(deviceId));
  const [main, ...extra] = streams;
  const shown = extra.filter(stream => !dismissed.includes(stream.id));
  if (!main || !shown.length) return null;

  const dismiss = (id: number) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(dismissedKey(deviceId), JSON.stringify(next)); } catch { /* still hidden for this visit */ }
  };
  const mainKeys = new Set(main.fields.map(field => field.key));

  return <div className="flex flex-col gap-2">
    {shown.map(stream => {
      const sameFields = stream.fields.length === mainKeys.size && stream.fields.every(field => mainKeys.has(field.key));
      return <Notice key={stream.id} tone="warning" title={`Nama Baru Terdeteksi: "${stream.slug}"`} onClose={() => dismiss(stream.id)}>
        {`Alat ini juga mengirim nama "${stream.slug}" selain "${main.slug}". `}
        {sameFields ? "Field-nya sama, kemungkinan salah ketik; gabungkan di Pengaturan → Kelompok Data." : "Field-nya berbeda, jadi tidak bisa digabung. Bila memang data lain, abaikan peringatan ini."}
      </Notice>;
    })}
  </div>;
}
