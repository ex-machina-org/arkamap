import { useState, type ComponentType, type ReactNode } from "react";
import { RiCheckboxCircleLine, RiCloseLine, RiErrorWarningLine, RiEyeLine, RiEyeOffLine, RiFileCopyLine, RiInformationLine } from "@remixicon/react";
import { StatIconTile, type StatTone } from "@/components/application/dashboard/stat-cards";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { copyText } from "./device-helpers";
import { cx } from "@/utils/cx";
import { cardClass } from "./dashboard-card";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** Card with an icon-tile header: the shared shape of every form and settings section in the device pages. */
export function SectionCard({ icon, tone = "blue", title, description, action, children, className }: {
  icon: IconComponent;
  tone?: StatTone;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return <section className={cx(cardClass, "gap-5", className)}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      {/* Tile centred on the title + description block, so both lines read as one label for it. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <StatIconTile icon={icon} tone={tone} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-title-3-medium text-pretty text-text-primary">{title}</h2>
          {description && <p className="max-w-prose text-body-2-regular text-pretty text-text-secondary">{description}</p>}
        </div>
      </div>
      {action}
    </header>
    {children}
  </section>;
}

const NOTICE_TONE = {
  info: { box: "bg-status-blue-background text-status-blue-text", icon: RiInformationLine },
  success: { box: "bg-status-lime-background text-status-lime-text", icon: RiCheckboxCircleLine },
  warning: { box: "bg-status-yellow-background text-status-yellow-text", icon: RiErrorWarningLine },
  danger: { box: "bg-status-rose-background text-status-rose-text", icon: RiErrorWarningLine },
} as const;

/** Inline message on the BoardUI status tokens; `danger` is announced as an alert. */
export function Notice({ tone = "info", title, children, icon, className, onClose }: { tone?: keyof typeof NOTICE_TONE; title: string; children?: ReactNode; icon?: IconComponent; className?: string; onClose?: () => void }) {
  const Icon = icon ?? NOTICE_TONE[tone].icon;
  return <div role={tone === "danger" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-2lg p-3.5", NOTICE_TONE[tone].box, className)}>
    <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="text-body-medium">{title}</p>
      {children && <div className="text-body-2-regular text-pretty opacity-90">{children}</div>}
    </div>
    {onClose && <Button size="small" variant="ghost" iconOnly aria-label="Tutup Peringatan" leadingIcon={RiCloseLine} className="-my-1 -mr-1 shrink-0 text-current" onClick={onClose} />}
  </div>;
}

/** The one-time API key in a read-only field, masked until the owner asks to see it. */
export function SecretField({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  return <div className="flex items-end gap-2">
    <Input label={label} value={value} isReadOnly type={shown ? "text" : "password"} fieldClassName="font-mono" className="min-w-0 flex-1" />
    <Button variant="secondary" iconOnly leadingIcon={shown ? RiEyeOffLine : RiEyeLine} aria-label={shown ? "Sembunyikan Kunci" : "Tampilkan Kunci"} aria-pressed={shown} onClick={() => setShown(value => !value)} />
    <Button variant="secondary" leadingIcon={RiFileCopyLine} onClick={() => copyText(value, "Kunci")}>Salin</Button>
  </div>;
}

/** Label and value pair for read-only facts, laid out as a definition list row. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-caption-1-regular text-text-secondary">{label}</dt>
    <dd className="min-w-0 truncate text-body-medium text-text-primary">{children}</dd>
  </div>;
}
