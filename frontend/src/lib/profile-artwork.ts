import kodamaPlan from "@/assets/profiles/kodama-plan.webp";
import kodamaProtected from "@/assets/profiles/kodama-protected.webp";
import kodamaResponden from "@/assets/profiles/kodama-responden.webp";
import type { DTO } from "@/lib/api/client";

type Mode = DTO<"ProfileOut">["mode"];

const artwork: Record<Mode, string> = {
  protected: kodamaProtected,
  responden: kodamaResponden,
  plan: kodamaPlan,
};

/** The Kodama portrait of a mode, as shown on the profile picker. */
export function profileArtwork(mode: Mode) {
  return artwork[mode];
}
