import { useEffect } from "react";
import { RiMapPinLine, RiPhoneLine, RiTimeLine } from "@remixicon/react";

import {
  Map,
  MapControls,
  MapMarker,
  MapPopup,
  MarkerContent,
  MarkerTooltip,
  useMap,
} from "@/components/ui/map";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { Store } from "../data";

interface LocatorMapProps {
  stores: Store[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  center: [number, number];
}

function FlyToSelected({ store }: { store?: Store }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !store) return;
    if (!isLoaded) {
      const handleLoad = () => {
        map.flyTo({
          center: [store.lng, store.lat],
          zoom: 14,
          duration: 800,
          essential: true,
        });
      };
      map.once("load", handleLoad);
      return () => {
        map.off("load", handleLoad);
      };
    }
    map.flyTo({
      center: [store.lng, store.lat],
      zoom: 14,
      duration: 800,
      essential: true,
    });
  }, [map, isLoaded, store]);

  return null;
}

function StorePin({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full shadow-md transition-all cursor-pointer",
        active
          ? "bg-primary text-primary-foreground size-9 scale-110 ring-2 ring-background"
          : "bg-foreground text-background hover:bg-primary hover:text-primary-foreground size-7",
      )}
    >
      <RiMapPinLine className={cn(active ? "size-4.5" : "size-3.5")} />
    </div>
  );
}

export function LocatorMap({
  stores,
  selectedId,
  onSelect,
  onClearSelection,
  center,
}: LocatorMapProps) {
  const selected = stores.find((store) => store.id === selectedId);

  return (
    <div className="relative h-full w-full">
      <SidebarTrigger className="bg-background absolute top-3 left-3 z-10 border shadow-sm md:hidden" />

      <Map center={center} zoom={13} minZoom={10} maxZoom={17}>
        <MapControls showFullscreen showCompass />
        <FlyToSelected store={selected} />

        {stores.map((store) => (
          <MapMarker
            key={store.id}
            longitude={store.lng}
            latitude={store.lat}
            onClick={() => onSelect(store.id)}
          >
            <MarkerContent>
              <StorePin active={store.id === selectedId} />
            </MarkerContent>
            <MarkerTooltip
              offset={24}
              className="bg-foreground text-background"
            >
              {store.name}
            </MarkerTooltip>
          </MapMarker>
        ))}

        {selected && (
          <MapPopup
            key={selected.id}
            longitude={selected.lng}
            latitude={selected.lat}
            offset={26}
            closeButton
            closeOnClick={false}
            onClose={onClearSelection}
            className="min-w-56 border-border bg-popover text-popover-foreground shadow-xl"
            focusAfterOpen={false}
          >
            <p className="pr-5 font-semibold text-popover-foreground">
              {selected.name}
            </p>
            <span
              className={cn(
                "mt-1 flex items-center gap-1.5 text-xs font-medium",
                selected.openNow ? "text-popover-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  selected.openNow ? "bg-success" : "bg-muted-foreground",
                )}
              />
              {selected.openNow ? "Open now" : "Closed"}
            </span>

            <div className="mt-2.5 space-y-1.5 text-xs tabular-nums text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <RiMapPinLine className="size-3.5 shrink-0" />
                {selected.address}, {selected.neighborhood}
              </p>
              <p className="flex items-center gap-1.5">
                <RiTimeLine className="size-3.5 shrink-0" />
                {selected.hours}
              </p>
              <p className="flex items-center gap-1.5">
                <RiPhoneLine className="size-3.5 shrink-0" />
                {selected.phone}
              </p>
            </div>
          </MapPopup>
        )}
      </Map>
    </div>
  );
}
