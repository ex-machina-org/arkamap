import type { DTO } from "@/lib/api/client";

type Mode = DTO<"ProfileOut">["mode"];

/**
 * The mode name stands on its own line under the portrait. Its text keeps the primary colour so it
 * reads in both themes; the mode's colour, matching the portrait's backdrop, is carried by a thick underline.
 */
export const MODE_NAME = "text-title-3-semibold text-text-primary underline decoration-[3px] underline-offset-[6px]";

export const MODE_UNDERLINE: Record<Mode, string> = {
  protected: "decoration-warning",
  responden: "decoration-success",
  plan: "decoration-info",
};
