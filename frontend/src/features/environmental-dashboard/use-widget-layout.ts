import { useCallback, useMemo, useState } from "react";
import { appendLayout, moveWidget, resolveLayout, WIDGET_SIZES, type Placement, type SavedLayout, type WidgetInstance } from "./widget-layout";

/*
 * Kept in this browser only, per profile, until the API stores layouts with the profile.
 * Storage can be missing or blocked (private windows, previews); the dashboard then
 * simply starts from the default every visit.
 */
const storageKey = (profileId: number) => `arkamap:dashboard-layout:v2:${profileId}`;

function read(profileId: number): SavedLayout | undefined {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(profileId)) ?? "null") as SavedLayout | null;
    if (value?.version === 2 && Array.isArray(value.items) && Array.isArray(value.layout) && Array.isArray(value.seen)) return value;
  } catch { /* Unreadable storage counts as no saved layout. */ }
  return undefined;
}

function write(profileId: number, value: SavedLayout | undefined) {
  try {
    if (value) window.localStorage.setItem(storageKey(profileId), JSON.stringify(value));
    else window.localStorage.removeItem(storageKey(profileId));
  } catch { /* The layout still applies for this visit. */ }
}

const strip = (layout: readonly Placement[]) => layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));

/** The profile's dashboard: saved widgets and placements merged with today's defaults. */
export function useWidgetLayout(profileId: number, defaults: WidgetInstance[]) {
  const [saved, setSaved] = useState<{ profileId: number; value?: SavedLayout }>(() => ({ profileId, value: read(profileId) }));
  // Switching profile swaps in that profile's arrangement during render, without an effect.
  const current = saved.profileId === profileId ? saved.value : read(profileId);
  if (saved.profileId !== profileId) setSaved({ profileId, value: current });

  // Callers rebuild `defaults` on every render; the serialized list keeps the merge stable.
  const defaultsKey = JSON.stringify(defaults);
  const stableDefaults = useMemo(() => JSON.parse(defaultsKey) as WidgetInstance[], [defaultsKey]);
  const { items, layout } = useMemo(() => resolveLayout(current, stableDefaults), [current, stableDefaults]);

  const commit = useCallback((nextItems: WidgetInstance[], nextLayout: Placement[]) => {
    const value: SavedLayout = { version: 2, items: nextItems, layout: strip(nextLayout), seen: [...new Set([...(current?.seen ?? []), ...stableDefaults.map(item => item.id)])] };
    write(profileId, value);
    setSaved({ profileId, value });
  }, [current, profileId, stableDefaults]);

  return {
    items,
    layout,
    customised: Boolean(current),
    /** From the grid after a drag or resize. */
    setLayout: (next: readonly Placement[]) => commit(items, strip(next)),
    move: (id: string, step: -1 | 1) => commit(items, moveWidget(layout, id, step)),
    remove: (id: string) => commit(items.filter(item => item.id !== id), layout.filter(place => place.i !== id)),
    add: (item: WidgetInstance) => { if (!items.some(own => own.id === item.id)) commit([...items, item], appendLayout(layout, [item])); },
    /**
     * Settings saved: the instance may get a new id (another metric is another widget),
     * so it takes over the old one's place, with the chosen width clamped to its minimum.
     * Returns false when the new configuration is already on the dashboard.
     */
    update: (oldId: string, next: WidgetInstance, width?: number) => {
      if (next.id !== oldId && items.some(own => own.id === next.id)) return false;
      const minW = WIDGET_SIZES[next.type].minW;
      commit(items.map(item => item.id === oldId ? next : item),
        layout.map(place => place.i === oldId ? { ...place, i: next.id, w: Math.max(minW, width ?? place.w) } : place));
      return true;
    },
    reset: () => { write(profileId, undefined); setSaved({ profileId, value: undefined }); },
  };
}
