import { useState } from "react";
import { Chip } from "@/components/base/badges/chip";
import { DashboardPeriodTabs, type DashboardPeriod } from "./dashboard-period-tabs";

const figures = [ ["9B", "Lifetime tokens"], ["562.7M", "Peak tokens"], ["12h 54m", "Longest task"], ["62 days", "Top streak"] ];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const colors = [
  "bg-background-tertiary-default",
  "bg-accent-200 dark:bg-accent-950",
  "bg-accent-300 dark:bg-accent-900",
  "bg-accent-400 dark:bg-accent-800",
  "bg-accent-500 dark:bg-accent-700",
  "bg-accent-600 dark:bg-accent-500",
];
// Seven 37-cell rows transcribed from the supplied BoardUI Home HTML export.
const activityRows = [
  "0041103130113130241212000130101400322",
  "0051111020202011133421111020012040300",
  "0011442005210211110421441233520025135",
  "0202253121203510100220112111142113304",
  "2032312252311224052021022013121013002",
  "1012212130321120300410112111002113321",
  "3003230324532020325312103240123113301",
];

export function ContributionsCard() {
  const [period, setPeriod] = useState<DashboardPeriod>("Weekly");
  const periodFigures = { Weekly: ["958", "+14.8%"], Monthly: ["3,842", "+11.2%"], Yearly: ["11,496", "+18.4%"] } as const;
  return <section aria-label="Contributions this year" className="flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl bg-background-secondary-default px-2 py-4">
    <div className="px-2"><p className="text-sm font-medium leading-5 text-text-secondary">Contributions this year</p><div className="mt-0.5 flex items-center gap-2"><strong className="text-[24px] font-medium leading-[34px] text-text-primary">{periodFigures[period][0]}</strong><Chip variant="bold" color="lime">{periodFigures[period][1]}</Chip></div></div>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{figures.map(([value, label]) => <div key={label} className="min-w-0 rounded-[10px] bg-background-primary-default p-2.5 shadow-xs"><p className="truncate text-sm font-medium leading-5 text-text-primary">{value}</p><p className="truncate text-sm leading-5 text-text-secondary">{label}</p></div>)}</div>
    <div className="mt-1 min-w-0 px-2"><div className="mb-1 flex items-center justify-between gap-2"><span className="text-sm font-medium text-text-secondary">Activity</span><DashboardPeriodTabs label="Activity period" value={period} onChange={setPeriod} /></div>
      <div className="grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label="Contributions activity heatmap across 37 weeks">{Array.from({ length: 259 }, (_, index) => { const row = index % 7; const week = Math.floor(index / 7); const level = Number(activityRows[row][week]); return <span key={index} title={`Week ${week + 1}, day ${row + 1}`} className={`aspect-square min-w-0 rounded-[3px] ${colors[(level + (["Weekly", "Monthly", "Yearly"].indexOf(period) * 2)) % colors.length]}`} />; })}</div>
      <div className="mt-1 grid grid-cols-12 text-xs text-text-tertiary">{months.map(month => <span key={month}>{month}</span>)}</div>
    </div>
  </section>;
}
