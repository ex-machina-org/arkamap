"use client";

import { useState } from "react";
import { RiHeart3Fill } from "@remixicon/react";
import { Avatar, type AvatarProps } from "@/components/base/avatar/avatar";
import { cx } from "@/utils/cx";
import { SettingsCard, SettingsSectionLabel } from "./settings-rows";

// Roster from joints-docs/docs/team/2026-09-23-jobdesk-tim-ex-machina.md.
const MEMBERS: { name: string; role: string; color: AvatarProps["color"] }[] = [
  { name: "Mahar", role: "Product, Platform Experience, dan FE Lead", color: "accent" },
  { name: "Dicha", role: "Agent Platform dan Backend Lead", color: "blue" },
  { name: "Yusma", role: "Environmental Intelligence dan Analytics Lead", color: "lime" },
  { name: "Marsa", role: "IoT dan Live Environmental Data Lead", color: "pink" },
];

const SECRET_TAPS = 5;

/** Easter egg page: the team behind Arkamap. Tapping the team name reveals a note. */
export function ArkamapSettingsCredits() {
  const [taps, setTaps] = useState(0);
  const unlocked = taps >= SECRET_TAPS;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col items-center gap-1 rounded-2xl bg-background-secondary-default px-6 py-8 text-center">
        <button
          type="button"
          onClick={() => setTaps((count) => count + 1)}
          aria-label="Ex Machina"
          className={cx(
            "cursor-pointer rounded-lg px-2 text-title-2-semibold text-text-primary outline-none select-none",
            "transition-transform duration-150 ease active:scale-95 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            unlocked && "credits-wiggle",
          )}
        >
          Ex Machina
        </button>
        <p className="text-body-2-regular text-text-secondary">Arkamap untuk JOINTS UGM 2026</p>
        {taps > 0 && !unlocked && (
          <p aria-live="polite" className="text-caption-1-regular text-text-tertiary">
            {SECRET_TAPS - taps} lagi...
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <SettingsSectionLabel>Tim</SettingsSectionLabel>
        <SettingsCard>
          {MEMBERS.map((member, index) => (
            <div
              key={member.name}
              className="flex min-h-[52px] items-center gap-3 border-b border-separator-border py-2.5 pr-2.5 last:border-b-0"
            >
              <Avatar
                size="lg"
                color={member.color}
                initials={member.name[0]}
                className={cx(unlocked && "credits-hop")}
                style={unlocked ? { animationDelay: `${index * 90}ms` } : undefined}
              />
              <div className="flex min-w-0 flex-col">
                <p className="text-body-regular text-text-primary">{member.name}</p>
                <p className="text-body-2-regular text-text-secondary">{member.role}</p>
              </div>
            </div>
          ))}
        </SettingsCard>
      </div>

      {unlocked && (
        <p role="status" className="credits-reveal flex items-center justify-center gap-1.5 text-body-2-regular text-pretty text-text-secondary">
          <RiHeart3Fill className="size-4 shrink-0 text-text-error-primary" aria-hidden />
          Dibuat dengan kopi, begadang, dan banyak sekali peta. Terima kasih sudah menemukan ini.
        </p>
      )}
    </div>
  );
}
