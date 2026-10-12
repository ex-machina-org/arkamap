// sessionStorage keeps the JWT across full-page navigations and reloads in this tab only;
// closing the tab ends the session. Storage can be unavailable (private mode), so fall back to memory.
const TOKEN_KEY = "arkamap-session";
let token: string | undefined = (() => { try { return sessionStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; } })();

export function setSessionToken(value?: string) {
  token = value;
  try { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* memory only */ }
}
export function apiPath(path: string) { return `/api${path}`; }
export function apiHeaders(headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set("Content-Type", "application/json");
  if (token) result.set("Authorization", `Bearer ${token}`);
  return result;
}
