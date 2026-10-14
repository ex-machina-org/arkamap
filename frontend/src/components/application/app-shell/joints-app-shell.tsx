import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  RiCompass3Line,
  RiDashboardLine,
  RiDatabase2Line,
  RiEqualizerLine,
  RiFileTextLine,
  RiFolderLine,
  RiHomeLine,
  RiMenuLine,
  RiSearchLine,
} from "@remixicon/react";
import { DashboardSidebar, type DashboardNavItem } from "@/components/application/dashboard/dashboard-sidebar";
import type { EnvironmentalMode } from "@/components/application/dashboard/dashboard-mode-switcher";
import type { ProfileOption } from "@/hooks/use-profile-switcher";
import { Breadcrumb, BreadcrumbItem } from "@/components/base/breadcrumb/breadcrumb";
import { Button } from "@/components/base/buttons/button";
import { Kbd } from "@/components/base/kbd/kbd";
import { CommandMenu, type CommandAction } from "@/components/ui/command";
import { NotificationBell } from "@/components/application/app-shell/notification-bell";
import type { NotificationCenterItem } from "@/components/application/notification-center/notification-center";
import { KodamaIcon } from "@/components/foundations/brand/kodama-icon";

/** Docked assistant width on md and up, including its outer gutter. */
const ASSISTANT_WIDTH = 400;
const ASSISTANT_ENTER = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Exits are softer and shorter than enters: the reader's attention is already moving back to the page.
const ASSISTANT_EXIT = { duration: 0.2, ease: "easeOut" } as const;

export type AppShellNavChild = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  badge?: string | number;
  href?: string;
  section?: string;
  onClick?: () => void;
};

export type AppShellNavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  badge?: string | number;
  tone?: "danger";
  href?: string;
  section?: string;
  children?: AppShellNavChild[];
  onClick?: () => void;
};

export type AppShellNotification = {
  id: string;
  title: string;
  detail: string;
  /** Counted on the bell; omitted = unread. */
  unread?: boolean;
};

export type AppShellBreadcrumb = {
  label: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  href?: string;
  onClick?: () => void;
  current?: boolean;
};

export function JointsAppShell({
  navigation,
  activeId,
  onNavigate,
  title,
  description,
  breadcrumbs,
  actions,
  notifications = [],
  onNotificationsOpen,
  commands = [],
  embedded = false,
  activeMode = "all",
  onModeChange,
  onSuperintelligenceClick,
  assistant,
  onAskAssistant,
  children, identity, onAccountAction, profiles, onProfileSelect, maxProfiles,
}: {
  identity?: { name: string; role: string };
  onAccountAction?: (label: string) => void;
  profiles?: ProfileOption[];
  onProfileSelect?: (id: string) => void;
  maxProfiles?: number;
  navigation: AppShellNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  title: string;
  description?: string;
  breadcrumbs?: AppShellBreadcrumb[];
  actions?: ReactNode;
  notifications?: AppShellNotification[];
  /** Called when the bell opens, so the caller can mark what it showed as read. */
  onNotificationsOpen?: () => void;
  commands?: CommandAction[];
  embedded?: boolean;
  activeMode?: EnvironmentalMode;
  onModeChange?: (mode: EnvironmentalMode) => void;
  onSuperintelligenceClick?: () => void;
  /** A docked AI panel shown beside the page content while set. */
  assistant?: ReactNode;
  /** Shows the header "Tanya Kodama" button while no panel is open. */
  onAskAssistant?: () => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const [commandOpen, setCommandOpen] = useState(false);
  const commandShortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "\u2318 K" : "Ctrl K";
  const allNavItems = navigation.flatMap(item => [item, ...(item.children || [])]);
  const active = allNavItems.find(item => item.id === activeId);
  // The shell's notifications carry a title and detail only; the notification center needs a group and time.
  const notificationItems: NotificationCenterItem[] = notifications.map(item => ({
    id: item.id,
    category: "system",
    group: "Terbaru",
    title: item.title,
    description: item.detail,
    timestamp: "",
    unread: item.unread ?? true,
    status: "information",
  }));

  useEffect(() => {
    if (embedded) return;
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [embedded]);

  function navigate(id: string) {
    onNavigate(id);
    setMobileOpen(false);
  }

  const searchActions: CommandAction[] = [
    ...navigation.flatMap(item => [
      { id: item.id, label: item.label, group: item.section || "Navigate", onSelect: () => navigate(item.id) },
      ...(item.children || []).map(child => ({
        id: child.id,
        label: child.label,
        group: item.label,
        onSelect: () => (child.onClick ? child.onClick() : navigate(child.id)),
      })),
    ]),
    ...commands,
  ];

  const dashboardItems: DashboardNavItem[] = navigation.map(item => ({
    key: item.id,
    label: item.label,
    icon: item.icon,
    badge: item.badge,
    tone: item.tone,
    href: item.href,
    section: item.section,
    children: item.children?.map(child => ({
      key: child.id,
      label: child.label,
      icon: child.icon,
      badge: child.badge,
      href: child.href,
      onClick: child.onClick ? child.onClick : (child.href ? undefined : () => navigate(child.id)),
    })),
    onClick: item.onClick ? item.onClick : (item.href ? undefined : () => navigate(item.id)),
  }));

  const resolvedBreadcrumbs: AppShellBreadcrumb[] = breadcrumbs ?? (() => {
    const rootCrumb: AppShellBreadcrumb = {
      label: "Home",
      icon: RiHomeLine,
      onClick: () => navigate(navigation[0]?.id ?? "overview"),
    };

    if (!active) {
      return [
        rootCrumb,
        { label: title, icon: RiFileTextLine, current: true },
      ];
    }

    const parentItem = navigation.find(item => item.children?.some(c => c.id === activeId));

    if (parentItem) {
      const child = parentItem.children?.find(c => c.id === activeId);
      return [
        rootCrumb,
        {
          label: parentItem.label,
          icon: parentItem.icon ?? RiFolderLine,
          onClick: parentItem.onClick ?? (parentItem.href ? undefined : () => navigate(parentItem.id)),
          href: parentItem.href,
        },
        {
          label: child?.label ?? active.label,
          icon: child?.icon ?? active.icon ?? RiFileTextLine,
          current: true,
        },
      ];
    }

    const activeTopItem = navigation.find(item => item.id === activeId);

    if (activeTopItem?.section && activeTopItem.id !== "overview") {
      const SectionIcon =
        (activeTopItem.section === "Pemantauan" || activeTopItem.section === "Pantauan")
          ? RiCompass3Line
          : activeTopItem.section === "Analisis"
            ? RiEqualizerLine
            : activeTopItem.section === "Data"
              ? RiDatabase2Line
              : RiFolderLine;

      return [
        rootCrumb,
        {
          label: activeTopItem.section,
          icon: SectionIcon,
        },
        {
          label: activeTopItem.label,
          icon: activeTopItem.icon ?? RiFileTextLine,
          current: true,
        },
      ];
    }

    if (active.id === "overview") {
      return [
        { ...rootCrumb, current: false },
        { label: "Dashboard", icon: active.icon ?? RiDashboardLine, current: true },
      ];
    }

    return [
      rootCrumb,
      { label: active.label, icon: active.icon ?? RiFileTextLine, current: true },
    ];
  })();

  return <div className={`relative flex w-full gap-3 overflow-hidden bg-background-full text-text-primary ${embedded ? "h-[620px] rounded-[20px] border border-border-button-default" : "h-dvh"}`}>
    <div className={`hidden h-full shrink-0 lg:block ${embedded ? "py-2 pl-2" : "py-3 pl-3"}`}>
      <DashboardSidebar
        identity={identity}
        onAccountAction={onAccountAction}
        profiles={profiles}
        onProfileSelect={onProfileSelect}
        maxProfiles={maxProfiles}
        items={dashboardItems}
        selected={activeId}
        activeMode={activeMode}
        onModeChange={onModeChange}
        onSuperintelligenceClick={onSuperintelligenceClick}
        className="h-full"
      />
    </div>
    <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <DialogPrimitive.Viewport className="pointer-events-none fixed inset-0 z-[71]">
          <DialogPrimitive.Popup className="pointer-events-auto h-full w-fit p-3 outline-none transition-transform duration-200 data-ending-style:-translate-x-full data-starting-style:-translate-x-full motion-reduce:transition-none">
            <DialogPrimitive.Title className="sr-only">Workspace navigation</DialogPrimitive.Title>
            <DashboardSidebar
        identity={identity}
        onAccountAction={onAccountAction}
        profiles={profiles}
        onProfileSelect={onProfileSelect}
        maxProfiles={maxProfiles}
              mobile
              items={dashboardItems}
              selected={activeId}
              activeMode={activeMode}
              onModeChange={onModeChange}
              onSuperintelligenceClick={onSuperintelligenceClick}
              onClose={() => setMobileOpen(false)}
              className="flex h-full"
            />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    <main className={`min-w-0 flex-1 overflow-y-auto bg-background-full px-3 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${embedded ? "pt-3" : "pt-4"}`} id="workspace-content">
      <div className="w-full">
        <header className="mb-4 flex min-h-9 items-center gap-3" aria-label="Workspace header">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="shrink-0 rounded-lg p-1.5 text-text-secondary outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-accent-500 lg:hidden"
          >
            <RiMenuLine className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <Breadcrumb className="w-auto">
              {resolvedBreadcrumbs.map((crumb, idx) => (
                <BreadcrumbItem
                  key={`${crumb.label}-${idx}`}
                  icon={crumb.icon}
                  href={crumb.href}
                  onClick={crumb.onClick}
                  current={crumb.current || idx === resolvedBreadcrumbs.length - 1}
                >
                  {crumb.label}
                </BreadcrumbItem>
              ))}
            </Breadcrumb>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Cari aksi atau navigasi"
              aria-keyshortcuts="Control+K Meta+K"
              className="group flex h-9 w-9 sm:w-64 lg:w-80 items-center justify-between rounded-[10px] border border-border-input-default bg-background-primary-default px-2 sm:px-3 py-1.5 text-sm text-text-placeholder shadow-xs outline-none transition-colors hover:border-border-button-hover hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-accent-500 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <RiSearchLine className="size-4.5 shrink-0 text-text-tertiary group-hover:text-text-secondary transition-colors" aria-hidden />
                <span className="hidden truncate text-sm font-normal text-text-placeholder group-hover:text-text-secondary sm:block">Cari aksi atau navigasi...</span>
              </div>
              <Kbd className="hidden shrink-0 text-caption-1-semibold px-1.5 py-0.5 sm:block">{commandShortcut}</Kbd>
            </button>
            <NotificationBell
              notifications={notificationItems}
              title="Notifikasi"
              emptyMessage="Belum ada notifikasi."
              label="Notifikasi"
              onOpen={onNotificationsOpen}
            />
            {/* The way into Kodama: an icon-only primary button, the page's primary color. */}
            {onAskAssistant && !assistant && (
              <Button variant="primary" size="small" iconOnly leadingIcon={KodamaIcon} onClick={onAskAssistant} aria-label="Tanya Kodama" title="Tanya Kodama" className="shrink-0" />
            )}
          </div>
        </header>

        <div className="mb-[10px] flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div>
              <h1 className="text-[20px] font-medium leading-[26px] text-text-primary">{title}</h1>
              {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </main>
    {/* The column opens its width so the page makes room, while the panel itself slides
        and unblurs inside it; on phones it is a full-screen layer and only the panel moves. */}
    <AnimatePresence initial={false}>
      {assistant && (
        <motion.div
          key="assistant"
          initial={{ width: 0 }}
          animate={{ width: ASSISTANT_WIDTH, transition: reduceMotion ? { duration: 0 } : ASSISTANT_ENTER }}
          exit={{ width: 0, transition: reduceMotion ? { duration: 0 } : ASSISTANT_EXIT }}
          className="fixed inset-0 z-[60] p-2 max-md:!w-auto md:static md:z-auto md:shrink-0 md:overflow-hidden md:p-0"
        >
          <motion.div
            initial={{ opacity: 0, x: 24, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)", transition: reduceMotion ? { duration: 0 } : ASSISTANT_ENTER }}
            exit={{ opacity: 0, x: 12, filter: "blur(4px)", transition: reduceMotion ? { duration: 0 } : { duration: 0.15, ease: "easeOut" } }}
            className={`h-full md:w-[400px] ${embedded ? "md:py-2 md:pr-2" : "md:py-3 md:pr-3"}`}
          >
            {assistant}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} actions={searchActions} />
  </div>;
}
