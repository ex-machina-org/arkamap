import type { DTO } from "@/lib/api/client";

export type DashboardData = DTO<"Dashboard">;
export type DashboardView = DTO<"DashboardView">;
export type EventKind = DashboardView["events"][number]["kind"];
export type PanelId = DTO<"ModeInfo">["panels"][number];
