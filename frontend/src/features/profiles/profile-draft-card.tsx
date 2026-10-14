import { AnimatePresence, motion } from "motion/react";
import { RiSparkling2Line } from "@remixicon/react";
import { spring } from "@/lib/springs";
import type { DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import { EmptyProfileArt, ProfileGlyph } from "./profile-glyph";
import { MODE_NAME, MODE_UNDERLINE } from "./profile-copy";
import { DRAFT_CARD } from "./profile-transition";

export type ModeChoice = DTO<"ProfileOut">["mode"] | "auto";

type Props = {
  seed: number;
  mode?: ModeChoice;
  modeLabel?: string;
  role: string;
  /** Undefined until the user has picked a location. */
  region?: string;
  compact?: boolean;
};

/**
 * The profile as the picker will show it, filled in while the user answers. It carries the
 * picker's "Tambah Profil" tile across the page transition, so the new profile visibly takes shape.
 */
export function ProfileDraftCard({ seed, mode, modeLabel, role, region, compact = false }: Props) {
  const drawn = mode !== undefined && mode !== "auto";
  const tile = (
    <span
      // Both layouts carry the name; the one hidden at this width is display:none, which a view transition skips.
      style={{ viewTransitionName: DRAFT_CARD }}
      className={cx(
        "relative block aspect-square shrink-0 overflow-hidden border border-border-button-default bg-background-primary-default",
        compact ? "w-14 rounded-xl" : "w-full rounded-2xl",
      )}
    >
      <AnimatePresence initial={false}>
        {drawn ? (
          <motion.span key={`${mode}-${seed}`} className="absolute inset-0" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: spring.moderate.exit }} transition={spring.slow}>
            <ProfileGlyph mode={mode} className="size-full" />
          </motion.span>
        ) : (
          <motion.span key="empty" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.moderate.exit }} transition={spring.moderate}>
            <EmptyProfileArt className="size-full" />
            {mode === "auto" && (
              <span className={cx("absolute flex items-center justify-center rounded-full bg-background-primary-default shadow-sm", compact ? "right-1 top-1 size-5" : "right-2.5 top-2.5 size-8")}>
                <RiSparkling2Line className={cx("text-foreground-icon-secondary", compact ? "size-3" : "size-4.5")} aria-hidden />
              </span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        {tile}
        <span className="flex min-w-0 flex-col">
          <span className={cx("truncate text-body-medium", role ? "text-text-primary" : "text-text-tertiary")}>{role || "Profil baru"}</span>
          <span className="truncate text-caption-1 text-text-tertiary">{[modeLabel ? `Mode ${modeLabel}` : "Mode belum dipilih", region ?? "lokasi belum dipilih"].join(", ")}</span>
        </span>
      </div>
    );
  }

  return (
    <figure className="flex flex-col items-center gap-3 text-center">
      {tile}
      <figcaption className="flex w-full min-w-0 flex-col items-center gap-0.5">
        {/* Same lockup as the picker tile; until a mode is drawn the name is muted and its underline neutral. */}
        <span className={cx(MODE_NAME, "mb-2", drawn ? MODE_UNDERLINE[mode] : "text-text-tertiary decoration-border-button-hover")}>{modeLabel ?? "Mode belum dipilih"}</span>
        <span className={cx("line-clamp-2 text-body-medium", role ? "text-text-primary" : "text-text-tertiary")}>{role || "Peran Anda"}</span>
        <span className="text-caption-1 text-balance text-text-tertiary">{region ?? "Lokasi belum dipilih"}</span>
      </figcaption>
    </figure>
  );
}
