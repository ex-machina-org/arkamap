import type { ReactNode } from "react";
import { Radio as AriaRadio } from "react-aria-components";
import { RiSparkling2Line } from "@remixicon/react";
import { RadioDot, RadioGroup } from "@/components/base/radio/radio";
import type { DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import type { ModeChoice } from "./profile-draft-card";
import { EmptyProfileArt, ProfileGlyph } from "./profile-glyph";

type Mode = DTO<"ProfileOut">["mode"];

// Shown when GET /modes fails, so the user can still choose a mode; the backend owns the real copy.
const FALLBACK: { id: Mode; title: string; description: string }[] = [
  { id: "protected", title: "Tanggap darurat", description: "Kejadian terbaru, wilayah terdampak, dan peringatan yang sedang berlaku." },
  { id: "responden", title: "Pencegahan", description: "Tingkat risiko sekarang, prakiraan 1 sampai 3 hari, dan wilayah yang perlu diperhatikan." },
  { id: "plan", title: "Perencanaan", description: "Prakiraan 30 hari, pola musiman, kerawanan jangka panjang, dan riwayat setahun." },
];

function Option({ value, art, title, description }: { value: ModeChoice; art: ReactNode; title: string; description: string }) {
  return (
    <AriaRadio
      value={value}
      className={({ isSelected, isHovered, isFocusVisible, isDisabled }) => cx(
        "flex cursor-pointer items-start gap-3 rounded-2xl border bg-background-primary-default p-3 text-left outline-none transition-colors",
        isSelected ? "border-accent-500" : isHovered ? "border-border-button-hover" : "border-border-button-default",
        isFocusVisible && "ring-2 ring-border-focus-ring ring-offset-2 ring-offset-background-full",
        isDisabled && "cursor-not-allowed opacity-50",
      )}
    >
      {({ isSelected, isFocusVisible }) => (
        <>
          <span className="relative block size-14 shrink-0 overflow-hidden rounded-xl border border-border-button-default bg-background-primary-default">{art}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
            <span className="text-body-medium text-text-primary">{title}</span>
            <span className="text-body-2-regular text-pretty text-text-secondary">{description}</span>
          </span>
          <span className="flex shrink-0 pt-1"><RadioDot size="md" selected={isSelected} focusVisible={isFocusVisible} /></span>
        </>
      )}
    </AriaRadio>
  );
}

/** The three monitoring modes plus handing the choice to AI; nothing is preselected, so the choice stays the user's. */
export function ModeOptions({ modes, value, onChange, disabled, invalid }: {
  modes: DTO<"ModeInfo">[];
  value?: ModeChoice;
  onChange: (mode: ModeChoice) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const options = modes.length ? modes.map(({ id, title, description }) => ({ id, title, description })) : FALLBACK;
  return (
    <RadioGroup
      aria-label="Mode pantauan"
      value={value ?? null}
      onChange={next => onChange(next as ModeChoice)}
      isDisabled={disabled}
      isInvalid={invalid}
      className="grid gap-3 sm:grid-cols-2"
    >
      {options.map(option => (
        <Option key={option.id} value={option.id} title={option.title} description={option.description}
          art={<ProfileGlyph mode={option.id} className="absolute inset-0 size-full" />} />
      ))}
      <Option value="auto" title="Biarkan AI memilih" description="AI membaca peran dan masalah Anda, lalu memilih mode yang paling cocok. Hasilnya tampil sebelum Anda masuk dashboard."
        art={<>
          <EmptyProfileArt className="absolute inset-0 size-full" />
          <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background-primary-default shadow-sm"><RiSparkling2Line className="size-3 text-foreground-icon-secondary" aria-hidden /></span>
        </>} />
    </RadioGroup>
  );
}
