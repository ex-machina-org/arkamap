import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/base/buttons/button";
import { DashboardTeamMenu } from "@/components/application/dashboard/dashboard-team-menu";
import { ArkamapSettingsModal, type ArkamapSettingsPage } from "@/components/application/settings/arkamap-settings";
import { LoginModal } from "./login-modal";
import { authenticate } from "@/lib/api/auth";
import { useSession } from "@/hooks/use-session";
import { useProfileSwitcher } from "@/hooks/use-profile-switcher";

/** Account entry for pages without the app shell sidebar; shares the sidebar's profile menu. */
export function AccountMenu() {
  const { me, loading, error, logout, reload } = useSession();
  const profileSwitcher = useProfileSwitcher();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ArkamapSettingsPage>();
  return <div className="flex items-center gap-2">
    {me
      ? <DashboardTeamMenu
        collapsed
        placement="bottom end"
        identity={{ name: me.user.name, role: me.profile?.role ?? "Belum ada profil" }}
        profiles={profileSwitcher.options}
        onSettings={page => setSettings(page ?? "account")}
        onAction={label => {
          if (label === "Keluar") void logout().catch(cause => toast.error(cause.message));
          else window.dispatchEvent(new Event("arkamap-profile-open"));
        }}
      />
      : error ? <Button size="small" disabled={loading} title={error} onClick={() => void reload()}>{loading ? "Memuat sesi..." : "Coba lagi"}</Button>
        : <Button size="small" disabled={loading} onClick={() => setOpen(true)}>{loading ? "Memuat sesi..." : "Masuk"}</Button>}
    <LoginModal isOpen={open} onClose={() => setOpen(false)} authenticate={authenticate} />
    <ArkamapSettingsModal isOpen={settings !== undefined} onClose={() => setSettings(undefined)} defaultPage={settings} />
  </div>;
}
