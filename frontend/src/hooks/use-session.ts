import { useSyncExternalStore } from "react";
import { getSession, logoutSession, reloadSession, SESSION_CHANGED, subscribeSession } from "@/lib/api/session";

export { SESSION_CHANGED };
export function notifySession() { window.dispatchEvent(new Event(SESSION_CHANGED)); }

export function useSession() {
  const state = useSyncExternalStore(subscribeSession, getSession);
  return { ...state, logout: logoutSession, reload: reloadSession };
}
