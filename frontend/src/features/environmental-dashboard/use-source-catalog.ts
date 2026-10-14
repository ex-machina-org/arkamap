import { useEffect, useState } from "react";
import { apiList, type DTO } from "@/lib/api/client";
import { prettifyId } from "./labels";

type Source = DTO<"SourceInfo">;

// One request per page load; a failure only costs friendly names, never the dashboard.
let catalog: Promise<Map<string, Source>> | undefined;
const load = () => catalog ??= apiList("/sources", "SourceInfo")
  .then(items => new Map(items.map(item => [item.id, item])))
  .catch(() => { catalog = undefined; return new Map<string, Source>(); });

/** Resolves source ids (`firms_viirs`) to publisher names from the backend registry. */
export function useSourceName() {
  const [sources, setSources] = useState<Map<string, Source>>();
  useEffect(() => {
    let active = true;
    void load().then(value => { if (active) setSources(value); });
    return () => { active = false; };
  }, []);
  return (id: string) => sources?.get(id)?.publisher ?? prettifyId(id);
}
