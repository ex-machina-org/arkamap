"use client";

import { RiLoginBoxLine } from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/utils/cx";
import type { Priority } from "./decision";
import type { RankEntry, Situation } from "./situation";
import { KodamaMark } from "@/components/foundations/brand/kodama-icon";

// Same recipe as the dashboard cards (environmental-dashboard/components/dashboard-card.tsx), which this feature may not import.
const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl bg-background-secondary-default p-4";
const INSET = "rounded-2lg bg-background-inner-default shadow-card";

function scoreChip(score: number | null) {
  if (score == null) return <Chip variant="caption" color="soft">Belum ada data</Chip>;
  const color = score >= 75 ? "rose" : score >= 50 ? "yellow" : "soft";
  return <Chip variant="bold" color={color} className="tabular-nums">{new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(score)}</Chip>;
}

function RankRow({ entry, index, selected, onSelect }: { entry: RankEntry; index: number; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cx(
          INSET,
          "button-press-motion flex w-full items-center gap-3 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          selected && "ring-2 ring-border-focus-ring",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-body-medium tabular-nums text-text-primary">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-body-medium text-text-primary">{entry.name}</span>
            {entry.isYou && <Chip variant="caption" color="lime">Wilayah Anda</Chip>}
          </span>
          {entry.details.length > 0 && (
            <span className="block truncate text-body-2-regular text-text-secondary" title={entry.details.map((detail) => `${detail.label}: ${detail.value}`).join(" · ")}>
              {entry.details[0].label}: {entry.details[0].short}
            </span>
          )}
        </span>
        {scoreChip(entry.score)}
      </button>
    </li>
  );
}

const PRIORITY_LABEL = { siaga: "Siaga", waspada: "Waspada" } as const satisfies Record<Priority["level"], string>;
const integer = new Intl.NumberFormat("id-ID");

function PriorityRow({ priority, selected, onSelect }: { priority: Priority; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cx(
          INSET,
          "button-press-motion flex w-full flex-col gap-1.5 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          selected && "ring-2 ring-border-focus-ring",
        )}
      >
        <span className="flex items-center gap-2">
          <Chip variant="bold" color={priority.level === "siaga" ? "rose" : "yellow"}>{PRIORITY_LABEL[priority.level]}</Chip>
          <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{priority.name}</span>
          {priority.population != null && <span className="shrink-0 text-body-2-regular tabular-nums text-text-secondary">{integer.format(priority.population)} jiwa</span>}
        </span>
        <ul className="list-disc space-y-0.5 pl-4 text-body-2-regular text-text-secondary">
          {priority.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        {priority.advice.length > 0 && (
          <span className="block rounded-lg bg-background-secondary-default px-2.5 py-2 text-body-2-regular text-text-primary">
            <span className="text-body-2-medium">Saran: </span>{priority.advice[0]}
          </span>
        )}
      </button>
    </li>
  );
}

function PriorityCard({ summary, loading, selectedRegionId, onSelect }: {
  summary: Situation["priorities"];
  loading: boolean;
  selectedRegionId: string | null;
  onSelect: (priority: Priority) => void;
}) {
  if (!summary) return loading ? <Skeleton className="h-40 rounded-2xl" /> : null;
  return (
    <section aria-labelledby="priority-title" className={CARD}>
      <header className="flex flex-col gap-0.5">
        <h3 id="priority-title" className="text-title-3-medium text-text-primary">Prioritas tindakan</h3>
        <p className="text-body-2-regular text-text-secondary">
          {summary.total > 0 ? `${summary.total} wilayah melewati ambang asap atau api, urut menurut tingkat, lalu seberapa jauh melewati ambang.` : "Tidak ada wilayah yang melewati ambang asap atau api saat ini."}
        </p>
      </header>
      {summary.items.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {summary.items.map((priority) => (
            <PriorityRow key={priority.regionId} priority={priority} selected={priority.regionId === selectedRegionId} onSelect={() => onSelect(priority)} />
          ))}
        </ol>
      )}
      {summary.total > summary.items.length && (
        <p className="text-body-2-regular text-text-secondary">Dan {summary.total - summary.items.length} wilayah lain di bawahnya.</p>
      )}
      <p className="text-body-2-regular text-text-tertiary">
        Kategori asap memakai ambang ISPU (Permen LHK 14/2020) pada PM2.5 hasil model, bukan pengukuran stasiun. Ambang titik panas adalah ambang kerja yang belum dikalibrasi. Jumlah penduduk adalah penduduk seluruh wilayah.
      </p>
    </section>
  );
}

function SituationSkeleton() {
  return (
    <div role="status" aria-label="Memuat ringkasan wilayah" className="space-y-3">
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

export function SituationPanel({
  situation,
  loading,
  error,
  selectedRegionId,
  onSelectRegion,
  onSelectPriority,
  onAsk,
}: {
  situation: Situation | null;
  loading: boolean;
  error?: string;
  selectedRegionId: string | null;
  onSelectRegion: (entry: RankEntry) => void;
  onSelectPriority: (priority: Priority) => void;
  onAsk: (question: string) => void;
}) {
  if (!situation) {
    if (error) return <p role="alert" className="rounded-2lg bg-status-rose-background px-3 py-2 text-body-2-medium text-status-rose-text">{error}</p>;
    return loading ? <SituationSkeleton /> : null;
  }
  const { rank } = situation;
  const top = rank?.entries[0];
  const lens = [situation.fieldLabel, situation.modeTitle].filter(Boolean).join(" · ").toLowerCase();
  const question = top
    ? `Kenapa ${top.name} paling perlu perhatian${lens ? ` untuk ${lens}` : ""} di ${situation.scopeName} saat ini, dan apa yang perlu dicek lebih dulu?`
    : `Apa yang paling perlu diperhatikan di ${situation.scopeName} saat ini?`;

  return (
    <div className="space-y-3">
      <header className="space-y-1.5 px-1">
        <h2 className="text-title-3-medium text-text-primary">{situation.scopeName}</h2>
        {situation.signedIn && situation.fieldLabel ? (
          <div className="flex flex-wrap items-center gap-1.5" title={situation.modeDescription ?? undefined}>
            <Chip variant="caption" color="soft">{situation.fieldLabel}</Chip>
            {situation.modeTitle && <Chip variant="caption" color="lime">{situation.modeTitle}</Chip>}
          </div>
        ) : (
          <p className="text-body-2-regular text-text-secondary">Pantauan umum seluruh Indonesia.</p>
        )}
      </header>

      {situation.tiles.length > 0 && (
        <section aria-label="Ringkasan" className={CARD}>
          <ul className="grid grid-cols-2 gap-2">
            {situation.tiles.map((tile, index) => (
              <li key={tile.label} className={cx(INSET, "min-w-0 p-3", index === 0 && "col-span-2")}>
                <p className="truncate text-body-2-regular text-text-secondary">{tile.label}</p>
                <p className={cx("mt-0.5 truncate tabular-nums text-text-primary", index === 0 ? "text-title-2-medium" : "text-title-3-medium")}>{tile.value}</p>
                <p className="mt-1 flex items-center gap-1.5 truncate text-body-2-regular text-text-tertiary">
                  {tile.tone && tile.tone !== "neutral" && <span aria-hidden className={cx("size-2 shrink-0 rounded-full", tile.tone === "rose" ? "bg-status-rose-text" : "bg-status-yellow-text")} />}
                  <span className="truncate">{tile.caption}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PriorityCard summary={situation.priorities} loading={situation.prioritiesLoading} selectedRegionId={selectedRegionId} onSelect={onSelectPriority} />

      {rank && (
        <section aria-labelledby="rank-title" className={CARD}>
          <header className="flex flex-col gap-0.5">
            <h3 id="rank-title" className="text-title-3-medium text-text-primary">Wilayah perlu perhatian</h3>
            <p className="text-body-2-regular text-text-secondary">
              {rank.of} {rank.scopeLabel}, diurut menurut {rank.metricLabel.toLowerCase()}
            </p>
          </header>
          <ol className="flex flex-col gap-1.5">
            {rank.entries.map((entry, index) => (
              <RankRow key={entry.regionId} entry={entry} index={index} selected={entry.regionId === selectedRegionId} onSelect={() => onSelectRegion(entry)} />
            ))}
          </ol>
          <p className="text-body-2-regular text-text-tertiary">
            Skor 0 sampai 100, makin tinggi makin perlu perhatian.{rank.modelled ? " Indeks turunan model, bukan peringatan resmi." : ""}
          </p>
        </section>
      )}

      <Button variant="secondary" size="small" leadingIcon={KodamaMark} className="w-full" onClick={() => onAsk(question)}>
        Tanya Kodama tentang {situation.scopeName}
      </Button>

      {!situation.signedIn && (
        <section className={cx(CARD, "gap-2")}>
          <p className="text-body-medium text-text-primary">Lihat sesuai pekerjaan Anda</p>
          <p className="text-body-2-regular text-text-secondary">Masuk dan isi profil agar peta membuka wilayah, bidang, dan mode Anda sendiri.</p>
          <ButtonLink href="/login" size="small" leadingIcon={RiLoginBoxLine} className="self-start">Masuk</ButtonLink>
        </section>
      )}
    </div>
  );
}
