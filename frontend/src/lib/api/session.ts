import { api, ApiError, type DTO } from "./client";
import { setSessionToken } from "./connection";

export const SESSION_CHANGED = "arkamap-session-changed";
export type SessionState = { loading: boolean; me?: DTO<"MeOut">; error?: string };
let state: SessionState = { loading: true };
const listeners = new Set<() => void>();
let controller: AbortController | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let failures = 0;

function publish(value: SessionState) {
  state = value;
  listeners.forEach(listener => listener());
}
function cancel() {
  controller?.abort();
  clearTimeout(retry);
}
function expired() {
  cancel();
  failures = 0;
  publish({ loading: false });
}
export async function reloadSession() {
  cancel();
  controller = new AbortController();
  const signal = controller.signal;
  publish({ ...state, loading: !state.me, error: undefined });
  try {
    const me = await api("/me", "MeOut", { signal });
    if (signal.aborted) return;
    failures = 0;
    publish({ loading: false, me });
  } catch (error) {
    if (signal.aborted) return;
    if (error instanceof ApiError && error.status === 401 && error.code === "session_expired") return expired();
    publish({ ...state, loading: false, error: error instanceof Error ? error.message : "Sesi tidak tersedia." });
    // Only the idempotent session lookup retries; user mutations remain explicit.
    if (++failures <= 3 && listeners.size > 0) retry = setTimeout(() => void reloadSession(), 1000 * 2 ** (failures - 1));
  }
}
function changed(event: Event) {
  cancel();
  failures = 0;
  if (event instanceof CustomEvent && event.detail?.reset === true) publish({ loading: true });
  void reloadSession();
}
function reconnect() {
  if (state.error) {
    failures = 0;
    void reloadSession();
  }
}
export const getSession = () => state;
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener(SESSION_CHANGED, changed);
    window.addEventListener("arkamap-session-expired", expired);
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    void reloadSession();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      cancel();
      window.removeEventListener(SESSION_CHANGED, changed);
      window.removeEventListener("arkamap-session-expired", expired);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      // Do not expose an old account after an unsubscribed login/logout.
      state = { loading: true };
      failures = 0;
    }
  };
}
// The backend issues stateless JWTs and has no logout endpoint; forgetting the token ends the session in this tab.
export async function logoutSession() {
  setSessionToken();
  window.dispatchEvent(new Event("arkamap-session-expired"));
  window.dispatchEvent(new Event(SESSION_CHANGED));
}
