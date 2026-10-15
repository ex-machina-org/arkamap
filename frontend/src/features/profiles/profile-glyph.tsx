import kodamaEmpty from "@/assets/profiles/kodama-empty.webp";
import type { DTO } from "@/lib/api/client";
import { profileArtwork } from "@/lib/profile-artwork";
import { cx } from "@/utils/cx";

type Mode = DTO<"ProfileOut">["mode"];

// The art is square with its backdrop painted in. It is zoomed past the tile so the mascot fills it.
// The origin sits near the top so the sprout is kept; the bottom of the body is what gets cropped.
function Portrait({ src, className }: { src: string; className?: string }) {
  return (
    <span aria-hidden className={cx("block overflow-hidden", className)}>
      <img src={src} alt="" className="block size-full origin-[50%_10%] scale-[1.15] object-cover" />
    </span>
  );
}

/** A mode's Kodama portrait. */
export function ProfileGlyph({ mode, className }: { mode: Mode; className?: string }) {
  return <Portrait src={profileArtwork(mode)} className={className} />;
}

/** The faceless grey Kodama: a profile slot that has no mode yet, or is still to be created. */
export function EmptyProfileArt({ className }: { className?: string }) {
  return <Portrait src={kodamaEmpty} className={className} />;
}

