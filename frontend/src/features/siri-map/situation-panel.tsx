"use client";

import type { ReactNode } from "react";
import { RiGroupLine, RiLightbulbLine, RiLoginBoxLine } from "@remixicon/react";
import { StatHint } from "@/components/application/dashboard/stat-cards";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/utils/cx";
import { formatCompact, scoreColor, scoreWord } from "./data-scale";
import { LevelSplit, PriorityFigures, ScoreBar } from "./data-views";
import type { Priority } from "./decision";
import type { RankEntry, Situation } from "./situation";
import { KodamaMark } from "@/components/foundations/brand/kodama-icon";

// The dashboard's card anatomy (environmental-dashboard/components/dashboard-card.tsx, which this feature may not import).
// The panel itself has no frame, so this is two levels: grey card, white inset. Figures inside an inset get no third box.
const CARD = "flex min-w-0 flex-col gap-4 rounded-2xl bg-background-secondary-default p-4";
const INSET = "rounded-2lg bg-background-inner-default shadow-card";

const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/**
 * A card's title with its method note behind the dashboard's (i) hint, on the right like every dashboard card,
 * so the caveat is one tap away instead of a paragraph under every list.
 */
function CardHeader({ id, title, note, children }: { id: string; title: string; note: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 id={id} className="text-title-3-medium text-text-primary">{title}</h3>
        <StatHint label={title} hint={note} />
      </div>
      {children}
    </header>
  );
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
        <span className="w-4 shrink-0 text-center text-caption-1-semibold tabular-nums text-text-tertiary">{index + 1}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-body-medium text-text-primary">{entry.name}</span>
            {entry.isYou && <Chip variant="caption" color="lime">Wilayah Anda</Chip>}
          </span>
          <ScoreBar score={entry.score} label={`Skor ${entry.name}`} />
          {entry.details.length > 0 && (
            <span className="flex flex-wrap gap-x-3 gap-y-0.5">
              {entry.details.map((detail) => (
                <span key={detail.label} className="text-caption-1-regular text-text-tertiary">
                  {detail.label} <span className="text-caption-1-semibold tabular-nums text-text-secondary">{detail.short}</span>
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-headline-semibold tabular-nums text-text-primary">{entry.score != null ? decimal.format(entry.score) : "–"}</span>
          <span className="text-caption-1-medium" style={{ color: scoreColor(entry.score) }}>{scoreWord(entry.score)}</span>
        </span>
      </button>
    </li>
  );
}

const PRIORITY_LABEL = { siaga: "Siaga", waspada: "Waspada" } as const satisfies Record<Priority["level"], string>;

function PriorityRow({ priority, selected, onSelect }: { priority: Priority; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${PRIORITY_LABEL[priority.level]}, ${priority.name}. ${priority.reasons.join(". ")}`}
        onClick={onSelect}
        className={cx(
          INSET,
          "button-press-motion flex w-full flex-col gap-2.5 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          selected && "ring-2 ring-border-focus-ring",
        )}
      >
        <span className="flex items-center gap-2">
          <Chip variant="bold" color={priority.level === "siaga" ? "rose" : "yellow"}>{PRIORITY_LABEL[priority.level]}</Chip>
          <span className="min-w-0 flex-1 truncate text-body-semibold text-text-primary">{priority.name}</span>
          {priority.population != null && (
            <span className="flex shrink-0 items-center gap-1 text-caption-1-medium tabular-nums text-text-secondary" title={`${priority.population.toLocaleString("id-ID")} jiwa`}>
              <RiGroupLine className="size-3.5" aria-hidden="true" />
              {formatCompact(priority.population)}
            </span>
          )}
        </span>
        <PriorityFigures signals={priority.signals} context={priority.context} />
        {priority.advice.length > 0 && (
          // The full advice is on the region card; here it is the first step, two lines at most, under a hairline rather than in a box.
          <span className="flex items-start gap-2 border-t border-border-button-default pt-2.5">
            <RiLightbulbLine className="mt-px size-4 shrink-0 text-foreground-icon-secondary" aria-hidden="true" />
            <span className="line-clamp-2 text-caption-1-regular text-text-secondary">{priority.advice[0]}</span>
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
      <CardHeader
        id="priority-title"
        title="Prioritas Tindakan"
        note="Urut menurut tingkat, lalu seberapa jauh melewati ambang. Kategori asap memakai ambang ISPU (Permen LHK 14/2020) pada PM2.5 hasil model, bukan pengukuran stasiun. Ambang titik panas adalah ambang kerja yang belum dikalibrasi. Penduduk adalah penduduk seluruh wilayah."
      >
        {summary.total > 0 ? (
          <div className="flex flex-col gap-2.5">
            <p className="flex items-baseline gap-1.5">
              <span className="text-title-2-semibold tabular-nums text-text-primary">{summary.total}</span>
              <span className="text-body-2-regular text-text-secondary">wilayah melewati ambang asap atau api</span>
            </p>
            <LevelSplit levels={summary.levels} />
          </div>
        ) : (
          <p className="text-body-2-regular text-text-secondary">Tidak ada wilayah yang melewati ambang asap atau api saat ini.</p>
        )}
      </CardHeader>
      {summary.items.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {summary.items.map((priority) => (
            <PriorityRow key={priority.regionId} priority={priority} selected={priority.regionId === selectedRegionId} onSelect={() => onSelect(priority)} />
          ))}
        </ol>
      )}
      {summary.total > summary.items.length && (
        <p className="text-center text-caption-1-regular text-text-tertiary">Dan {summary.total - summary.items.length} wilayah lain di urutan berikutnya</p>
      )}
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
      <header className="space-y-1.5 px-1 pt-1">
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
              <li key={tile.label} className={cx(INSET, "flex min-w-0 flex-col p-3", index === 0 && "col-span-2")}>
                <p className="truncate text-body-2-regular text-text-secondary">{tile.label}</p>
                <div className="mt-0.5 flex min-w-0 items-baseline justify-between gap-2">
                  <p className={cx("truncate tabular-nums text-text-primary", index === 0 ? "text-title-2-medium" : "text-title-3-medium")}>{tile.value}</p>
                  {/* The lead tile names a region, so its score sits beside the name as a figure of its own. */}
                  {index === 0 && tile.score != null && (
                    <p className="shrink-0 text-body-2-regular text-text-tertiary">
                      skor <span className="text-headline-semibold tabular-nums" style={{ color: scoreColor(tile.score) }}>{decimal.format(tile.score)}</span>
                    </p>
                  )}
                </div>
                {tile.score != null && <ScoreBar score={tile.score} label={`Skor ${tile.label.toLowerCase()}`} className="mt-2" />}
                <p className="mt-auto truncate pt-1.5 text-caption-1-regular text-text-tertiary">{tile.caption}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PriorityCard summary={situation.priorities} loading={situation.prioritiesLoading} selectedRegionId={selectedRegionId} onSelect={onSelectPriority} />

      {rank && (
        <section aria-labelledby="rank-title" className={CARD}>
          <CardHeader
            id="rank-title"
            title="Wilayah Perlu Perhatian"
            note={`Skor 0 sampai 100 dari ${rank.metricLabel.toLowerCase()}, makin tinggi makin perlu perhatian. Garis pada bar menandai batas sedang (50) dan tinggi (75).${rank.modelled ? " Indeks turunan model, bukan peringatan resmi." : ""}`}
          >
            <p className="text-body-2-regular text-text-secondary">
              {rank.entries.length} teratas dari {rank.of} {rank.scopeLabel}
            </p>
          </CardHeader>
          <ol className="flex flex-col gap-1.5">
            {rank.entries.map((entry, index) => (
              <RankRow key={entry.regionId} entry={entry} index={index} selected={entry.regionId === selectedRegionId} onSelect={() => onSelectRegion(entry)} />
            ))}
          </ol>
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
