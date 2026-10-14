import { useState, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { fmt, fmtAuto } from "./atlas";

/* Hand-built SVG shapes the shared Recharts displays do not cover: a ranked list keyed on the attention
   score, a distribution, and a two-measure scatter. Values are always printed as text beside the marks. */

export function StatTile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-border-button-default bg-background-primary-default p-4">
      <p className="flex items-center gap-1.5 text-caption-1-medium text-text-secondary">
        {accent && <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: accent }} />}
        {label}
      </p>
      <p className="mt-1 text-title-2-semibold tabular-nums text-text-primary">{value}</p>
      {sub && <p className="mt-0.5 text-caption-1-regular text-text-tertiary">{sub}</p>}
    </div>
  );
}

export function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-background-supporting-default px-3 py-2">
      <p className="text-caption-1-regular text-text-secondary">{label}</p>
      <p className="text-body-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

export interface BarRow { id: string; rank: number; label: string; value: number; norm: number }

/** Ranked bars. Length is the 0-100 attention score, so high_good metrics still read longer as more attention; the raw value is labelled. */
export function HBarList({ rows, color, unit }: { rows: BarRow[]; color: string; unit: string }) {
  if (!rows.length) return <p className="py-6 text-center text-body-2-regular text-text-secondary">Tidak ada wilayah yang cocok.</p>;
  return (
    <ol className="space-y-1">
      {rows.map(row => (
        <li key={row.id} className="grid grid-cols-[2rem_minmax(0,11rem)_1fr_auto] items-center gap-2 rounded-md px-1 py-0.5 hover:bg-background-primary-hover max-sm:grid-cols-[1.5rem_minmax(0,7rem)_1fr_auto]">
          <span className="text-right text-caption-1-regular tabular-nums text-text-tertiary">{row.rank}</span>
          <span className="truncate text-body-2-regular text-text-primary" title={row.label}>{row.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-background-supporting-default">
            <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, row.norm)}%`, backgroundColor: color }} />
          </div>
          <span className="w-24 text-right text-body-2-medium tabular-nums text-text-primary max-sm:w-16">
            {fmtAuto(row.value)} <span className="text-caption-1-regular text-text-tertiary max-sm:hidden">{unit}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Histogram({ values, color, unit, bins = 14 }: { values: number[]; color: string; unit: string; bins?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (values.length < 2) return <p className="py-6 text-center text-body-2-regular text-text-secondary">Data belum cukup.</p>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = (hi - lo) / bins || 1;
  const counts = Array.from({ length: bins }, () => 0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  const max = Math.max(...counts);
  const H = 100;
  const bw = 100 / bins;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label={`Sebaran ${values.length} wilayah`}>
        {counts.map((c, i) => {
          const h = (c / max) * (H - 4);
          return <rect key={i} x={i * bw + 0.4} y={H - h} width={bw - 0.8} height={Math.max(h, c ? 1 : 0)} rx={0.6} fill={color} opacity={hover === null || hover === i ? 0.9 : 0.35} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />;
        })}
      </svg>
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border-button-default pt-1.5 text-caption-1-regular tabular-nums text-text-tertiary">
        <span>{fmtAuto(lo)}</span>
        <span className="text-text-secondary">{hover === null ? `${values.length} wilayah · ${unit}` : `${fmtAuto(lo + hover * w)} sampai ${fmtAuto(lo + (hover + 1) * w)}: ${counts[hover]} wilayah`}</span>
        <span>{fmtAuto(hi)}</span>
      </div>
    </figure>
  );
}

export interface Point { id: string; label: string; x: number; y: number; color: string; detail?: string }

const ticks = (lo: number, hi: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);

export function Scatter({ points, xLabel, yLabel, yReverse = false, fit = false }: { points: Point[]; xLabel: string; yLabel: string; yReverse?: boolean; fit?: boolean }) {
  const [hover, setHover] = useState<Point | null>(null);
  if (points.length < 2) return <p className="py-10 text-center text-body-2-regular text-text-secondary">Data belum cukup untuk dibandingkan.</p>;
  const W = 420, H = 250, L = 44, R = 10, T = 10, B = 30;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  // Padding must not push a never-negative quantity (depth, days) below zero.
  const pad = (lo: number, hi: number) => {
    const m = hi === lo ? 1 : (hi - lo) * 0.05;
    return [lo >= 0 ? Math.max(0, lo - m) : lo - m, hi + m];
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y: number) => {
    const t = (y - y0) / (y1 - y0);
    return yReverse ? T + t * (H - T - B) : H - B - t * (H - T - B);
  };
  let line: [number, number, number, number] | null = null;
  if (fit) {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (sxx) {
      const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
      const a = my - b * mx;
      const clampY = (y: number) => Math.max(y0, Math.min(y1, y));
      line = [sx(x0), sy(clampY(a + b * x0)), sx(x1), sy(clampY(a + b * x1))];
    }
  }
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full text-border-button-default" role="img" aria-label={`${yLabel} terhadap ${xLabel}, ${points.length} titik`}>
        {ticks(x0, x1).map(t => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={T} y2={H - B} stroke="currentColor" strokeDasharray="2 4" />
            <text x={sx(t)} y={H - B + 13} textAnchor="middle" fontSize={9} fill="var(--color-text-tertiary)">{fmtAuto(t)}</text>
          </g>
        ))}
        {ticks(y0, y1).map(t => (
          <g key={`y${t}`}>
            <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="currentColor" strokeDasharray="2 4" />
            <text x={L - 5} y={sy(t) + 3} textAnchor="end" fontSize={9} fill="var(--color-text-tertiary)">{fmtAuto(t)}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 3} textAnchor="middle" fontSize={10} fill="var(--color-text-secondary)">{xLabel}</text>
        <text x={10} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(T + H - B) / 2})`} fontSize={10} fill="var(--color-text-secondary)">{yLabel}</text>
        {line && <line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} strokeDasharray="4 3" stroke="var(--color-text-tertiary)" strokeWidth={1.2} />}
        {points.map(p => (
          <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={hover?.id === p.id ? 6 : 3.8} fill={p.color} fillOpacity={hover && hover.id !== p.id ? 0.35 : 0.85}
            stroke={hover?.id === p.id ? "var(--color-text-primary)" : "none"} strokeWidth={1.2} className="cursor-pointer"
            onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
            <title>{p.label}</title>
          </circle>
        ))}
      </svg>
      <div className={cx("min-h-9 rounded-lg bg-background-supporting-default px-3 py-1.5 text-body-2-regular", !hover && "text-text-secondary")}>
        {hover ? (
          <>
            <span className="text-body-2-medium text-text-primary">{hover.label}</span>
            <span className="ml-2 tabular-nums text-text-secondary">{xLabel}: {fmtAuto(hover.x)} · {yLabel}: {fmtAuto(hover.y)}</span>
            {hover.detail && <p className="text-caption-1-regular text-text-tertiary">{hover.detail}</p>}
          </>
        ) : "Arahkan kursor ke titik untuk melihat rinciannya."}
      </div>
    </figure>
  );
}

/** Counts per category as a list with share bars; used where a donut would hide small slices. */
export function ShareList({ items }: { items: Array<{ key: string; label: string; value: number; color: string }> }) {
  const total = items.reduce((a, item) => a + item.value, 0);
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item.key} className="space-y-1">
          <div className="flex items-center gap-2 text-body-2-regular">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="min-w-0 flex-1 truncate text-text-primary">{item.label}</span>
            <span className="text-body-2-medium tabular-nums text-text-primary">{fmt(item.value)}</span>
            <span className="w-12 text-right tabular-nums text-text-tertiary">{fmt((item.value / Math.max(total, 1)) * 100, 1)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-background-supporting-default">
            <div className="h-full rounded-full" style={{ width: `${(item.value / Math.max(total, 1)) * 100}%`, backgroundColor: item.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
