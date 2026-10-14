import { RiAlarmWarningLine, RiBroadcastLine, RiDashboardLine, RiDatabase2Line, RiMapPinLine } from "@remixicon/react";
import type { AppShellNavItem } from "@/components/application/app-shell/joints-app-shell";
import { INITIAL_DEVICES } from "./device-data";

/** The primary sidebar below the AI button, shared by the dashboard and the Jev chat. Dashboard stands alone; the rest are grouped. */
export const NAVIGATION_ITEMS: AppShellNavItem[] = [
  {
    id: "overview",
    label: "Dashboard",
    icon: RiDashboardLine,
  },
  {
    id: "map",
    label: "Peta",
    icon: RiMapPinLine,
    href: "/map",
    section: "Pantauan",
  },
  {
    id: "alerts",
    label: "Pemantauan & Peringatan",
    icon: RiAlarmWarningLine,
    href: "/alerts",
    section: "Pantauan",
  },
  {
    id: "sensors",
    label: "Perangkat IoT & BYOD",
    icon: RiBroadcastLine,
    badge: String(INITIAL_DEVICES.length),
    section: "Data",
  },
  {
    id: "sources",
    label: "Sumber Data",
    icon: RiDatabase2Line,
    href: "/sources",
    section: "Data",
  },
];
