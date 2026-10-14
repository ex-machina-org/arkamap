import { useState } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "@/lib/api/client";
import { notifySession, useSession } from "@/hooks/use-session";

export type ProfileOption = { id: string; title: string; detail: string; active: boolean };

/** A profile bundles role, region and mode, so switching profile is the only way the active mode changes. */
export function useProfileSwitcher() {
  const { me } = useSession();
  const [busy, setBusy] = useState(false);
  const activeId = me?.profile?.id;
  const options: ProfileOption[] = (me?.profiles ?? []).map(profile => ({
    id: String(profile.id),
    title: profile.role,
    detail: `${profile.mode_label} · ${profile.region_name ?? "Seluruh Indonesia"}`,
    active: profile.id === activeId,
  }));

  /** Resolves true once the profile is active, including when it already was. */
  async function select(id: string) {
    if (id === String(activeId)) return true;
    if (busy) return false;
    setBusy(true);
    try {
      await api(`/me/profiles/${id}/activate`, "MeOut", { method: "POST", ...jsonBody({}) });
      notifySession();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Profil gagal dialihkan.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Frees a slot. If it was the active one, the server activates the oldest that remains. */
  async function remove(id: string) {
    if (busy) return false;
    setBusy(true);
    try {
      await api(`/me/profiles/${id}`, "MeOut", { method: "DELETE" });
      notifySession();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Profil gagal dihapus.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { options, select, remove, busy, maxProfiles: me?.max_profiles ?? 3 };
}
