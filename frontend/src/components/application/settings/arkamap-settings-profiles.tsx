"use client";

import { useState } from "react";
import { RiAddLine, RiInformationLine } from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { useProfileSwitcher } from "@/hooks/use-profile-switcher";
import { useSession } from "@/hooks/use-session";
import { SettingsSectionLabel } from "./settings-rows";

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

/**
 * Monitoring profiles: switch, remove, and add with an explanation first.
 * A profile holds a role, goals, a region and a monitoring mode; devices
 * belong to the account, so they stay the same across profiles.
 */
export function ArkamapSettingsProfiles({ onClose }: { onClose: () => void }) {
  const { me } = useSession();
  const switcher = useProfileSwitcher();
  const [confirmDelete, setConfirmDelete] = useState<number>();
  const [explainAdd, setExplainAdd] = useState(false);
  const profiles = me?.profiles ?? [];
  const max = switcher.maxProfiles;
  const atLimit = profiles.length >= max;

  const startAdd = () => {
    onClose();
    window.dispatchEvent(new Event("arkamap-profile-open"));
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-body-medium text-text-primary">{profiles.length} dari {max} profil terpakai</p>
        <p className="text-body-2-regular text-pretty text-text-secondary">
          Profil menyimpan peran, tujuan, wilayah minat, dan mode pantauan. Perangkat IoT terikat ke akun, jadi sama di semua profil.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <SettingsSectionLabel>Profil pantauan</SettingsSectionLabel>
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => {
            const confirming = confirmDelete === profile.id;
            const last = profiles.length === 1;
            return (
              <li key={profile.id} className="flex flex-col gap-3 rounded-2xl bg-background-secondary-default p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="flex items-center gap-2 text-body-medium text-text-primary">
                      <span className="truncate">{profile.role}</span>
                      {profile.active && <Badge color="primary">Aktif</Badge>}
                    </p>
                    <p className="text-body-2-regular text-text-secondary">
                      {profile.mode_label} · {profile.region_name ?? "Seluruh Indonesia"}
                    </p>
                    <p className="text-caption-1-regular text-text-tertiary">
                      {profile.metrics.length} metrik dipantau · dibuat {DATE.format(new Date(profile.created_at))}
                    </p>
                  </div>
                  {!confirming && (
                    <div className="flex shrink-0 items-center gap-2">
                      {!profile.active && (
                        <Button variant="secondary" size="xs" disabled={switcher.busy} onClick={() => void switcher.select(String(profile.id))}>
                          Aktifkan
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={switcher.busy || last}
                        title={last ? "Profil terakhir tidak bisa dihapus. Tambah profil lain terlebih dahulu." : undefined}
                        onClick={() => setConfirmDelete(profile.id)}
                      >
                        Hapus
                      </Button>
                    </div>
                  )}
                </div>
                {confirming && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background-primary-default p-3">
                    <p className="min-w-0 flex-1 text-body-2-regular text-pretty text-text-secondary">
                      Hapus profil <span className="text-text-primary">{profile.role}</span>? Peran, wilayah, dan metriknya ikut terhapus.
                      {profile.active && " Profil tertua yang tersisa akan menjadi aktif."}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="secondary" size="xs" onClick={() => setConfirmDelete(undefined)}>Batal</Button>
                      <Button
                        variant="danger"
                        size="xs"
                        disabled={switcher.busy}
                        onClick={async () => { if (await switcher.remove(String(profile.id))) setConfirmDelete(undefined); }}
                      >
                        Hapus profil
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {explainAdd ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border-button-default p-4">
          <p className="flex items-center gap-2 text-body-medium text-text-primary">
            <RiInformationLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
            Sebelum menambah profil
          </p>
          <ul className="flex list-disc flex-col gap-1.5 pl-9 text-body-2-regular text-pretty text-text-secondary">
            <li>Profil baru diisi dari awal: peran, tujuan, wilayah minat, dan mode pantauan. Tidak ada yang disalin dari profil aktif.</li>
            <li>Setelah disimpan, profil baru langsung menjadi profil aktif. Profil lain tetap tersimpan dan bisa diaktifkan lagi.</li>
            <li>Perangkat IoT dan riwayat chat Kodama tidak terpengaruh.</li>
          </ul>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="small" onClick={() => setExplainAdd(false)}>Batal</Button>
            <Button variant="primary" size="small" onClick={startAdd}>Lanjut isi data</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1.5">
          <Button variant="secondary" size="small" leadingIcon={RiAddLine} disabled={atLimit} onClick={() => setExplainAdd(true)}>
            Tambah profil
          </Button>
          {atLimit && (
            <p className="text-body-2-regular text-text-tertiary">
              Batas {max} profil tercapai. Hapus salah satu profil di atas untuk menambah yang baru.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
