"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { StoreList } from "./components/store-list";
import { LocatorMap } from "./components/locator-map";
import { MAP_CENTER, stores } from "./data";

export function StoreLocatorWorkspace() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(stores[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (store) =>
        store.name.toLowerCase().includes(q) ||
        store.address.toLowerCase().includes(q) ||
        store.neighborhood.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "22rem" } as CSSProperties}
      className="h-svh w-full overflow-hidden"
    >
      <StoreList
        stores={filtered}
        query={query}
        onQueryChange={setQuery}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <SidebarInset className="h-full overflow-hidden">
        <LocatorMap
          stores={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClearSelection={() => setSelectedId(null)}
          center={MAP_CENTER}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
