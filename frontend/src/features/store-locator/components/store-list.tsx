"use client";

import { useEffect, useRef, useState } from "react";
import {
  RiCloseLine,
  RiLoginBoxLine,
  RiLogoutBoxLine,
  RiMapPinLine,
  RiMoonLine,
  RiSearchLine,
  RiSunLine,
  RiTimeLine,
} from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { LoginModal } from "@/components/application/auth/login-modal";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cx } from "@/utils/cx";
import type { Store } from "../data";
import "./store-list.css";

interface StoreListProps {
  stores: Store[];
  query: string;
  onQueryChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function StoreList({
  stores,
  query,
  onQueryChange,
  selectedId,
  onSelect,
}: StoreListProps) {
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const [loginOpen, setLoginOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  function toggleTheme() {
    const nextDark = !isDark;
    document.documentElement.classList.toggle("dark", nextDark);
    setIsDark(nextDark);
  }

  useEffect(() => {
    if (!selectedId) return;
    itemRefs.current
      .get(selectedId)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <Sidebar collapsible="offcanvas" className="store-list border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="gap-0 border-b border-sidebar-border bg-sidebar px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="store-sidebar-title font-semibold text-sidebar-foreground">
                Find a store
              </h2>
              <a
                href="/dashboard"
                className="rounded border border-sidebar-border px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground hover:bg-sidebar-accent"
              >
                Command Center →
              </a>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {user ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-2 py-1 text-xs">
                <span className="flex size-4 items-center justify-center rounded-full bg-accent-600 text-[9px] font-bold text-white">
                  {user.name[0]?.toUpperCase()}
                </span>
                <span className="max-w-[70px] truncate font-medium text-sidebar-foreground">
                  {user.name}
                </span>
                <button
                  type="button"
                  onClick={() => setUser(null)}
                  title="Sign out"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RiLogoutBoxLine className="size-3" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="small"
                leadingIcon={RiLoginBoxLine}
                onClick={() => setLoginOpen(true)}
              >
                Log in
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="small"
              iconOnly
              leadingIcon={isDark ? RiSunLine : RiMoonLine}
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Light mode" : "Dark mode"}
            />
          </div>
        </div>

        <p className="mt-2 text-sm leading-5 text-muted-foreground">
          Select a location to focus the map.
        </p>

        <div className="store-search relative mt-4">
          <RiSearchLine
            className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search stores or addresses"
            className="h-10 w-full rounded-2lg border border-border-button-default bg-background-primary-default pl-9 pr-9 text-sm text-text-primary shadow-xs outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            aria-label="Search stores"
          />
          {query && (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
            >
              <RiCloseLine className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto [scrollbar-width:thin]">
        <SidebarGroup className="p-0">
          <div className="flex items-center justify-between px-5 pb-2 pt-4 text-xs font-medium text-muted-foreground">
            <span>{query ? "Search results" : "All locations"}</span>
            <span aria-live="polite" className="tabular-nums">
              {stores.length} {stores.length === 1 ? "result" : "results"}
            </span>
          </div>

          {stores.length === 0 ? (
            <div className="mx-4 mt-3 rounded-lg border border-dashed border-sidebar-border px-5 py-7 text-center">
              <RiSearchLine className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-sidebar-foreground">No stores found</p>
              <p className="mt-1 text-sm text-muted-foreground">Try another name or address.</p>
              {query && (
                <Button variant="secondary" size="small" className="mt-4" onClick={() => onQueryChange("")}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <SidebarMenu className="gap-2 px-3 pb-4 pt-1">
              {stores.map((store) => {
                const active = store.id === selectedId;

                return (
                  <SidebarMenuItem key={store.id}>
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) itemRefs.current.set(store.id, element);
                        else itemRefs.current.delete(store.id);
                      }}
                      onClick={() => onSelect(store.id)}
                      aria-current={active}
                      className={cx(
                        "w-full rounded-2lg border p-3 text-left transition-all outline-none",
                        active
                          ? "border-accent-500 bg-accent-50/50 shadow-xs dark:bg-accent-950/20"
                          : "border-border-button-default bg-background-primary-default hover:bg-background-primary-hover shadow-xs"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={cx("min-w-0 truncate text-sm font-semibold", active ? "text-accent-600 dark:text-accent-400" : "text-text-primary")}>
                          {store.name}
                        </span>
                        <span className={cx("inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium", active ? "text-accent-600 dark:text-accent-400" : "text-text-secondary")}>
                          <span className={cx("size-1.5 rounded-full", store.openNow ? "bg-accent-500" : "bg-text-tertiary")} />
                          {store.openNow ? "Open" : "Closed"}
                        </span>
                      </div>
                      <p className={cx("mt-1.5 flex items-center gap-1.5 text-xs", active ? "text-text-secondary" : "text-text-tertiary")}>
                        <RiMapPinLine className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{store.address}, {store.neighborhood}</span>
                      </p>
                      <p className={cx("mt-0.5 flex items-center gap-1.5 text-xs tabular-nums", active ? "text-text-secondary" : "text-text-tertiary")}>
                        <RiTimeLine className="size-3.5 shrink-0" aria-hidden="true" />
                        {store.hours}
                      </p>
                    </button>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={setUser}
      />
    </Sidebar>
  );
}
