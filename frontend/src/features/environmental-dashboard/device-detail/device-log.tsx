import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Chip } from "@/components/base/badges/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { api, type DTO } from "@/lib/api/client";
import { formatRelative } from "../device-api";
import { RiHistoryLine } from "@remixicon/react";
import { PanelUnavailable } from "../components/dashboard-card";
import { Notice, SectionCard } from "../components/device-ui";
import { PageFooter } from "@/components/application/data-table/data-table";
import { formatValue, useReadings } from "./readings";

const PAGE = 50;
const PER_PAGE = 10;
const MAX_LIMIT = 5000;   // the API's ?limit cap: one jump fetches at most this many rows
const ALL_HISTORY_HOURS = 24 * 90;

const versionName = (version: DTO<"StreamVersion">) => `v${version.version}.0`;

/** A labelled picker that is always on screen: with one option it stays visible but greyed out,
 *  and the hint says when a second option will appear. */
function Picker({ label, hint, single, selected, onSelect, children }: {
  label: string; hint: string; single: boolean; selected: string; onSelect: (key: string) => void; children: ReactNode;
}) {
  return <div className="flex min-w-0 flex-col gap-1.5">
    <span className="text-caption-1-medium text-text-secondary">{label}</span>
    <div className="max-w-full overflow-x-auto">
      <SegmentedControl aria-label={label} isDisabled={single} selectedKeys={new Set([selected])}
        onSelectionChange={keys => { const next = [...keys][0]; if (next !== undefined) onSelect(String(next)); }}>
        {children}
      </SegmentedControl>
    </div>
    {single && <p className="text-caption-1 text-text-tertiary">{hint}</p>}
  </div>;
}

const time = (iso?: string | null) => iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" }) : "-";

/** One table per "nama" the device sends (columns = every field it has had), newest first;
 *  a version picker narrows it to the fields of one sensor upgrade. The first page refreshes with the page. */
export function DeviceLog({ deviceId, streams, pollMs }: { deviceId: number; streams: DTO<"Stream">[]; pollMs?: number }) {
  const [streamId, setStreamId] = useState<number | undefined>(streams[0]?.id);
  const stream = streams.find(item => item.id === streamId) ?? streams[0];
  const [versionId, setVersionId] = useState<number>();
  // looked up in the current table only, so switching tables falls back to "all versions"
  const version = stream?.versions.find(item => item.id === versionId);
  const { data, error, loading } = useReadings(deviceId, { hours: ALL_HISTORY_HOURS, limit: PAGE, stream: stream?.id, version: version?.id }, pollMs);
  const [older, setOlder] = useState<DTO<"Reading">[]>([]);
  const [cursor, setCursor] = useState<number | null>();
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError, setPageError] = useState<string>();

  const [page, setPage] = useState(0);

  useEffect(() => { setOlder([]); setCursor(undefined); setPage(0); setPageError(undefined); }, [stream?.id, version?.id]);

  const firstPage = useMemo(() => data?.readings ?? [], [data]);
  const oldestFirst = firstPage.at(-1)?.id;
  const rows = useMemo(() => [...firstPage, ...older.filter(row => oldestFirst == null || (row.id ?? 0) < oldestFirst)], [firstPage, older, oldestFirst]);
  const next = cursor === undefined ? data?.next_before : cursor;
  const visible = rows.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  // the stored count sizes the pager; once the API has no older rows, what was loaded is the total
  const stored = (version ?? stream)?.reading_count ?? 0;
  const total = next ? Math.max(stored, rows.length) : rows.length;

  /** Opening a page loads the rows up to it, in one request from the oldest row already here. */
  async function openPage(target: number) {
    const need = (target + 1) * PER_PAGE - rows.length;
    if (need <= 0 || !next || !stream) { setPage(target); return; }
    setLoadingPage(true); setPageError(undefined);
    try {
      const limit = Math.min(MAX_LIMIT, Math.max(PAGE, need));
      const result = await api(`/me/devices/${deviceId}/readings?hours=${ALL_HISTORY_HOURS}&limit=${limit}&stream=${stream.id}${version ? `&version=${version.id}` : ""}&before=${next}`, "Readings");
      setOlder(current => [...current, ...result.readings]);
      setCursor(result.next_before ?? null);
      const loaded = rows.length + result.readings.length;
      setPage(Math.min(target, Math.max(0, Math.ceil(loaded / PER_PAGE) - 1)));
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : "Riwayat gagal dimuat.");
    } finally {
      setLoadingPage(false);
    }
  }

  if (!stream) return <PanelUnavailable title="Belum Ada Riwayat" description="Riwayat muncul setelah alat mengirim data pertama." />;
  const fields = version ? stream.fields.filter(field => version.keys.includes(field.key)) : stream.fields;
  const labels = new Map(stream.fields.map(field => [field.key, field.label]));
  const versionLabel = new Map(stream.versions.map(item => [item.id, versionName(item)]));
  const showVersion = !version && stream.versions.length > 1;
  const columns = fields.length + 3 + (showVersion ? 1 : 0);
  // the table keeps PER_PAGE rows of fixed height: skeletons while loading, blanks on a short last page
  const busy = loadingPage || (loading && !rows.length);
  const filler = busy ? 0 : rows.length > PER_PAGE ? PER_PAGE - visible.length : 0;
  const since = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { dateStyle: "medium" });
  const addedText = (item: DTO<"StreamVersion">) => {
    const names = item.added.map(key => labels.get(key) ?? key);
    return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  };

  return <SectionCard icon={RiHistoryLine} tone="sky" title="Riwayat Kiriman"
    description={`${stream.reading_count.toLocaleString("id-ID")} pembacaan, terakhir ${formatRelative(stream.last_seen_at)}. Waktu ukur diisi bila sensor mengirim waktu sendiri.`}
    action={!stream.confirmed && <Chip variant="caption" color="yellow">Kategori Belum Dipastikan</Chip>}>
    <div className="flex flex-col gap-3 rounded-2lg bg-background-supporting-default p-3">
      <Picker label="Tabel Data" single={streams.length < 2} selected={String(stream.id)} onSelect={key => setStreamId(Number(key))}
        hint='Tabel baru muncul otomatis bila alat mengirim "nama" lain.'>
        {streams.map(item => <SegmentedControlItem key={item.id} id={String(item.id)}>{`${item.name} · ${item.reading_count.toLocaleString("id-ID")}`}</SegmentedControlItem>)}
      </Picker>
      <Picker label="Versi" single={stream.versions.length < 2} selected={version ? String(version.id) : "all"}
        onSelect={key => setVersionId(key === "all" ? undefined : Number(key))}
        hint="Versi baru muncul otomatis bila alat mengirim field baru dengan nama yang sama.">
        {[<SegmentedControlItem key="all" id="all">Semua Data</SegmentedControlItem>,
          ...stream.versions.map(item => <SegmentedControlItem key={item.id} id={String(item.id)}>
            {`${versionLabel.get(item.id)} · ${item.version > 1 && item.added.length ? `+ ${addedText(item)}` : `${item.keys.length} Field`}`}
          </SegmentedControlItem>)]}
      </Picker>
      {version && <p className="text-caption-1 text-text-secondary">{`${versionLabel.get(version.id)} sejak ${since(version.first_seen)}: ${version.reading_count.toLocaleString("id-ID")} kiriman.`}</p>}
    </div>
    {error && <Notice tone="danger" title="Riwayat Gagal Dimuat">{error}</Notice>}
    <div className="overflow-x-auto rounded-2lg border border-border-button-default">
      <table className="w-full min-w-max text-left text-body-2-regular" aria-busy={busy}>
        <caption className="sr-only">Riwayat Kiriman {stream.name}</caption>
        <thead className="bg-background-supporting-default text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-medium">Waktu Ukur</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Diterima</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Protokol</th>
            {showVersion && <th scope="col" className="px-3 py-2.5 font-medium">Versi</th>}
            {fields.map(field => <th key={field.key} scope="col" className="px-3 py-2.5 font-medium" title={field.key}>{field.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-button-default bg-background-primary-default text-text-primary">
          {busy && Array.from({ length: PER_PAGE }, (_, index) => <tr key={`skeleton-${index}`} className="h-10" aria-hidden>
            {Array.from({ length: columns }, (_, cell) => <td key={cell} className="px-3 py-2"><Skeleton className="h-4 w-full min-w-12" /></td>)}
          </tr>)}
          {!busy && visible.map(row => <tr key={row.id ?? row.received_at} className="h-10 transition-colors duration-150 hover:bg-background-primary-hover">
            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{row.measured_at ? time(row.measured_at) : <span className="text-text-tertiary">-</span>}</td>
            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{time(row.received_at)}</td>
            <td className="px-3 py-2">{row.protocol ? <Chip variant="caption" color={row.protocol === "mqtt" ? "purple" : "blue"}>{row.protocol.toUpperCase()}</Chip> : <span className="text-text-tertiary">-</span>}</td>
            {showVersion && <td className="px-3 py-2 whitespace-nowrap tabular-nums">{row.version_id != null ? versionLabel.get(row.version_id) ?? "-" : "-"}</td>}
            {fields.map(field => <td key={field.key} className="max-w-60 truncate px-3 py-2 tabular-nums">{row.data && field.key in row.data ? formatValue(row.data[field.key]) : <span className="text-text-tertiary">-</span>}</td>)}
          </tr>)}
          {Array.from({ length: filler }, (_, index) => <tr key={`filler-${index}`} className="h-10" aria-hidden><td colSpan={columns} /></tr>)}
          {!busy && !rows.length && <tr><td colSpan={columns} className="px-3 py-6 text-center text-text-secondary">Belum ada kiriman dalam 90 hari terakhir.</td></tr>}
        </tbody>
      </table>
    </div>
    <p role="status" className="sr-only">{busy ? "Memuat riwayat kiriman" : ""}</p>
    {pageError && <Notice tone="danger" title="Halaman Gagal Dimuat">{pageError}</Notice>}
    <PageFooter page={page} size={PER_PAGE} total={total} onChange={page => { if (!loadingPage) void openPage(page); }} />
  </SectionCard>;
}
