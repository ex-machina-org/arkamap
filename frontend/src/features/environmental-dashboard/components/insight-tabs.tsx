import { Tab, TabList, TabPanel, Tabs } from "@/components/base/tabs/tabs";
import { alertCount, type InsightTab } from "../insights";
import type { DashboardView } from "../types";
import { AlertList } from "./alert-list";
import { cardClass } from "./dashboard-card";
import { EventList } from "./event-list";

const LABELS: Record<InsightTab, string> = { ranking: "Peringkat", events: "Kejadian", alerts: "Peringatan" };

export type ListTab = Exclude<InsightTab, "ranking">;

/** One tabbed card for the list-style panels of the profile's mode, in the order the backend sends them. */
export function InsightTabs({ view, tabs }: { view: DashboardView; tabs: ListTab[] }) {
  const counts: Record<ListTab, number> = {
    events: view.events.reduce((sum, event) => sum + event.top.length, 0),
    alerts: alertCount(view.alerts),
  };
  return <section aria-label="Sorotan wilayah" className={`${cardClass} h-full gap-3`}>
    <Tabs key={`${view.profile_id}:${tabs.join()}`} defaultSelectedKey={tabs[0]} className="min-h-0 flex-1">
      <TabList aria-label="Sorotan wilayah">{tabs.map(id => <Tab key={id} id={id} count={counts[id]}>{LABELS[id]}</Tab>)}</TabList>
      {tabs.map(id => <TabPanel key={id} id={id} className="min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
        {id === "events" ? <EventList events={view.events} /> : <AlertList alerts={view.alerts} />}
      </TabPanel>)}
    </Tabs>
  </section>;
}
