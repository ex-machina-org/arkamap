import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import document from "../../../../docs/backend/openapi.json";
import type { components } from "./generated";
import { apiPath, apiHeaders, setSessionToken } from "./connection";

export type SchemaName = keyof components["schemas"];
export type DTO<N extends SchemaName> = components["schemas"][N];
const validator = new Ajv({ strict: false, allErrors: true });
addFormats(validator);
validator.addSchema({ $id: "arkamap", components: document.components });

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfter?: number;
  constructor(message: string, status: number, code?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function validate<N extends SchemaName>(name: N, value: unknown): DTO<N> {
  const check = validator.getSchema(`arkamap#/components/schemas/${name}`);
  if (!check || !check(value)) throw new ApiError(`Respons ${name} tidak sesuai kontrak API.`, 502, "invalid_payload");
  return value as DTO<N>;
}

/** `sentAuth` is the Authorization header the request carried; a 401 only ends the session
 *  while that token is still current, so a late reply to an old token cannot log out a new login. */
export async function assertResponse(response: Response, privateRequest = false, sentAuth = apiHeaders().get("Authorization")): Promise<void> {
  if (response.ok) return;
  const payload: unknown = await response.json().catch(() => null);
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
  const detail = typeof data.detail === "string" ? data.detail : Array.isArray(data.detail)
    ? data.detail.map(item => typeof item?.msg === "string" ? item.msg : "Input tidak valid").join("; ") : `Permintaan gagal (${response.status}).`;
  const message = response.status === 429 && retryAfter ? `${detail} Coba kembali dalam ${retryAfter} detik.` : detail;
  const appError = typeof data.detail === "string" && data.detail.includes("X-API-Key");
  const code = appError ? "app_credentials" : typeof data.code === "string" ? data.code : privateRequest && response.status === 401 ? "session_expired" : undefined;
  if (response.status === 401 && code === "session_expired" && sentAuth === apiHeaders().get("Authorization")) {
    setSessionToken();
    window.dispatchEvent(new Event("arkamap-session-expired"));
  }
  throw new ApiError(message, response.status, code, retryAfter);
}

export async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Path API harus relatif.");
  const timeout = AbortSignal.timeout(20_000);
  const headers = apiHeaders(options.headers);
  const response = await fetch(apiPath(path), { ...options, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout, credentials: "same-origin", headers });
  await assertResponse(response, path === "/me" || path.startsWith("/me/"), headers.get("Authorization"));
  return response.status === 204 ? null : response.json();
}

export async function api<N extends SchemaName>(path: string, schema: N, options?: RequestInit): Promise<DTO<N>> {
  return validate(schema, await request(path, options));
}

export async function apiList<N extends SchemaName>(path: string, schema: N, options?: RequestInit): Promise<DTO<N>[]> {
  const value = await request(path, options);
  if (!Array.isArray(value)) throw new ApiError("Respons daftar tidak valid.", 502);
  return value.map(item => validate(schema, item));
}

export const jsonBody = (value: unknown): Pick<RequestInit, "body"> => ({ body: JSON.stringify(value) });
