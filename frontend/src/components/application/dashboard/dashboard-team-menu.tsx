"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  RiBroadcastLine,
  RiContrastLine,
  RiLogoutBoxRLine,
  RiMore2Line,
  RiNotification3Line,
  RiSettings4Line,
  RiShieldUserLine,
  RiUserSharedLine,
} from "@remixicon/react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badge";
import type { ProfileOption } from "@/hooks/use-profile-switcher";
import { goTo } from "@/lib/navigate";
import { cx } from "@/utils/cx";
import { initialsOf } from "@/utils/initials";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

type ProfileRow = {
  icon: IconComponent;
  label: string;
  badge?: string;
  danger?: boolean;
};

const MENU_ITEMS: ProfileRow[] = [
  { icon: RiShieldUserLine, label: "Profil Pengguna" },
  { icon: RiBroadcastLine, label: "Telemetri & API Satelit" },
  { icon: RiNotification3Line, label: "Notifikasi", badge: "3" },
  { icon: RiSettings4Line, label: "Preferensi" },
  { icon: RiLogoutBoxRLine, label: "Keluar", danger: true },
];

function Collapsible({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={cx(
        "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out",
        collapsed ? "max-w-0 opacity-0 blur-[3px]" : "max-w-40 opacity-100 blur-0",
      )}
    >
      {children}
    </span>
  );
}

function MenuRow({ item, onSelect }: { item: ProfileRow; onSelect: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        "flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-2lg p-2 text-left outline-none transition-colors",
        item.danger
          ? "text-text-error-primary hover:bg-background-tertiary-error"
          : "text-text-primary hover:bg-background-primary-hover focus-visible:bg-background-primary-hover",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Icon
          className={cx("size-5 shrink-0", item.danger ? "text-foreground-icon-error" : "text-foreground-icon-secondary")}
          aria-hidden
        />
        <span className="truncate text-body-medium">{item.label}</span>
      </span>
      {item.badge && (
        <Badge color="neutral" className="text-[10px] px-1.5 py-0">
          {item.badge}
        </Badge>
      )}
    </button>
  );
}

/** Light/dark switch as a menu row; it changes the theme without closing the menu. */
function ThemeRow() {
  return (
    <div className="flex w-full items-center justify-between gap-2.5 rounded-2lg py-1 pr-1 pl-2">
      <span className="flex min-w-0 items-center gap-2 text-text-primary">
        <RiContrastLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <span className="truncate text-body-medium">Tema</span>
      </span>
      <ThemeToggle appearance="segmented" />
    </div>
  );
}

export function DashboardTeamMenu({
  collapsed = false,
  className,
  identity,
  onAction,
  profiles,
  placement,
  onSettings,
  showTheme = true,
}: {
  /** `avatarSrc` is the active profile's portrait; without it the avatar shows initials. */
  identity?: { name: string; role: string; avatarSrc?: string };
  onAction?: (label: string) => void;
  /** Monitoring profiles of the signed-in account; when there are any, the menu links to the profile picker. */
  profiles?: ProfileOption[];
  /** Where the menu opens. Defaults to above the card in an open sidebar, beside it when collapsed. */
  placement?: "right bottom" | "bottom end" | "top";
  /** Opens the product's settings. Without it the item says it is still a preview. */
  onSettings?: (page?: "profiles") => void;
  /** The light/dark switch inside the menu. */
  showTheme?: boolean;
  collapsed?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const resolvedPlacement = isMobile ? "bottom start" : placement ?? (collapsed ? "right bottom" : "top");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <AriaDialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <AriaButton
        aria-label={identity?.name ?? "Mahardika S.T."}
        className={cx(
          "flex cursor-pointer items-center overflow-hidden outline-none select-none",
          "transition-[width,background-color,border-color,padding] duration-300 ease-in-out",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2",
          collapsed
            ? "size-9 justify-center rounded-full bg-transparent p-0 border border-transparent hover:border-border-button-hover"
            : "w-full justify-between rounded-2xl border border-border-button-default bg-background-primary-default p-2 shadow-xs hover:bg-background-primary-hover",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar
            size="md"
            color="accent"
            src={identity ? identity.avatarSrc : "/avatars/michael-ekstrom.webp"}
            initials={identity ? initialsOf(identity.name) : undefined}
            alt={identity?.name ?? "Mahardika S.T."}
          />
          <Collapsible collapsed={collapsed}>
            <span className="flex min-w-0 flex-col items-start justify-center text-left">
              <span className="text-body-medium font-medium whitespace-nowrap text-text-primary">
                {identity?.name ?? "Mahardika S.T."}
              </span>
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-background-tertiary-default text-text-secondary mt-0.5">
                {identity?.role ?? "Coordinator"}
              </span>
            </span>
          </Collapsible>
        </span>

        <Collapsible collapsed={collapsed}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-foreground-icon-secondary hover:text-text-primary">
            <RiMore2Line className="size-4.5" />
          </span>
        </Collapsible>
      </AriaButton>

      <AriaPopover
        placement={resolvedPlacement}
        offset={8}
        className={cx(
          "max-w-[calc(100vw-32px)] overflow-y-auto overflow-x-hidden",
          // Above the card it takes the card's width, so it reads as part of the sidebar.
          resolvedPlacement === "top" ? "w-[max(var(--trigger-width),15rem)] origin-bottom" : "w-72",
          resolvedPlacement === "bottom end" ? "origin-top-right" : resolvedPlacement === "top" ? "" : "origin-bottom-left",
          "rounded-2xl border border-border-button-default bg-background-primary-default p-2.5 shadow-dropdown z-[90]",
          "transition duration-150 ease-out",
          "data-[entering]:opacity-0 data-[entering]:scale-95 data-[entering]:blur-[2px]",
          "data-[exiting]:opacity-0 data-[exiting]:scale-95 data-[exiting]:blur-[2px]",
        )}
      >
        <AriaDialog aria-label={`Profil ${identity?.name ?? "Mahardika S.T."}`} className="flex flex-col gap-1 outline-none">
          {/* Header */}
          <div className="flex w-full items-center gap-2 px-2 pt-1 pb-2 border-b border-border-button-default">
            <Avatar
              size="md"
              color="accent"
              src={identity ? identity.avatarSrc : "/avatars/michael-ekstrom.webp"}
              initials={identity ? initialsOf(identity.name) : undefined}
              alt={identity?.name ?? "Mahardika S.T."}
            />
            <div className="flex min-w-0 flex-col items-start justify-center">
              <span className="max-w-full truncate text-body-medium text-text-primary font-medium">
                {identity?.name ?? "Mahardika S.T."}
              </span>
              <span className="max-w-full truncate text-body-regular text-text-secondary">
                {identity ? identity.role : "mahardika@joints.env.go.id"}
              </span>
            </div>
          </div>

          {identity ? (
            <>
              {profiles && profiles.length > 0 && (
                // Switching, adding and removing profiles all live on the picker, so the menu only links to it.
                <div className="flex w-full flex-col gap-0.5">
                  <MenuRow
                    item={{ icon: RiUserSharedLine, label: "Ganti profil" }}
                    onSelect={() => {
                      setIsOpen(false);
                      goTo("/profiles");
                    }}
                  />
                  <div className="-mx-2.5 my-1 h-px bg-border-button-default" />
                </div>
              )}
              <div className="flex w-full flex-col gap-0.5">
                <MenuRow
                  item={{ icon: RiSettings4Line, label: "Pengaturan" }}
                  onSelect={() => {
                    setIsOpen(false);
                    if (onSettings) onSettings();
                    else toast.info("Fitur masih Preview", { description: "Pengaturan belum tersedia." });
                  }}
                />
                {showTheme && <ThemeRow />}
                <div className="-mx-2.5 my-1 h-px bg-border-button-default" />
                {MENU_ITEMS.filter(item => item.label === "Keluar").map(item => <MenuRow key={item.label} item={item} onSelect={() => { setIsOpen(false); onAction?.(item.label); }} />)}
              </div>
            </>
          ) : (
            <div className="flex w-full flex-col gap-0.5 pt-1">
              {MENU_ITEMS.filter(item => !item.danger).map(item => <MenuRow key={item.label} item={item} onSelect={() => { setIsOpen(false); onAction?.(item.label); }} />)}
              {showTheme && <ThemeRow />}
              {MENU_ITEMS.filter(item => item.danger).map(item => <MenuRow key={item.label} item={item} onSelect={() => { setIsOpen(false); onAction?.(item.label); }} />)}
            </div>
          )}
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}

export const DashboardProfileMenu = DashboardTeamMenu;
