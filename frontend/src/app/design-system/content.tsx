import { lazy, Suspense, useState, type ReactNode } from "react";
import { RiAddLine, RiArrowRightLine, RiCheckLine, RiInformationLine, RiSearchLine, RiSettings3Line, RiUserLine } from "@remixicon/react";
import { toast } from "sonner";
import { LoginModalExample } from "./examples/login-modal";
import loginModalExampleSource from "./examples/login-modal?raw";
import { DataTable, DataTableExample } from "@/components/application/data-table/data-table";
import { StatCards } from "@/components/application/dashboard/stat-cards";
import { RecentHiresCard } from "@/components/application/dashboard/recent-hires-card";
import { HomeChartCard } from "@/components/application/dashboard/home-chart-card";
import { ContributionsCard } from "@/components/application/dashboard/contributions-card";
import { RevenueChartCard } from "@/components/application/dashboard/revenue-chart-card";
import { OrdersChartCard } from "@/components/application/dashboard/orders-chart-card";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badge";
import { StatusDot } from "@/components/base/badges/status-dot";
import { Kbd } from "@/components/base/kbd/kbd";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { CheckboxCard } from "@/components/base/checkbox/checkbox-card";
import { RadioCard } from "@/components/base/radio/radio-card";
import { RadioGroup } from "@/components/base/radio/radio";
import { SwitchCard } from "@/components/base/switch/switch-card";
import { DateRangePicker } from "@/components/base/date-picker/date-range-picker";
import { MeetingScheduler } from "@/components/base/date-picker/meeting-scheduler";
import { Dropdown, DropdownButton, DropdownGroup, DropdownItem, DropdownPopover } from "@/components/base/dropdown/dropdown";
import { Pagination } from "@/components/base/pagination/pagination";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { Switch } from "@/components/base/switch/switch";
import { Tab, TabList, TabPanel, Tabs } from "@/components/base/tabs/tabs";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ComponentPreview, DocSection, UsageGuide } from "./docs-ui";
import AppShellDemo from "../app-shell/page";
import { ExtensionContent, extensionSlugs } from "./extension-content";
import { docs, groups, hrefFor } from "./registry";

const CatalogPreview = lazy(() => import("./catalog-preview"));

type Example = { title: string; node: ReactNode; code: string };
type ComponentContent = { use: string; avoid: string; examples: Example[]; note: string };

const componentContent: Record<string, ComponentContent> = {
  button: { use: "A person can take a clear action. Give the most important action one primary button per area.", avoid: "The element only changes pages; use a link or ButtonLink for navigation.", examples: [
    { title: "Variants", node: <><Button leadingIcon={RiAddLine} onClick={() => toast.success("Report created")}>Create report</Button><Button variant="secondary" onClick={() => toast.info("Secondary action selected")}>Secondary</Button><Button variant="ghost" onClick={() => toast.info("Ghost action selected")}>Ghost</Button><Button variant="danger" onClick={() => toast.error("Delete example selected")}>Delete</Button></>, code: '<Button leadingIcon={RiAddLine} onClick={createReport}>Create report</Button>\n<Button variant="secondary">Secondary</Button>\n<Button variant="ghost">Ghost</Button>\n<Button variant="danger">Delete</Button>' },
    { title: "Sizes and states", node: <><Button size="medium">Medium</Button><Button size="small">Small</Button><Button size="xs">Extra small</Button><Button disabled>Disabled</Button><Button iconOnly leadingIcon={RiAddLine} aria-label="Add item" /></>, code: '<Button size="small">Small</Button>\n<Button disabled>Disabled</Button>\n<Button iconOnly leadingIcon={RiAddLine} aria-label="Add item" />' },
  ], note: "Primary actions use the BoardUI green vertical gradient. Keep labels specific and use the danger variant only for destructive actions." },
  badge: { use: "Show a short count or compact label beside another element.", avoid: "A domain state needs a semantic label; use StatusBadge.", examples: [
    { title: "Count and neutral", node: <><Badge color="primary">12</Badge><Badge color="neutral">24</Badge></>, code: '<Badge color="primary">12</Badge>\n<Badge color="neutral">24</Badge>' },
  ], note: "These BoardUI badges are intentionally small. Put them close to the item they describe." },
  "status-dot": { use: "Support a nearby text label with a tiny presence or health cue.", avoid: "The dot would be the only indicator of a state.", examples: [
    { title: "Presence colors", node: <><span className="inline-flex items-center gap-2 text-sm"><StatusDot color="green" />Online</span><span className="inline-flex items-center gap-2 text-sm"><StatusDot color="yellow" />Away</span><span className="inline-flex items-center gap-2 text-sm"><StatusDot color="indigo" />Busy</span></>, code: '<StatusDot color="green" /> Online' },
  ], note: "The dot is decorative; pair it with text so the state remains clear." },
  kbd: { use: "Show a shortcut beside a command or menu action.", avoid: "The shortcut is the only way to discover an action.", examples: [
    { title: "Keyboard shortcuts", node: <><Kbd>⌘ K</Kbd><Kbd>Esc</Kbd><Kbd>Enter</Kbd></>, code: '<Kbd>⌘ K</Kbd>' },
  ], note: "The shortcut hint is secondary to the action label." },
  avatar: { use: "Identify a person or workspace in a dense list or navigation surface.", avoid: "Identity is unknown or purely decorative; show text instead.", examples: [
    { title: "Initials and sizes", node: <><Avatar initials="JM" size="xs" /><Avatar initials="JM" size="sm" /><Avatar initials="JM" size="md" /><Avatar initials="JM" size="lg" /><Avatar initials="AL" color="lime" size="lg" /></>, code: '<Avatar initials="JM" size="md" />\n<Avatar initials="AL" color="lime" size="lg" />' },
  ], note: "Use meaningful initials when a photo is unavailable. Photo avatars should receive a useful alt value." },
  input: { use: "Collect a short line of text with a clear label and optional supporting hint.", avoid: "The response is long form; use a multiline field.", examples: [
    { title: "Labeled field", node: <div className="w-full max-w-sm"><Input label="Report name" placeholder="Enter a name" hint="Visible to your team" /></div>, code: '<Input label="Report name" placeholder="Enter a name" hint="Visible to your team" />' },
    { title: "Search and disabled", node: <><div className="w-full max-w-sm"><Input aria-label="Search locations" placeholder="Search locations" leadingIcon={RiSearchLine} /></div><div className="w-full max-w-sm"><Input label="Read only" value="Unavailable" isDisabled /></div></>, code: '<Input aria-label="Search locations" placeholder="Search locations" leadingIcon={RiSearchLine} />\n<Input label="Read only" value="Unavailable" isDisabled />' },
  ], note: "The existing Input composes React Aria labels and hints so assistive technology receives the right relationships." },
  select: { use: "Pick one option from a small, known set.", avoid: "A person needs to search a large list or select multiple values.", examples: [
    { title: "Single choice", node: <Select aria-label="Report period" defaultSelectedKey="weekly"><SelectItem id="weekly">Weekly</SelectItem><SelectItem id="monthly">Monthly</SelectItem><SelectItem id="yearly">Yearly</SelectItem></Select>, code: '<Select aria-label="Report period" defaultSelectedKey="weekly">\n  <SelectItem id="weekly">Weekly</SelectItem>\n  <SelectItem id="monthly">Monthly</SelectItem>\n</Select>' },
  ], note: "Keep option labels concise and provide a visible label in forms." },
  checkbox: { use: "People may independently choose several options.", avoid: "The setting takes effect immediately; use Switch.", examples: [
    { title: "Selection states", node: <><Checkbox defaultSelected>Email updates</Checkbox><Checkbox>Include archived</Checkbox><Checkbox isDisabled>Unavailable option</Checkbox></>, code: '<Checkbox defaultSelected>Email updates</Checkbox>\n<Checkbox>Include archived</Checkbox>\n<Checkbox isDisabled>Unavailable option</Checkbox>' },
  ], note: "The checked state uses the same green control gradient as the primary action." },
  "checkbox-card": { use: "A multi-select choice needs a short explanation.", avoid: "A plain checkbox label is already clear.", examples: [
    { title: "Select feature", node: <div className="w-full max-w-sm"><CheckboxCard title="Include archived data" description="Add historic records to the report." defaultSelected /></div>, code: '<CheckboxCard title="Include archived data" description="Add historic records." />' },
  ], note: "The existing BoardUI card manages its own selected state and remains keyboard accessible." },
  "radio-card": { use: "One option from a set needs more explanation or space.", avoid: "Simple short labels fit a standard Radio group.", examples: [
    { title: "Report frequency", node: <RadioGroup aria-label="Report frequency" defaultValue="weekly" className="w-full max-w-sm"><RadioCard value="daily" title="Daily" description="A summary each morning." /><RadioCard value="weekly" title="Weekly" description="One digest each Monday." /></RadioGroup>, code: '<RadioGroup defaultValue="weekly">\n  <RadioCard value="daily" title="Daily" />\n  <RadioCard value="weekly" title="Weekly" />\n</RadioGroup>' },
  ], note: "All options in a radio group should describe the same decision." },
  switch: { use: "A setting changes immediately when toggled.", avoid: "Several choices should be submitted together in a form.", examples: [
    { title: "Sizes", node: <><Switch size="sm" defaultSelected>Alerts</Switch><Switch size="md">Email summary</Switch><Switch size="lg" defaultSelected>Live updates</Switch></>, code: '<Switch size="sm" defaultSelected>Alerts</Switch>\n<Switch size="md">Email summary</Switch>' },
  ], note: "Use short, affirmative labels that describe what is enabled." },
  "switch-card": { use: "An on/off setting benefits from a short explanation.", avoid: "The label alone explains the choice.", examples: [
    { title: "Setting row", node: <div className="w-full max-w-sm"><SwitchCard title="Email summaries" description="Send the latest observations each week." defaultSelected /></div>, code: '<SwitchCard title="Email summaries" description="Send weekly observations." />' },
  ], note: "Switch cards act immediately when toggled; do not require a separate save action." },
  tabs: { use: "Switch between closely related panels on the same page.", avoid: "The destinations are separate pages with different URLs; use navigation.", examples: [
    { title: "Underlined tabs", node: <div className="w-full"><Tabs defaultSelectedKey="overview"><TabList aria-label="Report views"><Tab id="overview">Overview</Tab><Tab id="activity" count={12}>Activity</Tab><Tab id="settings">Settings</Tab></TabList><TabPanel id="overview"><p className="pt-2 text-sm text-text-secondary">Overview content</p></TabPanel><TabPanel id="activity"><p className="pt-2 text-sm text-text-secondary">Activity content</p></TabPanel><TabPanel id="settings"><p className="pt-2 text-sm text-text-secondary">Settings content</p></TabPanel></Tabs></div>, code: '<Tabs defaultSelectedKey="overview">\n  <TabList aria-label="Report views">\n    <Tab id="overview">Overview</Tab>\n    <Tab id="activity">Activity</Tab>\n  </TabList>\n  <TabPanel id="overview">Overview content</TabPanel>\n  <TabPanel id="activity">Activity content</TabPanel>\n</Tabs>' },
  ], note: "Tab labels should describe distinct content. The BoardUI tab component handles keyboard navigation." },
  dropdown: { use: "A button offers a short set of contextual actions.", avoid: "The person is selecting a field value; use Select.", examples: [
    { title: "Actions menu", node: <DropdownDemo />, code: '<Dropdown>\n  <DropdownButton>More actions</DropdownButton>\n  <DropdownPopover aria-label="Actions">\n    <DropdownGroup label="Report">\n      <DropdownItem onSelect={exportReport}>Export</DropdownItem>\n    </DropdownGroup>\n  </DropdownPopover>\n</Dropdown>' },
  ], note: "The menu opens and closes on click or keyboard input. Choosing an action closes it and shows feedback." },
  pagination: { use: "A result set spans multiple pages.", avoid: "The list is short enough to show all rows.", examples: [
    { title: "Page navigation", node: <PaginationDemo />, code: '<Pagination page={page} totalPages={10} onChange={setPage} />' },
  ], note: "The example updates the current page, including Previous and Next states." },
  "date-range-picker": { use: "A report or chart is filtered by a start and end date.", avoid: "Only one date is needed.", examples: [
    { title: "Date range", node: <DateRangePicker aria-label="Report date range" onChange={() => toast.success("Date range updated")} />, code: '<DateRangePicker aria-label="Report date range" onChange={setRange} />' },
  ], note: "The existing BoardUI picker supports calendar navigation, presets, and applying the range." },
  "meeting-scheduler": { use: "People choose a date and time slot for a meeting.", avoid: "A single date is all that is required.", examples: [
    { title: "Meeting date and time", node: <MeetingScheduler onChange={() => toast.success("Meeting time selected")} />, code: '<MeetingScheduler onChange={setMeeting} />' },
  ], note: "The existing scheduler includes the date, time slots, and a confirmation step." },
  card: { use: "Group a related set of details within a dashboard or form.", avoid: "Every item on a page would become a card; prefer spacing and headings where enough.", examples: [
    { title: "Content card", node: <Card className="w-full max-w-sm"><CardHeader><CardTitle>Air quality</CardTitle><CardDescription>Latest monitoring result</CardDescription></CardHeader><CardContent><p className="text-[28px] font-semibold tracking-tight">Good</p><p className="mt-1 text-sm text-text-secondary">Updated 5 minutes ago</p></CardContent></Card>, code: '<Card>\n  <CardHeader><CardTitle>Air quality</CardTitle></CardHeader>\n  <CardContent>Latest result</CardContent>\n</Card>' },
  ], note: "This uses the existing JOINTS card primitive, with the current surface and border tokens." },
  alert: { use: "Explain an important outcome, warning, or condition near its related content.", avoid: "A brief routine confirmation can use a toast instead.", examples: [
    { title: "Semantic tones", node: <div className="grid w-full gap-3"><Alert tone="success" title="Report saved">Your team can now view the latest version.</Alert><Alert tone="info" title="Monitoring continues">New observations appear as they arrive.</Alert><Alert tone="warning" title="Check the data source">The last sync is older than expected.</Alert><Alert tone="danger" title="Upload failed">Try again with a supported file.</Alert></div>, code: '<Alert tone="success" title="Report saved">Your team can view it.</Alert>\n<Alert tone="warning" title="Check the data source">The last sync is old.</Alert>' },
  ], note: "This is a new JOINTS component. Color and icon reinforce the text rather than carrying meaning alone." },
  toast: { use: "Confirm a completed action or show a short recoverable error after an interaction.", avoid: "The message must remain visible as part of the page; use Alert or Notification.", examples: [
    { title: "Toast types", node: <><Button onClick={() => toast.success("Changes saved", { description: "Your latest settings are available." })}>Success</Button><Button variant="secondary" onClick={() => toast.info("Processing started")}>Info</Button><Button variant="secondary" onClick={() => toast.warning("Check the selected date")}>Warning</Button><Button variant="danger" onClick={() => toast.error("Could not save changes")}>Error</Button></>, code: 'import { toast } from "sonner";\n\ntoast.success("Changes saved");\ntoast.error("Could not save changes");' },
    { title: "Action and dismissal", node: <><Button variant="secondary" onClick={() => toast("Item archived", { action: { label: "Undo", onClick: () => toast.success("Archive undone") } })}>Archive with undo</Button><Button variant="ghost" onClick={() => toast.dismiss()}>Dismiss all</Button></>, code: 'toast("Item archived", { action: { label: "Undo", onClick: undoArchive } });\ntoast.dismiss();' },
  ], note: "Sonner is mounted once at the app root in the top-right position, styled with the dimensions of Alert components, tactile button gradients, and Apple specular inset highlights." },
  dialog: { use: "A decision or short form needs focus and a clear way to close.", avoid: "The task needs a long workflow or a separate page.", examples: [
    { title: "Confirmation modal", node: <Dialog><DialogTrigger className="rounded-[10px] bg-button-primary px-4 py-2 text-sm font-medium text-white shadow-xs">Open dialog</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Publish report?</DialogTitle><DialogDescription>Your team will be able to view the latest observations.</DialogDescription></DialogHeader><DialogFooter><DialogClose className="rounded-lg border border-border-button-default px-3 py-2 text-sm">Cancel</DialogClose><DialogClose onClick={() => toast.success("Report published")} className="rounded-lg bg-button-primary px-3 py-2 text-sm font-medium text-white">Publish report</DialogClose></DialogFooter></DialogContent></Dialog>, code: '<Dialog>\n  <DialogTrigger>Open dialog</DialogTrigger>\n  <DialogContent>\n    <DialogHeader>\n      <DialogTitle>Publish report?</DialogTitle>\n      <DialogDescription>Your team can view it.</DialogDescription>\n    </DialogHeader>\n    <DialogFooter><DialogClose>Cancel</DialogClose></DialogFooter>\n  </DialogContent>\n</Dialog>' },
  ], note: "The new JOINTS Dialog uses Base UI for focus management, Escape, and outside click behavior. The example confirms via Sonner." },
  command: { use: "People need a fast keyboard path to navigate or run a short action.", avoid: "A small local choice is better served by Select or Dropdown.", examples: [
    { title: "Global command menu", node: <><Button leadingIcon={RiSearchLine} onClick={() => window.dispatchEvent(new Event("joints:open-command"))}>Open command menu</Button><span className="text-sm text-text-secondary">Also press Ctrl/⌘ K anywhere in the design system.</span></>, code: '<CommandMenu open={open} onOpenChange={setOpen} actions={actions} />\n// Ctrl/⌘ K opens the same menu.' },
  ], note: "The command menu searches every documented page, supports arrow keys and Enter, and closes with Escape." },
  "empty-state": { use: "A list, search, or collection has no content and the next step is clear.", avoid: "The content is still loading; use Skeleton.", examples: [
    { title: "Empty collection", node: <div className="w-full"><EmptyState title="No monitoring sites yet" description="Add a site to start tracking observations." action={<Button leadingIcon={RiAddLine} onClick={() => toast.success("Add site selected")}>Add site</Button>} /></div>, code: '<EmptyState title="No monitoring sites yet" description="Add a site to start tracking observations." action={<Button onClick={addSite}>Add site</Button>} />' },
  ], note: "This is a new JOINTS component. Write the title for the missing content and the action for the next step." },
  separator: { use: "Split two groups that already have a clear relationship.", avoid: "Spacing alone gives enough separation.", examples: [
    { title: "Horizontal divider", node: <div className="w-full max-w-sm text-sm"><p>Current observations</p><Separator className="my-4" /><p>Earlier observations</p></div>, code: '<p>Current observations</p>\n<Separator className="my-4" />\n<p>Earlier observations</p>' },
  ], note: "Use the existing JOINTS separator to keep dividing lines consistent." },
  skeleton: { use: "The layout is known but content is still loading.", avoid: "The area is genuinely empty or the wait is indefinite; use an empty state or progress feedback.", examples: [
    { title: "Loading card", node: <div className="flex w-full max-w-sm items-center gap-3"><Skeleton className="size-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-4/5" /></div></div>, code: '<Skeleton className="size-10 rounded-full" />\n<Skeleton className="h-3 w-1/2" />' },
  ], note: "Match placeholder dimensions to the content that will replace them." },
  tooltip: { use: "Clarify a compact control or show a short hint on hover and keyboard focus.", avoid: "The information is essential for completing the task; show it inline.", examples: [
    { title: "Contextual help", node: <TooltipTrigger><Button variant="secondary">Hover or focus</Button><Tooltip>View the latest results</Tooltip></TooltipTrigger>, code: '<TooltipTrigger>\n  <Button variant="secondary">Hover or focus</Button>\n  <Tooltip>View the latest results</Tooltip>\n</TooltipTrigger>' },
  ], note: "Tooltip text should be short. The BoardUI primitive handles positioning and focus behavior." },
  sheet: { use: "Edit a focused set of details while keeping the current page visible.", avoid: "The task has many steps or needs a dedicated URL.", examples: [
    { title: "Side panel", node: <Sheet><SheetTrigger className="rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-sm shadow-xs">Open details</SheetTrigger><SheetContent><SheetHeader><SheetTitle>Site details</SheetTitle><SheetDescription>Review monitoring information.</SheetDescription></SheetHeader><div className="px-4 text-sm text-text-secondary">Additional details live here.</div></SheetContent></Sheet>, code: '<Sheet>\n  <SheetTrigger>Open details</SheetTrigger>\n  <SheetContent>\n    <SheetHeader><SheetTitle>Site details</SheetTitle></SheetHeader>\n  </SheetContent>\n</Sheet>' },
  ], note: "This uses the existing JOINTS sheet primitive. Keep the panel focused on one task." },
  "page-header": { use: "A page needs a title, short context, and one clear action.", avoid: "A small card or dialog only needs a local heading.", examples: [
    { title: "Page heading", node: <div className="w-full"><PageHeader eyebrow="Monitoring" title="Site overview" description="Inspect recent observations and reporting status." action={<Button leadingIcon={RiAddLine} onClick={() => toast.success("Add site selected")}>Add site</Button>} /></div>, code: '<PageHeader eyebrow="Monitoring" title="Site overview" description="Inspect recent observations." action={<Button onClick={addSite}>Add site</Button>} />' },
  ], note: "This is a new JOINTS composition. Reserve one primary action for the page header." },
  "status-badge": { use: "Show a named workflow or data state in a list or detail view.", avoid: "The badge is just a count; use Badge.", examples: [
    { title: "Status set", node: <><StatusBadge tone="success">Active</StatusBadge><StatusBadge tone="warning">Needs review</StatusBadge><StatusBadge tone="danger">Failed</StatusBadge><StatusBadge tone="info">Processing</StatusBadge><StatusBadge>Draft</StatusBadge></>, code: '<StatusBadge tone="success">Active</StatusBadge>\n<StatusBadge tone="warning">Needs review</StatusBadge>' },
  ], note: "This is a new JOINTS component. Always include the state word so color is supplemental." },
  table: { use: "Show a small structured set of rows that people need to scan.", avoid: "The dataset needs complex filtering, selection, and pagination; use Data table.", examples: [
    { title: "Compact table", node: <div className="w-full"><Table aria-label="Monitoring sites" size="sm"><TableHeader><TableColumn id="site" isRowHeader>Site</TableColumn><TableColumn id="status">Status</TableColumn><TableColumn id="updated">Updated</TableColumn></TableHeader><TableBody><TableRow id="a"><TableCell>North station</TableCell><TableCell><StatusBadge tone="success">Active</StatusBadge></TableCell><TableCell>Today</TableCell></TableRow><TableRow id="b"><TableCell>East station</TableCell><TableCell><StatusBadge tone="warning">Review</StatusBadge></TableCell><TableCell>Yesterday</TableCell></TableRow></TableBody></Table></div>, code: '<Table aria-label="Monitoring sites" size="sm">\n  <TableHeader>...</TableHeader>\n  <TableBody>...</TableBody>\n</Table>' },
  ], note: "The existing BoardUI table is built on React Aria and shares the app's compact density." },
  "data-table": { use: "A larger dataset needs sorting, filters, selection, and page controls.", avoid: "Only a few rows need display; use Table.", examples: [
    { title: "Reusable data table", node: <DataTable data={[{ id: "north", name: "North station", status: "Active" }, { id: "east", name: "East station", status: "Review" }]} columns={[{ accessorKey: "name", header: "Station" }, { accessorKey: "status", header: "Status" }]} label="Example monitoring stations" emptyMessage="No stations match the filters." pageSize={1} />, code: '<DataTable data={stations} columns={columns} label="Monitoring stations" emptyMessage="No stations match the filters." />' },
    { title: "Customer data table", node: <div className="w-full min-w-0 overflow-x-auto"><div className="min-w-[700px]"><DataTableExample pageSize={5} /></div></div>, code: '<DataTableExample pageSize={5} />' },
  ], note: "DataTable accepts typed rows, columns, a toolbar, and an empty message. The customer example also demonstrates filters, selection, and density." },
  "stat-cards": { use: "Show a few important metrics with their comparison context.", avoid: "The numbers need exploration; use a chart or table.", examples: [
    { title: "Dashboard metrics", node: <div className="w-full"><StatCards count={2} columns={2} /></div>, code: '<StatCards count={2} columns={2} />' },
  ], note: "The existing BoardUI stat cards are available in plain and footer variants." },
  "recent-hires-card": { use: "Show a short snapshot of people who recently joined a team.", avoid: "The list needs searching or complex sorting; use a table.", examples: [
    { title: "Recent hires", node: <div className="w-full"><RecentHiresCard /></div>, code: '<RecentHiresCard hires={hires} total={56} />' },
  ], note: "The four visible people, 95px inner tiles, 8px spacing, and paging controls follow the supplied BoardUI Home export." },
  "home-chart-card": { use: "Compare month-by-month earnings or show a compact revenue trend.", avoid: "The values need detailed analysis; use a full chart view.", examples: [
    { title: "Earned so far", node: <div className="w-full"><HomeChartCard kind="earned" /></div>, code: '<HomeChartCard kind="earned" />' },
    { title: "Revenue", node: <div className="w-full"><HomeChartCard kind="revenue" /></div>, code: '<HomeChartCard kind="revenue" />' },
  ], note: "Both 16px inset cards reproduce the BoardUI Home chart proportions. The period selector is interactive." },
  "contributions-card": { use: "Summarize activity across the year with supporting totals.", avoid: "The exact dates or records need to be read; use a table or calendar.", examples: [
    { title: "Contributions and activity", node: <div className="w-full"><ContributionsCard /></div>, code: '<ContributionsCard />' },
  ], note: "Four 60px summary tiles sit above the export's seven-row, 37-column activity grid." },
  "revenue-chart-card": { use: "Show a revenue trend with historical comparison.", avoid: "The data is categorical rather than a time series.", examples: [
    { title: "Revenue trend", node: <div className="w-full"><RevenueChartCard /></div>, code: '<RevenueChartCard />' },
  ], note: "Use the chart card for a time series and provide meaningful data labels." },
  "orders-chart-card": { use: "Show order volume over time in a dashboard.", avoid: "The data is a small single number; use a stat card.", examples: [
    { title: "Orders trend", node: <div className="w-full"><OrdersChartCard /></div>, code: '<OrdersChartCard />' },
  ], note: "Use the existing chart card and its current green accent theme." },
};

const colorTokens = [
  ["Action", "--board-primary-gradient", "Primary action"], ["Accent", "--board-green", "Selection and focus"], ["Canvas", "--background", "Page background"], ["Surface", "--muted", "Inset areas"], ["Control", "--secondary", "Quiet controls"], ["Ink", "--foreground", "Primary text"], ["Secondary", "--muted-foreground", "Supporting text"], ["Success", "--success", "Positive state"], ["Warning", "--warning", "Attention"], ["Danger", "--destructive", "Error state"],
] as const;

export function DocContent({ slug }: { slug: string }) {
  if (slug === "") return <>
    <div className="rounded-[18px] border border-border-button-default bg-background-secondary-default p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-600">A living catalog</p><h2 className="mt-2 text-[22px] font-semibold tracking-tight">Build with one shared language</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary">JOINTS combines the BoardUI visual language from the supplied export with the components already used in Arkamap. Each page shows a live component, its source, and guidance for using it.</p><div className="mt-6 flex flex-wrap gap-2"><Button leadingIcon={RiArrowRightLine} onClick={() => { window.location.href = hrefFor("button"); }}>Explore buttons</Button><Button variant="secondary" onClick={() => { window.location.href = hrefFor("colors"); }}>View foundations</Button></div></div>
    <DocSection id="library" title="Explore the library" description="A curated set for Arkamap, organized around foundations, reusable controls, data display, and page patterns."><div className="grid gap-3 sm:grid-cols-2">{groups.map(group => <div key={group} className="rounded-xl border border-border-button-default bg-background-primary-default p-5"><p className="text-lg font-semibold">{group}</p><p className="mt-1 text-sm text-text-secondary">{docs.filter(item => item.group === group).length} documented pages</p><a href={hrefFor(docs.find(item => item.group === group && item.slug)?.slug ?? "")} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent-600">Browse <RiArrowRightLine className="size-4" /></a></div>)}</div></DocSection>
    <DocSection id="principles" title="Working principles"><div className="grid gap-3 sm:grid-cols-2"><Principle number="01" title="Use the source" text="Reuse the existing component before creating a new variant. Component pages point to their implementation." /><Principle number="02" title="Keep actions clear" text="A green primary action draws attention; quiet surfaces let data and content lead." /><Principle number="03" title="Name every state" text="Status labels and supporting text carry meaning alongside color." /><Principle number="04" title="Stay compact" text="Inter, modest radii, and close spacing suit the app's dense views." /></div></DocSection>
  </>;
  if (slug === "colors") return <><DocSection id="palette" title="Semantic palette" description="These swatches resolve the actual CSS variables, so the page follows future token changes."><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{colorTokens.map(([name, token, use]) => <div key={token} className="overflow-hidden rounded-xl border border-border-button-default"><div className="h-20" style={{ background: `var(${token})` }} /><div className="p-3"><p className="text-sm font-medium">{name}</p><p className="text-xs text-text-secondary">{use}</p><code className="mt-1 block text-[11px] text-text-tertiary">{token}</code></div></div>)}</div></DocSection><DocSection id="usage" title="Color usage"><UsageGuide use="Use semantic tokens for surfaces, text, borders, selection, and states. Let the green gradient identify primary actions." avoid="Hardcoding green or status colors in feature pages, or using color without a text label." /></DocSection></>;
  if (slug === "typography") return <><DocSection id="scale" title="Type scale"><div className="divide-y divide-border-button-default rounded-xl border border-border-button-default bg-background-primary-default px-5">{[["Display", "32px", "text-[32px] font-semibold tracking-[-0.035em]"], ["Heading", "24px", "text-[24px] font-semibold tracking-tight"], ["Section", "20px", "text-[20px] font-semibold tracking-tight"], ["Body", "14px", "text-[14px] leading-6"], ["Caption", "12px", "text-[12px]"]].map(([label, size, cls]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-3 py-5"><p className={cls}>The quick brown fox</p><span className="text-xs text-text-tertiary">{label} · {size}</span></div>)}</div></DocSection><DocSection id="usage" title="Typography usage"><UsageGuide use="Use Inter Variable with a compact body size, clear heading hierarchy, and muted supporting copy." avoid="Using weight and size to create too many competing headings in one view." /></DocSection></>;
  if (slug === "spacing") return <><DocSection id="rhythm" title="Spacing rhythm"><div className="space-y-3 rounded-xl border border-border-button-default p-5">{[4, 6, 8, 10, 12, 16, 20, 24, 32].map(value => <div key={value} className="flex items-center gap-4 text-xs"><span className="w-8 text-text-tertiary">{value}</span><span className="h-3 rounded-sm bg-accent-500" style={{ width: value * 5 }} /></div>)}</div></DocSection><DocSection id="surfaces" title="Surfaces and shape"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-[10px] border border-border-button-default bg-background-primary-default p-5 shadow-xs">Control · 10px radius</div><div className="rounded-[12px] border border-border-button-default bg-background-secondary-default p-5">Inset · 12px radius</div><div className="rounded-[16px] border border-border-button-default bg-background-primary-default p-5 shadow-xs">Card · 16px radius</div></div></DocSection></>;
  if (slug === "icons") return <><DocSection id="scale" title="Icon language" description="Familiar shapes keep actions recognizable across the product."><div className="grid gap-3 sm:grid-cols-2">{[[RiSearchLine, "Search", "Find content or a command"], [RiAddLine, "Add", "Create an item"], [RiCheckLine, "Success", "Confirm a finished action"], [RiInformationLine, "Information", "Explain a condition"], [RiSettings3Line, "Settings", "Adjust preferences"], [RiUserLine, "Person", "Identify a profile"]].map(([Icon, label, detail]) => <div key={label as string} className="flex items-center gap-4 rounded-xl border border-border-button-default bg-background-primary-default p-4"><span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-background-secondary-default text-text-primary"><Icon className="size-5" aria-hidden="true" /></span><span><strong className="block text-sm font-medium">{label as string}</strong><span className="text-xs text-text-secondary">{detail as string}</span></span></div>)}</div></DocSection><DocSection id="usage" title="Icon usage"><UsageGuide use="Use one consistent icon family at 16 or 20 pixels. Give icon-only controls an accessible name and a clear focus state." avoid="Using an icon alone to communicate a status or obscure action." /></DocSection></>;
  if (slug === "surfaces") return <><DocSection id="layers" title="Surface layers" description="These samples use the live theme tokens."><div className="grid gap-3 sm:grid-cols-3">{[["Canvas", "--color-background-full", "App shell background"], ["Inset", "--color-background-secondary-default", "Quiet grouped content"], ["Elevated", "--color-background-primary-default", "Menus, cards, and dialogs"]].map(([label, token, detail], index) => <div key={label} className={`rounded-2xl border border-border-button-default p-5 ${index === 2 ? "shadow-lg" : ""}`} style={{ background: `var(${token})` }}><div className="mb-9 size-8 rounded-lg border border-border-button-default bg-background-secondary-default" /><strong className="block text-sm font-semibold">{label}</strong><span className="mt-1 block text-xs text-text-secondary">{detail}</span><code className="mt-3 block text-[11px] text-text-tertiary">{token}</code></div>)}</div></DocSection><DocSection id="usage" title="Depth and boundaries"><UsageGuide use="Use a raised surface when it needs to sit above nearby content. Keep borders quiet and shadows subtle." avoid="Stacking multiple elevated cards when spacing or a shared section can group the content." /></DocSection></>;
  if (slug === "app-shell") return <><DocSection id="usage" title="Usage"><UsageGuide use="Use this workspace frame for an application area with several related views, shared search, notifications, and a primary action." avoid="Wrapping a single task or standalone form in a full navigation shell." /></DocSection><DocSection id="examples" title="Interactive example" description="Change views, search, filter reports, create a draft, and try the mobile navigation. The same component fills the full-page preview."><div className="mb-4"><a href="/app-shell" className="inline-flex items-center gap-1 rounded-lg text-sm font-medium text-accent-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-500">Open full-page preview <RiArrowRightLine className="size-4" aria-hidden /></a></div><div className="w-full"><AppShellDemo embedded /></div></DocSection><DocSection id="guidance" title="Guidance"><p className="max-w-[66ch] text-sm leading-7 text-text-secondary">The shell follows the BoardUI template's floating sidebar, breadcrumb, compact header, green selected state, and quiet dashboard surfaces. Navigation and actions are supplied by the application. On small screens, the sidebar becomes a focus-managed drawer; reduced motion removes its movement.</p></DocSection></>;
  if (slug === "login-modal") return <LoginModalDoc />;
  if (extensionSlugs.has(slug)) return <ExtensionContent slug={slug} />;
  const item = componentContent[slug];
  if (!item) {
    return <><DocSection id="usage" title="Usage"><p className="text-sm leading-7 text-text-secondary">Use this component for the purpose described above. Its existing source file is linked under the page title.</p></DocSection><DocSection id="examples" title="Live example" description="This reuses the existing BoardUI preview and component implementation."><ComponentPreview title="Interactive preview"><div className="relative h-[260px] w-full overflow-hidden rounded-lg bg-background-secondary-default"><Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-text-secondary">Loading preview...</div>}><CatalogPreview slug={slug} /></Suspense></div></ComponentPreview></DocSection><DocSection id="guidance" title="Guidance"><p className="text-sm leading-7 text-text-secondary">Use the source component in this codebase and keep its appearance consistent with the green accent tokens.</p></DocSection></>;
  }
  return <><DocSection id="usage" title="Usage"><UsageGuide use={item.use} avoid={item.avoid} /></DocSection><DocSection id="examples" title="Examples" description="Live examples use the real components from the codebase."><div className="space-y-4">{item.examples.map(example => <ComponentPreview key={example.title} title={example.title} code={example.code}>{example.node}</ComponentPreview>)}</div></DocSection><DocSection id="guidance" title="Guidance"><p className="max-w-[66ch] text-sm leading-7 text-text-secondary">{item.note}</p></DocSection></>;
}

function LoginModalDoc() {
  return <>
    <DocSection id="usage" title="Usage"><UsageGuide use="Use the existing modal for an in-workspace sign-in preview." avoid="Treating the preview form as connected authentication." /></DocSection>
    <DocSection id="examples" title="Interactive modal preview" description="The preview and copyable source use the same example module.">
      <ComponentPreview title="Login modal" code={loginModalExampleSource}><LoginModalExample /></ComponentPreview>
    </DocSection>
    <DocSection id="guidance" title="Integration boundary"><p className="max-w-[66ch] text-sm leading-7 text-text-secondary">Authentication, account creation, SSO, and station telemetry require backend integrations. The modal currently demonstrates interface behavior and simulated content.</p></DocSection>
  </>;
}

function Principle({ number, title, text }: { number: string; title: string; text: string }) { return <div className="rounded-xl border border-border-button-default bg-background-primary-default p-5"><span className="text-xs font-semibold text-accent-600">{number}</span><h3 className="mt-2 text-base font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{text}</p></div>; }

function DropdownDemo() {
  const [open, setOpen] = useState(false);
  const choose = (message: string) => { setOpen(false); toast.success(message); };
  return <Dropdown isOpen={open} onOpenChange={setOpen}><DropdownButton>More actions</DropdownButton><DropdownPopover aria-label="Report actions"><DropdownGroup label="Report"><DropdownItem onSelect={() => choose("Report exported")}>Export report</DropdownItem><DropdownItem onSelect={() => choose("Link copied")}>Copy link</DropdownItem></DropdownGroup></DropdownPopover></Dropdown>;
}

function PaginationDemo() {
  const [page, setPage] = useState(3);
  return <div className="w-full"><p className="mb-3 text-sm text-text-secondary">Showing page {page} of 10</p><Pagination page={page} totalPages={10} onChange={setPage} /></div>;
}
