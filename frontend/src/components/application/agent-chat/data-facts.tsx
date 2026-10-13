const label = (key: string) => key.replaceAll("_", " ");

/** Displays bounded API detail fields without interpreting them as safety claims. */
export function DataFacts({ value }: { value: unknown }) {
  if (value == null) return <span className="text-text-tertiary">Belum ada data</span>;
  if (typeof value !== "object") return <span>{typeof value === "boolean" ? (value ? "Ya" : "Tidak") : String(value)}</span>;
  if (Array.isArray(value)) return value.length ? <ul className="flex flex-col gap-2">{value.slice(0, 100).map((row, i) => <li key={i} className="border-t border-border-button-default pt-2"><DataFacts value={row} /></li>)}</ul> : <span>Belum ada data</span>;
  return <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-2 text-body-compact">{Object.entries(value).map(([key, item]) => <div key={key} className="contents"><dt className="break-words text-text-secondary">{label(key)}</dt><dd className="min-w-0 break-words text-text-primary"><DataFacts value={item} /></dd></div>)}</dl>;
}
