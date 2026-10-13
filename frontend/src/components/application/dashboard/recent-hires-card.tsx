import { useState, type ReactNode } from "react";
import { RiArrowLeftLine, RiArrowRightLine } from "@remixicon/react";
import { Select, SelectItem } from "@/components/base/select/select";
import { cx } from "@/utils/cx";

/** `leading` replaces the avatar image (e.g. a rank badge) when a row has no person behind it. */
export type RecentHire = { name: string; joined: string; role: string; image?: string; leading?: ReactNode };

const DEFAULT_HIRES: RecentHire[] = [
  { name: "Livia Saris", joined: "Joined today", role: "Backend Engineer", image: "/avatars/livia-saris.webp" },
  { name: "Jaydon Aminoff", joined: "2 days ago", role: "UI Designer", image: "/avatars/jaydon-aminoff.webp" },
  { name: "Maria Lubin", joined: "5 days ago", role: "User Researcher", image: "/avatars/maria-lubin.webp" },
  { name: "Ann Press", joined: "A week ago", role: "DevOps Engineer", image: "/avatars/ann-press.webp" },
  { name: "John Clarkson", joined: "2 weeks ago", role: "Product Designer", image: "/avatars/john-clarkson.webp" },
  { name: "Aspen Lubin", joined: "3 weeks ago", role: "Data Analyst", image: "/avatars/aspen-lubin.webp" },
];

export function RecentHiresCard({ hires = DEFAULT_HIRES, total = 56, team = "Board team", title = "Recent hires", filter, pagerLabels = { previous: "Previous", next: "Next" }, className }: {
  hires?: RecentHire[];
  total?: ReactNode;
  team?: string;
  title?: string;
  /** Replaces the demo team select; `false` hides it. */
  filter?: ReactNode | false;
  pagerLabels?: { previous: string; next: string };
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState(team);
  const pageCount = Math.max(1, Math.ceil(hires.length / 4));
  const selectedHires = selectedTeam === team ? hires : [...hires].reverse();
  const visible = selectedHires.length ? Array.from({ length: Math.min(4, selectedHires.length) }, (_, index) => selectedHires[(page * 4 + index) % selectedHires.length]) : [];
  return <section aria-label={title} className={cx("flex min-w-0 flex-col gap-2 rounded-2xl bg-background-secondary-default p-2", className)}>
    <div className="flex min-h-[67px] items-start justify-between px-2 pt-2">
      <div><p className="text-sm font-medium leading-5 text-text-secondary">{title}</p><p className="mt-0.5 text-[24px] font-medium leading-[34px] text-text-primary">{selectedTeam === team ? total : 18}</p></div>
      {filter !== undefined ? filter || null : (<Select
        aria-label="Filter by team"
        className="shrink-0"
        popoverClassName="min-w-36"
        selectedKey={selectedTeam}
        onSelectionChange={(k) => {
          setSelectedTeam(String(k));
          setPage(0);
        }}
      >
        {[team, "Research team"].map((option) => (
          <SelectItem key={option} id={option} textValue={option}>
            {option}
          </SelectItem>
        ))}
      </Select>)}
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {visible.map(hire => <div key={hire.name} className="flex h-[95px] min-w-0 flex-col justify-between rounded-[10px] bg-background-primary-default p-2 shadow-xs">
        <div className="flex min-w-0 items-center gap-2">{hire.leading ?? <img src={hire.image} alt="" className="size-9 shrink-0 rounded-full object-cover" />}<div className="min-w-0"><p className="truncate text-sm font-medium leading-5 text-text-primary">{hire.name}</p><p className="truncate text-[13px] leading-[18px] text-text-secondary">{hire.joined}</p></div></div>
        <span className="block truncate rounded-md bg-background-recent-hire-role px-2 py-1 text-center text-xs font-medium leading-4 text-text-secondary">{hire.role}</span>
      </div>)}
    </div>
    {pageCount > 1 && <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setPage(current => (current - 1 + pageCount) % pageCount)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-border-button-default bg-background-primary-default text-sm font-medium text-text-primary shadow-xs outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-accent-500"><RiArrowLeftLine className="size-4" aria-hidden />{pagerLabels.previous}</button>
      <button type="button" onClick={() => setPage(current => (current + 1) % pageCount)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-border-button-default bg-background-primary-default text-sm font-medium text-text-primary shadow-xs outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-accent-500">{pagerLabels.next}<RiArrowRightLine className="size-4" aria-hidden /></button>
    </div>}
  </section>;
}
