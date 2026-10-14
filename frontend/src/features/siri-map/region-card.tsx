"use client";

import { motion, useReducedMotion } from "motion/react";
import { RiCloseLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { formatValue, type RankEntry, type Situation } from "./situation";
import { KodamaMark } from "@/components/foundations/brand/kodama-icon";

const integer = new Intl.NumberFormat("id-ID");
const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** Why a ranked region needs attention: its score, the field's supporting figures, and how far to trust them. */
export function RegionCard({
  entry,
  rank,
  position,
  onClose,
  onAsk,
}: {
  entry: RankEntry;
  rank: NonNullable<Situation["rank"]>;
  position: number;
  onClose: () => void;
  onAsk: (question: string) => void;
}) {
  const reduce = useReducedMotion();
  const color = entry.score == null ? "soft" : entry.score >= 75 ? "rose" : entry.score >= 50 ? "yellow" : "soft";
  const { priority } = entry;
  const facts: [string, string][] = priority ? priority.facts : [
    [rank.metricLabel, formatValue(entry.value, rank.unit)],
    ...entry.details.map((detail): [string, string] => [detail.label, detail.value]),
    ["Penduduk", entry.population != null ? `${integer.format(entry.population)} jiwa` : "Belum ada data"],
  ];

  return (
    <motion.section
      aria-label={`Ringkasan ${entry.name}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: "easeOut" } }}
      className="flex w-full flex-col gap-3 rounded-2xl bg-background-secondary-default p-4 shadow-dropdown"
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body-2-regular text-text-secondary">
            {priority ? `Prioritas ${priority.position} dari ${priority.outOf} wilayah` : `Peringkat ${position} dari ${rank.of} ${rank.scopeLabel}`}
          </p>
          <h3 className="truncate text-title-3-medium text-text-primary">{entry.name}</h3>
        </div>
        <Button variant="ghost" size="xs" iconOnly leadingIcon={RiCloseLine} aria-label="Tutup ringkasan wilayah" onClick={onClose} />
      </header>

      {priority ? (
        <div className="rounded-2lg bg-background-inner-default p-3 shadow-card">
          <Chip variant="bold" color={priority.level === "siaga" ? "rose" : "yellow"}>{priority.level === "siaga" ? "Siaga" : "Waspada"}</Chip>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-body-2-regular text-text-secondary">
            {priority.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {priority.advice.map((line) => <p key={line} className="mt-2 text-body-2-regular text-text-primary">{line}</p>)}
        </div>
      ) : (
        <div className="rounded-2lg bg-background-inner-default p-3 shadow-card">
          <p className="text-body-2-regular text-text-secondary">Skor perhatian</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-title-1-medium tabular-nums text-text-primary">{entry.score != null ? decimal.format(entry.score) : "–"}</p>
            <Chip variant="bold" color={color}>{entry.score == null ? "Belum ada data" : entry.score >= 75 ? "Tinggi" : entry.score >= 50 ? "Sedang" : "Rendah"}</Chip>
          </div>
          <p className="mt-1 text-body-2-regular text-text-tertiary">
            Dari {rank.metricLabel.toLowerCase()}.{rank.modelled ? " Indeks turunan model, bukan peringatan resmi." : ""}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-1 text-body-2-regular">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="truncate text-text-secondary" title={term}>{term}</dt>
            <dd className="text-right tabular-nums text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      <Button
        variant="secondary"
        size="small"
        leadingIcon={KodamaMark}
        onClick={() => onAsk(priority
          ? `Kenapa ${entry.name} berstatus ${priority.level} untuk asap dan api, dan apa yang perlu dilakukan lebih dulu?`
          : `Kenapa ${entry.name} perlu perhatian menurut ${rank.metricLabel.toLowerCase()}, dan apa yang perlu dicek lebih dulu?`)}
      >
        Tanya Kodama tentang {entry.name}
      </Button>
    </motion.section>
  );
}
