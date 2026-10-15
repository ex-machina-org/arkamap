"use client";

import {
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiBroadcastLine,
  RiCloseLine,
  RiCompass3Line,
  RiCustomerServiceLine,
  RiDatabase2Line,
  RiDashboardLine,
  RiEqualizerLine,
  RiFireLine,
  RiMapPinLine,
  RiRadarLine,
  RiSettings4Line,
  RiSideBarFill,
  RiWaterPercentLine,
  RiWindyLine,
} from "@remixicon/react";
import { ArkamapLockup, ArkamapMark } from "@/components/foundations/brand/arkamap-brand";
import { ArkamapSettingsModal, type ArkamapSettingsPage } from "@/components/application/settings/arkamap-settings";
import { SettingsModal } from "@/components/application/settings/settings-modal";
import { Badge } from "@/components/base/badges/badge";
import { FluidHoverHighlight } from "@/components/base/fluid-hover/fluid-hover-highlight";
import { useFluidHover } from "@/hooks/use-fluid-hover";
import type { ProfileOption } from "@/hooks/use-profile-switcher";
import { cx } from "@/utils/cx";
import type { EnvironmentalMode } from "./dashboard-mode-switcher";
import { DashboardSuperintelligenceButton } from "./dashboard-superintelligence-button";
import { DashboardTeamMenu } from "./dashboard-team-menu";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/**
 * Collapsible text/badge slot: blurs + fades + shrinks away when the rail
 * closes, and blurs back in on expand.
 */
function Collapsible({
  collapsed,
  children,
  className,
}: {
  collapsed: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out",
        collapsed ? "max-w-0 opacity-0 blur-[3px]" : "max-w-full opacity-100 blur-0",
        className,
      )}
    >
      {children}
    </span>
  );
}

function NavItem({
  icon: Icon,
  label,
  badge,
  isSelected = false,
  danger = false,
  collapsed = false,
  href = "#",
  onClick,
  rowRef,
}: {
  icon: IconComponent;
  label: string;
  badge?: ReactNode;
  isSelected?: boolean;
  danger?: boolean;
  collapsed?: boolean;
  href?: string;
  onClick?: () => void;
  /** Registers the row with a fluid hover list, whose highlight replaces the CSS hover fill. */
  rowRef?: Ref<HTMLAnchorElement>;
}) {
  return (
    <a
      ref={rowRef}
      href={href}
      onClick={
        onClick
          ? (event) => {
              event.preventDefault();
              onClick();
            }
          : undefined
      }
      aria-current={isSelected ? "page" : undefined}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={cx(
        "relative flex items-center justify-between gap-2 overflow-hidden rounded-2lg p-2",
        "transition-[width,background-color] duration-200 ease-in-out",
        collapsed ? "w-9" : "w-full",
        isSelected
          ? "bg-linear-to-b from-accent-500 to-accent-600 text-white font-medium shadow-nav-selected"
          : danger
            ? "bg-notification-error-background font-medium text-text-error-primary hover:opacity-90"
            : cx("text-text-secondary hover:text-text-primary", !rowRef && "hover:bg-background-secondary-hover"),
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          className={cx("size-5 shrink-0", isSelected ? "text-white" : danger ? "text-foreground-icon-error" : "text-foreground-icon-secondary")}
          aria-hidden
        />
        <Collapsible collapsed={collapsed}>
          {/* A long label gives way to the badge instead of running under it. */}
          <span className="truncate text-body-medium">
            {label}
          </span>
        </Collapsible>
      </span>
      {badge && <Collapsible collapsed={collapsed} className="shrink-0">{badge}</Collapsible>}
    </a>
  );
}

export interface DashboardNavChild {
  key: string;
  label: string;
  icon?: IconComponent;
  href?: string;
  badge?: string | number;
  onClick?: () => void;
}

/** A primary navigation row with optional section heading and collapsible sub-items. */
export interface DashboardNavItem {
  key: string;
  label: string;
  icon: IconComponent;
  href?: string;
  badge?: string | number;
  /** "danger" paints the row red while something needs attention there. */
  tone?: "danger";
  section?: string;
  children?: DashboardNavChild[];
  onClick?: () => void;
}

export type DashboardNavKey = string;

/** The default contextual environmental navigation matching the reference layout. */
export const DASHBOARD_NAV: DashboardNavItem[] = [
  {
    key: "overview",
    label: "Dashboard",
    icon: RiDashboardLine,
    href: "/dashboard",
    section: "Pemantauan",
  },
  {
    key: "map",
    label: "Peta Interaktif",
    icon: RiMapPinLine,
    href: "/map",
    section: "Pemantauan",
  },
  {
    key: "hazard-analysis",
    label: "Analisis Aktivitas",
    icon: RiCompass3Line,
    section: "Pemantauan",
    children: [
      { key: "responder", label: "Hotspot VIIRS", icon: RiFireLine, href: "/dashboard?mode=responder", badge: "3" },
      { key: "protect", label: "Inundasi Banjir", icon: RiWaterPercentLine, href: "/dashboard?mode=protect", badge: "2" },
      { key: "sensors", label: "Sensor TMA & IoT", icon: RiBroadcastLine, href: "/dashboard?mode=sensors", badge: "140" },
      { key: "plan", label: "Kualitas Udara", icon: RiWindyLine, href: "/dashboard?mode=plan" },
    ],
  },
  {
    key: "simulator",
    label: "Simulator Spasial",
    icon: RiEqualizerLine,
    href: "/dashboard?tab=simulator",
    section: "Analisis",
  },
  {
    key: "forensics",
    label: "Forensik Radar",
    icon: RiRadarLine,
    href: "/dashboard?tab=forensics",
    section: "Analisis",
  },
  {
    key: "reports",
    label: "Laporan Data",
    icon: RiDatabase2Line,
    href: "/dashboard?tab=table",
    section: "Data",
  },
  {
    key: "design-system",
    label: "Katalog Sistem",
    icon: RiCompass3Line,
    href: "/design-system",
    section: "Data",
  },
];

/**
 * Sectioned and nested navigation rows.
 */
function NavRows({
  items,
  selected,
  collapsed,
  onNavigate,
}: {
  items: DashboardNavItem[];
  selected: string;
  collapsed: boolean;
  onNavigate?: (key: string) => void;
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    items.forEach((item) => {
      if (item.children?.some((c) => c.key === selected)) {
        initial.add(item.key);
      }
    });
    const firstWithChildren = items.find((i) => i.children && i.children.length > 0);
    if (firstWithChildren) initial.add(firstWithChildren.key);
    return initial;
  });

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sections = new Map<string, DashboardNavItem[]>();
  items.forEach((item) => {
    const sec = item.section || "";
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(item);
  });

  return (
    <div className="flex w-full flex-col gap-3">
      {Array.from(sections.entries()).map(([sectionName, sectionItems], index) => (
        <NavSection
          key={sectionName || "main"}
          name={sectionName}
          index={index}
          items={sectionItems}
          selected={selected}
          collapsed={collapsed}
          expandedKeys={expandedKeys}
          onToggle={toggleExpand}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

/**
 * One section's rows, sub-items included, share a single fluid hover
 * highlight. Sections stay separate lists because their headings divide
 * different groups of destinations.
 */
function NavSection({
  name,
  index,
  items,
  selected,
  collapsed,
  expandedKeys,
  onToggle,
  onNavigate,
}: {
  name: string;
  index: number;
  items: DashboardNavItem[];
  selected: string;
  collapsed: boolean;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  onNavigate?: (key: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // A click on the section heading should not navigate; only the 4px gaps
  // between rows route to the lit row.
  const hover = useFluidHover(containerRef, { gapClick: { maxDistance: 4 } });
  // One stable callback ref per row index, so rows do not re-register on
  // every render.
  const [rowRefs] = useState(() => new Map<number, (element: HTMLElement | null) => void>());
  const rowRef = (rowIndex: number) => {
    let ref = rowRefs.get(rowIndex);
    if (!ref) {
      ref = (element) => hover.registerItem(rowIndex, element);
      rowRefs.set(rowIndex, ref);
    }
    return ref;
  };

  // Rows in visual order: each item, then its sub-items while expanded.
  const rowKeys: string[] = [];
  const subItemRows = new Set<number>();
  items.forEach((item) => {
    rowKeys.push(item.key);
    if (item.children?.length && expandedKeys.has(item.key) && !collapsed) {
      item.children.forEach((child) => {
        subItemRows.add(rowKeys.length);
        rowKeys.push(child.key);
      });
    }
  });
  const selectedRow = rowKeys.indexOf(selected === "home" ? "overview" : selected);

  const rows = items.map((item) => {
    const hasChildren = item.children && item.children.length > 0;
    const isChildSelected = item.children?.some((c) => c.key === selected);
    const isSelected = selected === item.key || (selected === "home" && item.key === "overview");
    const isExpanded = expandedKeys.has(item.key);
    const itemRow = rowKeys.indexOf(item.key);

    if (hasChildren) {
      return (
        <div key={item.key} className="flex flex-col gap-0.5">
          <button
            ref={rowRef(itemRow)}
            type="button"
            onClick={() => onToggle(item.key)}
            aria-expanded={isExpanded}
            aria-label={item.label}
            title={collapsed ? item.label : undefined}
            className={cx(
              "relative flex items-center justify-between overflow-hidden rounded-2lg p-2 text-left cursor-pointer transition-colors duration-150",
              collapsed ? "w-9" : "w-full",
              isChildSelected
                ? "text-text-primary font-medium bg-background-secondary-hover/70"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <item.icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <Collapsible collapsed={collapsed}>
                <span className="text-body-medium whitespace-nowrap">
                  {item.label}
                </span>
              </Collapsible>
            </span>

            <Collapsible collapsed={collapsed}>
              {isExpanded ? (
                <RiArrowDownSLine className="size-4 shrink-0 text-foreground-icon-tertiary" />
              ) : (
                <RiArrowRightSLine className="size-4 shrink-0 text-foreground-icon-tertiary" />
              )}
            </Collapsible>
          </button>

          {isExpanded && !collapsed && (
            <div className="flex flex-col gap-0.5 pl-4 ml-3 border-l border-border-button-default/60">
              {item.children!.map((child) => {
                const isChildActive = selected === child.key;
                const ChildIcon = child.icon;
                const childRow = rowKeys.indexOf(child.key);
                return (
                  <a
                    key={child.key}
                    ref={rowRef(childRow)}
                    href={child.href || "#"}
                    onClick={
                      child.onClick
                        ? (e) => {
                            e.preventDefault();
                            child.onClick!();
                          }
                        : onNavigate
                          ? (e) => {
                              e.preventDefault();
                              onNavigate(child.key);
                            }
                          : undefined
                    }
                    aria-current={isChildActive ? "page" : undefined}
                    className={cx(
                      "relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      isChildActive
                        ? "bg-accent-500/15 font-medium text-accent-700 dark:text-accent-300"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {ChildIcon && <ChildIcon className="size-4 shrink-0" aria-hidden />}
                      <span className="truncate">{child.label}</span>
                    </span>
                    {child.badge && (
                      <Badge color={isChildActive ? "primary" : "neutral"} className="text-[10px] px-1 py-0">
                        {child.badge}
                      </Badge>
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavItem
        key={item.key}
        rowRef={rowRef(itemRow)}
        icon={item.icon}
        label={item.label}
        href={item.href}
        onClick={
          item.onClick
            ? item.onClick
            : onNavigate
              ? () => onNavigate(item.key)
              : undefined
        }
        isSelected={isSelected}
        danger={item.tone === "danger"}
        collapsed={collapsed}
        badge={
          item.badge !== undefined ? (
            <Badge color={item.tone === "danger" ? "danger" : isSelected ? "primary" : "neutral"}>{item.badge}</Badge>
          ) : undefined
        }
      />
    );
  });

  return (
    <div ref={containerRef} className="relative flex w-full flex-col gap-1" {...hover.handlers}>
      <FluidHoverHighlight
        hover={hover}
        // A fresh pointer entry fades in from the active route.
        from={selectedRow >= 0 ? hover.itemRects[selectedRow] : null}
        className={cx(
          "bg-background-secondary-hover",
          hover.activeIndex !== null && subItemRows.has(hover.activeIndex) ? "rounded-lg" : "rounded-2lg",
        )}
      />
      {name && (
        <>
          {/* The heading is hidden when the rail collapses, so a hairline keeps the groups apart. */}
          {collapsed && index > 0 && <div role="separator" className="mx-auto h-px w-5 bg-border-button-default" />}
          <Collapsible collapsed={collapsed}>
            <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {name}
            </div>
          </Collapsible>
        </>
      )}
      {rows}
    </div>
  );
}

export interface DashboardSidebarProps {
  mobile?: boolean;
  onClose?: () => void;
  fluid?: boolean;
  showThemeToggle?: boolean;
  showSecondaryNav?: boolean;
  selected?: DashboardNavKey;
  items?: DashboardNavItem[];
  flat?: boolean;
  appName?: string;
  appSubtitle?: string;
  activeMode?: EnvironmentalMode;
  onModeChange?: (mode: EnvironmentalMode) => void;
  onSuperintelligenceClick?: () => void;
  onNavigate?: (key: string) => void;
  className?: string;
  identity?: { name: string; role: string; avatarSrc?: string };
  onAccountAction?: (label: string) => void;
  profiles?: ProfileOption[];
}

export function DashboardSidebar({
  mobile = false,
  onClose,
  fluid = false,
  showThemeToggle = true,
  showSecondaryNav = false,
  selected = "overview",
  items = DASHBOARD_NAV,
  flat = false,
  appName = "Arkamap",
  appSubtitle: _appSubtitle = "JOINTS 2026",
  onSuperintelligenceClick,
  onNavigate,
  className, identity, onAccountAction, profiles,
}: DashboardSidebarProps = {}) {
  const [collapsedState, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The signed-in user's settings; undefined while closed. */
  const [appSettings, setAppSettings] = useState<ArkamapSettingsPage>();
  const collapsed = mobile ? false : collapsedState;

  return (
    <aside
      className={cx(
        "flex h-full shrink-0 flex-col justify-between overflow-hidden",
        flat
          ? "bg-background-full"
          : "rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar",
        "transition-[width] duration-300 ease-in-out",
        collapsed
          ? "w-[60px] px-[11px] py-3"
          : fluid
            ? "w-full p-3 lg:w-[260px]"
            : "w-[260px] p-3",
        className,
      )}
    >
      <div className="-m-2 flex min-h-0 w-[calc(100%+16px)] flex-col gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
        {/* 1. Top Header: Raw Logo + App Name on left, Rounded Toggle Button on right (Matching reference) */}
        <div
          className={cx(
            "flex w-full items-center border-b border-border-button-default/70 py-2",
            collapsed ? "justify-center px-0" : "justify-between px-1",
          )}
        >
          <div className={cx("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-2.5")}>
            <button
              type="button"
              onClick={() => collapsed && setCollapsed(false)}
              className="flex shrink-0 items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring rounded-lg transition-transform hover:scale-105"
              aria-label={collapsed ? "Expand sidebar" : `${appName} logo`}
            >
              {collapsed ? <ArkamapMark /> : <ArkamapLockup />}
            </button>

          </div>

          {mobile ? (
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={onClose}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-primary-default text-text-secondary hover:text-text-primary hover:bg-background-secondary-hover shadow-xs cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring transition-colors"
            >
              <RiCloseLine className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsedState)}
              className={cx(
                "flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-primary-default text-text-secondary hover:text-text-primary hover:bg-background-secondary-hover shadow-xs cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring transition-colors",
                collapsed && "hidden",
              )}
            >
              <RiSideBarFill
                className="size-4.5 text-foreground-icon-secondary -scale-x-100"
                aria-hidden
              />
            </button>
          )}
        </div>

        {/* 2. Original AI Button Component (Superintelligence) in layout */}
        <div className={cx("w-full", !collapsed && "px-0.5")}>
          <DashboardSuperintelligenceButton
            isSelected={selected === "siri-map" || selected === "superintelligence" || selected === "assistant"}
            collapsed={collapsed}
            onClick={onSuperintelligenceClick}
          />
        </div>

        {/* Same hairline as under the logo, so the AI entry reads as its own block. */}
        <div role="separator" className="h-px w-full shrink-0 bg-border-button-default/70" />

        {/* 3. Grouped Navigation Rows (NO searchbar) */}
        <nav className={cx("flex w-full flex-col gap-1", !collapsed && "px-0.5")}>
          <NavRows
            items={items}
            selected={selected}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </nav>
      </div>

      {/* 4. Bottom Area: the account card; its menu carries the theme switch. */}
      <div className="flex w-full shrink-0 flex-col gap-2 pt-2">
        {showSecondaryNav && (
          <nav className="flex w-full flex-col gap-0.5">
            <NavItem icon={RiCustomerServiceLine} label="Support" collapsed={collapsed} />
            <NavItem
              icon={RiSettings4Line}
              label="Settings"
              collapsed={collapsed}
              onClick={() => setSettingsOpen(true)}
            />
          </nav>
        )}

        {/* User Profile Card (Mahardika S.T. with RiMore2Line) */}
        <DashboardTeamMenu
          identity={identity}
          onAction={onAccountAction}
          profiles={profiles}
          showTheme={showThemeToggle}
          onSettings={identity ? (page) => setAppSettings(page ?? "account") : undefined}
          collapsed={collapsed}
          className={flat ? "!bg-background-secondary-default" : undefined}
        />
      </div>

      <ArkamapSettingsModal
        isOpen={appSettings !== undefined}
        onClose={() => setAppSettings(undefined)}
        defaultPage={appSettings}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        planArtSrc="/templates/settings-plan-art.png"
      />
    </aside>
  );
}
