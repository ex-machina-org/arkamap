import { RiAlarmWarningLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cx } from "@/utils/cx";
import type { DangerItem } from "../alert-level";
import { ALERT_CATEGORIES } from "../use-alerts";
import { insetClass } from "./dashboard-card";

const CATEGORY_LABEL = Object.fromEntries(ALERT_CATEGORIES.map(category => [category.id, category.label]));
const SHOWN = 5;

/** Danger alerts the user hasn't seen yet. Any way of closing it counts as seen. */
export function DangerAlertDialog({ items, regionName, onClose, onOpenAlerts }: {
  items: DangerItem[];
  regionName?: string | null;
  onClose: () => void;
  onOpenAlerts: () => void;
}) {
  return (
    <Dialog open={items.length > 0} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-notification-error-background text-foreground-icon-error">
              <RiAlarmWarningLine className="size-5" aria-hidden />
            </span>
            <div>
              <DialogTitle className="text-title-2-semibold">
                {items.length === 1 ? "1 peringatan bahaya baru" : `${items.length} peringatan bahaya baru`}
              </DialogTitle>
              <DialogDescription className="text-body-medium text-text-secondary">
                {regionName ? `Di wilayah pantauan Anda, ${regionName}.` : "Pilih wilayah di profil agar peringatan fokus ke daerah Anda."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, SHOWN).map(item => (
            <li key={item.key} className={cx(insetClass, "flex items-center gap-2 px-3 py-2")}>
              <Chip variant="bold" color="rose">{CATEGORY_LABEL[item.category]}</Chip>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-medium text-text-primary">{item.title}</span>
                <span className="truncate text-body-2-regular text-text-secondary">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {items.length > SHOWN && <p className="mt-2 text-body-2-regular text-text-secondary">dan {items.length - SHOWN} lainnya.</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
          <Button variant="primary" onClick={onOpenAlerts}>Lihat peringatan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
