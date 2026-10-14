import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { RiAddLine, RiDeleteBinLine, RiLogoutBoxRLine } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/base/buttons/button";
import { useProfileSwitcher } from "@/hooks/use-profile-switcher";
import { useSession } from "@/hooks/use-session";
import { spring } from "@/lib/springs";
import { goTo } from "@/lib/navigate";
import { cx } from "@/utils/cx";
import { EmptyProfileArt, ProfileGlyph } from "./profile-glyph";
import { MODE_NAME, MODE_UNDERLINE } from "./profile-copy";
import { ProfileStage } from "./profile-stage";
import { DRAFT_CARD, navigateWithMorph } from "./profile-transition";

const tile = "relative block aspect-square w-full overflow-hidden rounded-2xl border bg-background-primary-default transition-colors";
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background-full";

/** Shown after sign-in: the account chooses which monitoring profile opens the dashboard. */
export function ProfilePickerScreen() {
  const { me, logout } = useSession();
  const switcher = useProfileSwitcher();
  const [managing, setManaging] = useState(false);
  const [opening, setOpening] = useState<number>();
  const [confirmDelete, setConfirmDelete] = useState<number>();
  const activeRef = useRef<HTMLButtonElement>(null);
  // Arriving through the onboarding morph, the tiles are already in place; a second entrance would hide the morph target.
  const [morphed] = useState(() => document.documentElement.classList.contains("profile-morph"));
  const enter = morphed ? false : { opacity: 0, y: 12 };
  const profiles = me?.profiles ?? [];
  const max = switcher.maxProfiles;
  const freeSlots = Math.max(0, max - profiles.length);
  const pending = profiles.find(profile => profile.id === confirmDelete);

  // The last used profile takes focus, so Enter continues where the user left off.
  useEffect(() => {
    activeRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!managing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmDelete !== undefined) setConfirmDelete(undefined);
      else setManaging(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [managing, confirmDelete]);

  async function open(id: number) {
    if (opening !== undefined) return;
    setOpening(id);
    if (await switcher.select(String(id))) goTo("/dashboard");
    else setOpening(undefined);
  }

  async function remove(id: number) {
    if (await switcher.remove(String(id))) {
      setConfirmDelete(undefined);
      toast.success("Profil dihapus.");
    }
  }

  const openingProfile = profiles.find(profile => profile.id === opening);

  return (
    <ProfileStage actions={
      <Button variant="ghost" size="small" leadingIcon={RiLogoutBoxRLine} disabled={opening !== undefined} onClick={() => void logout().catch(cause => toast.error(cause instanceof Error ? cause.message : "Gagal keluar dari akun."))}>
        Keluar
      </Button>
    }>
      <section aria-labelledby="profile-picker-title" className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 pb-24 pt-6 text-center sm:px-8">
        <h1 id="profile-picker-title" className="text-title-1-semibold text-balance sm:text-display-4-semibold">
          {managing ? "Kelola Profil Pantauan" : "Pilih Profil Pantauan"}
        </h1>
        <p className="mt-3 max-w-lg text-headline-regular text-pretty text-text-secondary">
          {managing
            ? "Pilih profil yang ingin dihapus. Perangkat IoT dan riwayat chat tetap tersimpan di akun."
            : `Halo, ${me?.user.name ?? "Anda"}. Setiap profil membuka dashboard dengan peran, wilayah, dan mode pantauannya sendiri.`}
        </p>

        <ul className="mt-12 grid w-full max-w-3xl grid-cols-2 justify-center gap-x-5 gap-y-8 sm:flex sm:flex-wrap sm:gap-x-8">
          {profiles.map((profile, index) => {
            const dimmed = opening !== undefined && opening !== profile.id;
            const last = profiles.length === 1;
            return (
              <motion.li
                key={profile.id}
                className="sm:w-44"
                initial={enter}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.slow, delay: index * 0.05 }}
              >
                <motion.button
                  ref={profile.active ? activeRef : undefined}
                  type="button"
                  disabled={dimmed || (managing && last) || switcher.busy}
                  title={managing && last ? "Profil terakhir tidak bisa dihapus." : undefined}
                  aria-label={managing ? `Hapus profil ${profile.role}` : `Buka profil ${profile.role}`}
                  aria-pressed={managing ? confirmDelete === profile.id : undefined}
                  onClick={() => (managing ? setConfirmDelete(profile.id) : void open(profile.id))}
                  animate={{ opacity: dimmed ? 0.3 : 1, scale: opening === profile.id ? 1.05 : 1 }}
                  transition={spring.slow}
                  className={cx("group flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl disabled:cursor-not-allowed", focusRing)}
                >
                  <span className={cx(tile,
                    confirmDelete === profile.id ? "border-border-error-default" : "border-border-button-default group-hover:border-border-button-hover group-focus-visible:border-border-button-hover",
                    // The last used profile is marked by its edge alone; the text says so for screen readers.
                    profile.active && !managing && "ring-2 ring-accent-500 ring-offset-2 ring-offset-background-full",
                    opening === profile.id && "border-border-focus-ring")}>
                    <ProfileGlyph mode={profile.mode} className={cx(
                      "absolute inset-0 size-full transition-transform duration-700 ease-out motion-reduce:transition-none",
                      !managing && "group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100",
                      managing && "opacity-40")} />
                    {managing && !last && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className={cx("flex size-11 items-center justify-center rounded-full border bg-background-primary-default shadow-sm",
                          confirmDelete === profile.id ? "border-border-error-default text-text-error-primary" : "border-border-button-default text-text-secondary group-hover:text-text-error-primary")}>
                          <RiDeleteBinLine className="size-5" aria-hidden />
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="flex w-full min-w-0 flex-col items-center gap-0.5">
                    <span className={cx(MODE_NAME, MODE_UNDERLINE[profile.mode], "mb-2")}>{profile.mode_label}</span>
                    <span className="line-clamp-2 text-body-medium text-text-secondary transition-colors group-hover:text-text-primary group-focus-visible:text-text-primary">
                      {profile.role}
                    </span>
                    <span className="text-caption-1 text-balance text-text-tertiary">{profile.region_name ?? "Seluruh Indonesia"}</span>
                    {profile.active && !managing && <span className="sr-only">Terakhir dipakai</span>}
                  </span>
                </motion.button>
              </motion.li>
            );
          })}

          {!managing && freeSlots > 0 && (
            <motion.li
              className="sm:w-44"
              initial={enter}
              animate={{ opacity: opening !== undefined ? 0.3 : 1, y: 0 }}
              transition={{ ...spring.slow, delay: profiles.length * 0.05 }}
            >
              <button
                type="button"
                disabled={opening !== undefined}
                onClick={() => navigateWithMorph("/onboarding")}
                className={cx("group flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl disabled:cursor-not-allowed", focusRing)}
              >
                <span style={{ viewTransitionName: DRAFT_CARD }} className={cx(tile, "border-border-button-default group-hover:border-border-button-hover group-focus-visible:border-border-button-hover")}>
                  {/* The same faceless Kodama opens onboarding, so the tile morphs into the draft without a jump. */}
                  <EmptyProfileArt className="absolute inset-0 size-full transition-transform duration-700 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-background-primary-default shadow-sm">
                      <RiAddLine className="size-6 text-text-secondary transition-colors group-hover:text-text-primary" aria-hidden />
                    </span>
                  </span>
                </span>
                <span className="flex w-full flex-col gap-0.5">
                  <span className="text-body-medium text-text-secondary transition-colors group-hover:text-text-primary">Tambah Profil</span>
                  <span className="text-caption-1 text-text-tertiary">{freeSlots} dari {max} slot tersisa</span>
                </span>
              </button>
            </motion.li>
          )}
        </ul>

        <div className="mt-10 flex min-h-20 flex-col items-center gap-3">
          {openingProfile ? (
            <p role="status" className="text-body-regular text-text-secondary">Membuka pantauan {openingProfile.role}...</p>
          ) : pending ? (
            <div role="alert" className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-4">
              <p className="text-body-regular text-pretty text-text-secondary">
                Hapus profil <span className="text-text-primary">{pending.role}</span>? Peran, wilayah, dan metriknya ikut terhapus.
                {pending.active && " Profil tertua yang tersisa akan menjadi profil terakhir dipakai."}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="small" onClick={() => setConfirmDelete(undefined)}>Batal</Button>
                <Button variant="danger" size="small" disabled={switcher.busy} onClick={() => void remove(pending.id)}>Hapus Profil</Button>
              </div>
            </div>
          ) : (
            <Button variant={managing ? "primary" : "secondary"} onClick={() => { setManaging(!managing); setConfirmDelete(undefined); }}>
              {managing ? "Selesai" : "Kelola Profil"}
            </Button>
          )}
        </div>
      </section>
    </ProfileStage>
  );
}
