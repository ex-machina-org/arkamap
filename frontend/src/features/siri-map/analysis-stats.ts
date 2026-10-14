export function summary(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return {
    n: s.length,
    min: s[0],
    max: s[s.length - 1],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
  };
}

/** Pearson correlation; null when either side has no variance. */
export function pearson(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

export function strength(r: number) {
  const a = Math.abs(r);
  const how = a < 0.2 ? "Hampir tidak berhubungan" : a < 0.4 ? "Hubungan lemah" : a < 0.7 ? "Hubungan sedang" : "Hubungan kuat";
  if (a < 0.2) return how;
  return `${how}, ${r > 0 ? "searah (naik bersama)" : "berlawanan (satu naik, lainnya turun)"}`;
}

/* Jev's quake urgency levels in escalation order. Ordinal data colours, hex because SVG fills and map paint share them. */
export const URGENCY_ORDER = ["informasi", "pantau", "siaga_tsunami", "darurat"] as const;

export const URGENCY_LABEL: Record<string, string> = {
  informasi: "Informasi",
  pantau: "Pantau",
  siaga_tsunami: "Siaga tsunami",
  darurat: "Darurat",
  none: "Belum diklasifikasi",
};

export const URGENCY_COLOR: Record<string, string> = {
  informasi: "#7FB0A6",
  pantau: "#D9A45B",
  siaga_tsunami: "#C77B62",
  darurat: "#A8453A",
  none: "#96B0C8",
};
