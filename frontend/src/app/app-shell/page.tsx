import { useState, type FormEvent } from "react";
import {
  RiAddLine,
  RiBarChart2Line,
  RiChatAiLine,
  RiDashboardLine,
  RiFileList3Line,
  RiLayoutGridLine,
  RiLoginBoxLine,
  RiUserAddLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { JointsAppShell, type AppShellNavItem } from "@/components/application/app-shell/joints-app-shell";
import { BoardUIHomeDashboard } from "@/components/application/dashboard/boardui-home-dashboard";
import { LoginModal, type AuthModalMode } from "@/components/application/auth/login-modal";
import { Button } from "@/components/base/buttons/button";
import { Select, SelectItem } from "@/components/base/select/select";
import { AuditCard } from "@/components/ui/audit-card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";

type View = "overview" | "reports" | "activity";
type Report = { id: number; name: string; status: "Ready" | "Draft"; updated: string };
const navigation: AppShellNavItem[] = [
  { id: "chat", label: "Chat", icon: RiChatAiLine, href: "#chat" },
  { id: "overview", label: "Dashboard", icon: RiDashboardLine },
  { id: "components", label: "Components and Blocks", icon: RiLayoutGridLine, href: "/design-system" },
  { id: "reports", label: "Reports", icon: RiFileList3Line, badge: 4 },
  { id: "activity", label: "Activity", icon: RiBarChart2Line },
  { id: "login", label: "Sign in", icon: RiLoginBoxLine },
  { id: "signup", label: "Sign up", icon: RiUserAddLine },
];
const initialReports: Report[] = [
  { id: 1, name: "Monthly monitoring summary", status: "Ready", updated: "Today, 09:42" },
  { id: 2, name: "North station review", status: "Ready", updated: "Yesterday, 16:10" },
  { id: 3, name: "Q3 field observations", status: "Draft", updated: "Monday, 11:24" },
  { id: 4, name: "Sensor reliability notes", status: "Draft", updated: "Friday, 14:05" },
];

export default function AppShellDemo({ embedded = false }: { embedded?: boolean }) {
  const [view, setView] = useState<View>("overview");
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState<"all" | "ready" | "draft">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [reportName, setReportName] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthModalMode>("signin");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const filtered = reports.filter(report => filter === "all" || report.status.toLowerCase() === filter);
  const headings = {
    overview: ["Welcome to JOINTS", ""],
    reports: ["Reports", "Review and prepare monitoring reports."],
    activity: ["Activity", "Recent changes across the workspace."],
  } as const;

  function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = reportName.trim();
    if (!name) return;
    setReports(current => [{ id: Date.now(), name, status: "Draft", updated: "Just now" }, ...current]);
    setReportName("");
    setFilter("all");
    setView("reports");
    setCreateOpen(false);
    toast.success("Draft report created");
  }

  function handleNavigate(id: string) {
    if (id === "login") {
      setAuthMode("signin");
      setLoginOpen(true);
      return;
    }
    if (id === "signup") {
      setAuthMode("signup");
      setLoginOpen(true);
      return;
    }
    if (id === "overview" || id === "reports" || id === "activity") {
      setView(id);
    }
  }

  const actions = <>
    <Select
      aria-label="Filter reports"
      className="shrink-0"
      popoverClassName="min-w-40"
      selectedKey={filter}
      onSelectionChange={(k) => {
        setFilter(k as "all" | "ready" | "draft");
        setView("reports");
      }}
    >
      <SelectItem id="all" textValue="All reports">
        All reports
      </SelectItem>
      <SelectItem id="ready" textValue="Ready">
        Ready
      </SelectItem>
      <SelectItem id="draft" textValue="Draft">
        Draft
      </SelectItem>
    </Select>
    {user ? (
      <div className="flex items-center gap-2 rounded-[10px] border border-border-button-default bg-background-primary-default px-2.5 py-1.5 shadow-xs">
        <span className="flex size-6 items-center justify-center rounded-full bg-button-primary text-xs font-bold text-white shadow-xs">
          {user.name[0]?.toUpperCase()}
        </span>
        <span className="text-xs font-medium text-text-primary">{user.name}</span>
        <button
          type="button"
          onClick={() => {
            setUser(null);
            toast.info("Signed out");
          }}
          className="text-xs text-text-secondary outline-none hover:text-text-primary hover:underline focus-visible:ring-1 focus-visible:ring-accent-500"
        >
          Sign out
        </button>
      </div>
    ) : (
      <Button
        variant="secondary"
        size="medium"
        leadingIcon={RiLoginBoxLine}
        onClick={() => {
          setAuthMode("signin");
          setLoginOpen(true);
        }}
      >
        Sign in
      </Button>
    )}
    <Button size="medium" leadingIcon={RiAddLine} onClick={() => setCreateOpen(true)}>New report</Button>
  </>;

  return <>
    <JointsAppShell embedded={embedded} navigation={navigation.map(item => item.id === "reports" ? { ...item, badge: reports.length } : item)} activeId={view} onNavigate={handleNavigate} title={headings[view][0]} description={headings[view][1]} actions={actions} notifications={[{ id: "sync", title: "Data sync complete", detail: "The latest station readings are ready." }, { id: "review", title: "Review requested", detail: "Monthly monitoring summary needs approval." }]} commands={[{ id: "new-report", label: "New report", group: "Actions", onSelect: () => setCreateOpen(true) }]}>
      {view === "overview" && <BoardUIHomeDashboard embedded={embedded} />}
      {view === "reports" && <section className="overflow-hidden rounded-[16px] border border-border-button-default bg-background-primary-default shadow-xs"><div className="flex items-center justify-between border-b border-border-button-default px-5 py-4"><div><h2 className="text-sm font-semibold text-text-primary">{filter === "all" ? "All reports" : filter === "ready" ? "Ready reports" : "Draft reports"}</h2><p className="mt-0.5 text-xs text-text-secondary">{filtered.length} report{filtered.length === 1 ? "" : "s"}</p></div><span className="text-xs text-text-secondary">Recently updated</span></div>{filtered.length ? <ul>{filtered.map(report => <li key={report.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border-button-default px-5 py-4 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-text-primary">{report.name}</p><p className="mt-1 text-xs text-text-secondary">Updated {report.updated}</p></div><StatusBadge tone={report.status === "Ready" ? "success" : "neutral"}>{report.status}</StatusBadge></li>)}</ul> : <p className="px-5 py-12 text-center text-sm text-text-secondary">No reports match this filter.</p>}</section>}
      {view === "activity" && <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]"><AuditCard title="Workspace activity" entries={[{ id: "1", action: "New station readings imported", actor: "JOINTS system", time: "Today, 09:42" }, { id: "2", action: "Monthly summary approved", actor: "Research team", time: "Yesterday, 16:10" }, { id: "3", action: "North station reviewed", actor: "Field team", time: "Monday, 11:24" }, { id: "4", action: "Report draft created", actor: "Research team", time: "Friday, 14:05" }]} /><div className="h-fit rounded-[16px] border border-border-button-default bg-background-secondary-default p-5"><p className="text-xs font-semibold uppercase tracking-wide text-accent-600">On track</p><h2 className="mt-2 text-lg font-semibold text-text-primary">Everything is up to date</h2><p className="mt-2 text-sm leading-6 text-text-secondary">Station readings were synced today. Open reports to review the latest drafts.</p><Button variant="secondary" size="small" className="mt-4" onClick={() => setView("reports")}>View reports</Button></div></div>}
    </JointsAppShell>

    <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) setReportName(""); }}><DialogContent><DialogHeader><DialogTitle>Create report</DialogTitle><DialogDescription>Start a draft in the JOINTS workspace.</DialogDescription></DialogHeader><form onSubmit={createReport}><label htmlFor="new-report-name" className="mb-1.5 block text-sm font-medium text-text-primary">Report name</label><input id="new-report-name" autoFocus value={reportName} onChange={event => setReportName(event.target.value)} placeholder="e.g. North station summary" className="h-10 w-full rounded-[10px] border border-border-button-default bg-background-primary-default px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" /><DialogFooter><DialogClose className="rounded-lg border border-border-button-default px-3 py-2 text-sm text-text-primary outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-accent-500">Cancel</DialogClose><Button type="submit" disabled={!reportName.trim()}>Create draft</Button></DialogFooter></form></DialogContent></Dialog>

    <LoginModal
      isOpen={loginOpen}
      defaultMode={authMode}
      onClose={() => setLoginOpen(false)}
      onSuccess={setUser}
    />
  </>;
}
