import type { ComponentType, ReactNode } from "react";
import { RiDashboardLine, RiMap2Line } from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MapNavigationItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
};

export function MapAppShell({ navigation, activeId, onNavigate, panel, children }: {
  navigation: MapNavigationItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  panel: ReactNode;
  children: ReactNode;
}) {
  return <div className="map-workspace">
    <a className="map-skip-link" href="#map-context">Lewati navigasi</a>
    <nav className="map-rail" aria-label="Navigasi ruang peta">
      <ButtonLink href="/map" variant="ghost" iconOnly leadingIcon={RiMap2Line} aria-label="Peta Spasial" title="Peta Spasial" className="map-rail-brand" />
      <div className="map-rail-links">
        <Tooltip><TooltipTrigger render={<ButtonLink href="/dashboard" variant="ghost" iconOnly leadingIcon={RiDashboardLine} aria-label="Dashboard" />} /><TooltipContent side="right">Dashboard</TooltipContent></Tooltip>
        {navigation.map(item => <Tooltip key={item.id}>
          <TooltipTrigger render={<Button variant="ghost" iconOnly leadingIcon={item.icon} aria-label={item.label} aria-current={activeId === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)} className={activeId === item.id ? "map-rail-selected" : ""} />} />
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>)}
      </div>
      <div className="map-rail-footer"><ThemeToggle collapsed /><span className="map-team-avatar" title="Tim Ex Machina">EX</span></div>
    </nav>
    <aside className="map-context" id="map-context" aria-label="Konteks dan analisis wilayah" tabIndex={-1}>{panel}</aside>
    <main className="map-canvas" aria-label="Peta analisis lingkungan">{children}</main>
  </div>;
}
