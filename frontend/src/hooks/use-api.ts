import { useEffect, useRef, useState } from "react";
import { api, type DTO, type SchemaName } from "@/lib/api/client";
import { SESSION_CHANGED } from "./use-session";

export function useApi<N extends SchemaName>(path: string | null, schema: N) {
  const [version, setVersion] = useState(0);
  const active = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ data?: DTO<N>; loading: boolean; error?: string }>({ loading: !!path });
  useEffect(() => {
    const changed = () => { active.current?.abort(); setState({ loading: !!path }); setVersion(value => value + 1); };
    const expired = () => { if (path?.startsWith("/me")) { active.current?.abort(); setState({ loading: false, error: "Sesi berakhir; silakan masuk." }); } };
    window.addEventListener(SESSION_CHANGED, changed);
    window.addEventListener("arkamap-session-expired", expired);
    return () => { window.removeEventListener(SESSION_CHANGED, changed); window.removeEventListener("arkamap-session-expired", expired); };
  }, [path]);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setState({ loading: !!path });
    if (path) api(path, schema, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ data, loading: false });
    }).catch(error => { if (!controller.signal.aborted) setState({ loading: false, error: error instanceof Error ? error.message : "Layanan tidak tersedia." }); });
    return () => controller.abort();
  }, [path, schema, version]);
  return { ...state, refresh: () => setVersion(value => value + 1) };
}
