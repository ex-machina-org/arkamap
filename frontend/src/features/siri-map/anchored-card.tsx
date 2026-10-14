"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useMap } from "@/components/ui/map";
import { useMediaQuery } from "@/hooks/use-media-query";

/** Space between the anchor point and the card. */
const GAP = 20;
const EDGE = 12;
/** Keeps the card below the floating search bar. */
const TOP = 60;

/**
 * Holds a card beside a point on the map, like a callout: to the right of the point when it fits, else to the left,
 * and kept inside the map while the map pans and zooms. Phones get a bottom sheet instead, since there is no room beside.
 * Must render inside `Map`.
 */
export function AnchoredCard({ anchor, children }: { anchor: [number, number] | null; children: ReactNode }) {
  const { map } = useMap();
  const wide = useMediaQuery("(min-width: 768px)");
  const ref = useRef<HTMLDivElement>(null);

  const place = useRef(() => {});

  // Before paint, so the card never shows at the corner first. Map moves call the latest version through the ref.
  useLayoutEffect(() => {
    place.current = () => {
      if (ref.current && map && wide) placeCard(ref.current, map, anchor);
    };
    place.current();
  });

  useEffect(() => {
    const el = ref.current;
    if (!map || !el) return;
    const update = () => place.current();
    map.on("move", update);
    map.on("resize", update);
    // The card's own height changes while its content loads.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      map.off("move", update);
      map.off("resize", update);
      observer.disconnect();
    };
  }, [map, wide]);

  if (!wide) return <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20">{children}</div>;
  return (
    <div ref={ref} style={{ visibility: "hidden" }} className="pointer-events-auto absolute left-0 top-0 z-20 w-[340px] max-w-[calc(100%-1.5rem)]">
      {children}
    </div>
  );
}

/** Writes the position straight to the element, so panning does not re-render the card every frame. */
function placeCard(el: HTMLDivElement, map: MapLibreMap, anchor: [number, number] | null) {
  if (!anchor) {
    el.style.visibility = "hidden";
    return;
  }
  const container = map.getContainer();
  const width = container.clientWidth;
  const height = container.clientHeight;
  const cardWidth = el.offsetWidth;
  const cardHeight = el.offsetHeight;
  const point = map.project(anchor);
  let side: "right" | "left" = "right";
  let x = point.x + GAP;
  if (x + cardWidth > width - EDGE) {
    side = "left";
    x = point.x - GAP - cardWidth;
  }
  x = Math.min(Math.max(x, EDGE), width - cardWidth - EDGE);
  const y = Math.min(Math.max(point.y - cardHeight / 2, TOP), height - cardHeight - EDGE);
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  el.style.visibility = "visible";
  // The card grows out of the side that faces the point.
  const card = el.firstElementChild as HTMLElement | null;
  if (card) card.style.transformOrigin = side === "right" ? "left center" : "right center";
}
