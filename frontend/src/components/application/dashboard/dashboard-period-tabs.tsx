export type DashboardPeriod = "Weekly" | "Monthly" | "Yearly";

export function DashboardPeriodTabs({ value, onChange, label }: { value: DashboardPeriod; onChange: (period: DashboardPeriod) => void; label: string }) {
  return <div aria-label={label} className="flex shrink-0 items-center gap-0.5 rounded-[10px] bg-background-secondary-default p-1">
    {(["Weekly", "Monthly", "Yearly"] as const).map(period => <button
      key={period}
      type="button"
      aria-pressed={value === period}
      onClick={() => onChange(period)}
      className={`rounded-[6px] px-2 py-1 text-sm leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 ${value === period ? "bg-background-primary-default font-medium text-text-primary shadow-xs" : "text-text-secondary hover:text-text-primary"}`}
    >{period}</button>)}
  </div>;
}
