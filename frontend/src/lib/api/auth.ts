import { api, jsonBody, type DTO } from "./client";
import { setSessionToken } from "./connection";

export async function authenticate(mode: "signin" | "signup" | "forgot", credentials: { email: string; name: string; password: string; remember_me?: boolean }): Promise<DTO<"UserOut">> {
  if (mode === "forgot") throw new Error("Pemulihan password belum tersedia. Hubungi administrator.");
  const path = `/auth/${mode === "signup" ? "signup" : "login"}`;
  const options = {
    method: "POST", ...jsonBody(credentials),
  };
  const response = await api(path, "AuthOut", options);
  setSessionToken(response.token);
  window.dispatchEvent(new CustomEvent("arkamap-session-changed", { detail: { reset: true } }));
  return response.user;
}

/** Changes the signed-in user's password. The server logs out every other
 *  session and returns a new token for this one, which replaces the old. */
export async function changePassword(oldPassword: string, newPassword: string) {
  const response = await api("/me/password", "AuthOut", { method: "POST", ...jsonBody({ old_password: oldPassword, new_password: newPassword }) });
  setSessionToken(response.token);
}
