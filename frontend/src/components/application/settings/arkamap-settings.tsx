"use client";

import { useState, type FormEvent } from "react";
import { RiMailLine, RiPaletteLine, RiSparklingLine, RiTeamLine, RiUser3Line, RiUserSettingsLine } from "@remixicon/react";
import { readThreads, writeThreads } from "@/components/application/agent-chat/thread-store";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useSession } from "@/hooks/use-session";
import { changePassword } from "@/lib/api/auth";
import { KODAMA_THREADS_KEY } from "@/lib/kodama";
import { ArkamapSettingsCredits } from "./arkamap-settings-credits";
import { ArkamapSettingsProfiles } from "./arkamap-settings-profiles";
import { SettingsModal, type SettingsGroup } from "./settings-modal";
import { SettingsCard, SettingsRow, SettingsSectionLabel, SettingsValueField } from "./settings-rows";

export type ArkamapSettingsPage = "account" | "profiles" | "appearance" | "kodama" | "credits";

function AccountPage({ onSaved }: { onSaved: () => void }) {
  const { me } = useSession();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) return setError("Password baru minimal 8 karakter.");
    if (newPassword !== confirm) return setError("Konfirmasi password baru tidak sama.");
    setBusy(true);
    setError(undefined);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword(""); setNewPassword(""); setConfirm("");
      setDone(true);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password gagal diganti.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SettingsSectionLabel>Akun</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow label="Nama"><SettingsValueField>{me?.user.name ?? "-"}</SettingsValueField></SettingsRow>
          <SettingsRow label="Email"><SettingsValueField icon={RiMailLine}>{me?.user.email ?? "-"}</SettingsValueField></SettingsRow>
        </SettingsCard>
      </div>

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
        <SettingsSectionLabel>Ganti password</SettingsSectionLabel>
        <div className="flex flex-col gap-3 rounded-2xl bg-background-secondary-default p-3">
          <Input size="small" type="password" label="Password saat ini" autoComplete="current-password" value={oldPassword} onChange={setOldPassword} isRequired maxLength={128} />
          <Input size="small" type="password" label="Password baru" hint="Minimal 8 karakter." autoComplete="new-password" value={newPassword} onChange={setNewPassword} isRequired maxLength={128} />
          <Input size="small" type="password" label="Ulangi password baru" autoComplete="new-password" value={confirm} onChange={setConfirm} isRequired maxLength={128} />
          {error && <p role="alert" className="text-body-2-regular text-text-error-primary">{error}</p>}
          {done && !error && <p role="status" className="text-body-2-regular text-text-secondary">Password diganti. Sesi di perangkat lain sudah dikeluarkan.</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-body-2-regular text-pretty text-text-tertiary">Mengganti password mengeluarkan semua sesi lain.</p>
            <Button type="submit" variant="primary" size="small" disabled={busy || !oldPassword || !newPassword || !confirm}>
              {busy ? "Menyimpan..." : "Simpan password"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AppearancePage() {
  return (
    <SettingsCard>
      <SettingsRow label="Tema" description="Terang atau gelap. Pilihan disimpan di browser ini.">
        <ThemeToggle appearance="segmented" />
      </SettingsRow>
    </SettingsCard>
  );
}

function KodamaPage() {
  const [count, setCount] = useState(() => readThreads(KODAMA_THREADS_KEY).length);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex w-full flex-col gap-2">
      <SettingsCard>
        <SettingsRow
          label="Riwayat chat"
          description={count === 0 ? "Belum ada percakapan tersimpan di browser ini." : `${count} percakapan tersimpan di browser ini, tidak di server.`}
        >
          {confirming ? (
            <span className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" size="xs" onClick={() => setConfirming(false)}>Batal</Button>
              <Button variant="danger" size="xs" onClick={() => { writeThreads(KODAMA_THREADS_KEY, []); setCount(0); setConfirming(false); }}>Hapus semua</Button>
            </span>
          ) : (
            <Button variant="secondary" size="xs" disabled={count === 0} onClick={() => setConfirming(true)}>Hapus riwayat</Button>
          )}
        </SettingsRow>
      </SettingsCard>
      <p className="px-3 text-body-2-regular text-pretty text-text-tertiary">
        Kodama menjawab dengan model Jev dari data wilayah, kejadian, dan peringatan Arkamap.
      </p>
    </div>
  );
}

/** Arkamap's settings in the design system's settings modal: only what actually works today. */
export function ArkamapSettingsModal({
  isOpen,
  onClose,
  defaultPage = "account",
}: {
  isOpen: boolean;
  onClose: () => void;
  defaultPage?: ArkamapSettingsPage;
}) {
  const groups: SettingsGroup[] = [
    {
      label: "Akun",
      items: [
        { id: "account", label: "Akun", icon: RiUser3Line, render: ({ showSaved }) => <AccountPage onSaved={showSaved} /> },
        { id: "profiles", label: "Profil pantauan", icon: RiUserSettingsLine, render: () => <ArkamapSettingsProfiles onClose={onClose} /> },
      ],
    },
    {
      label: "Aplikasi",
      items: [
        { id: "appearance", label: "Tampilan", icon: RiPaletteLine, render: () => <AppearancePage /> },
        { id: "kodama", label: "Kodama", icon: RiSparklingLine, render: () => <KodamaPage /> },
      ],
    },
    {
      label: "Tentang",
      items: [{ id: "credits", label: "Credits", icon: RiTeamLine, render: () => <ArkamapSettingsCredits /> }],
    },
  ];
  return (
    <SettingsModal
      isOpen={isOpen}
      onClose={onClose}
      defaultPage={defaultPage}
      groups={groups}
      label="Pengaturan"
      closeLabel="Tutup pengaturan"
      savedLabel="Tersimpan"
    />
  );
}
