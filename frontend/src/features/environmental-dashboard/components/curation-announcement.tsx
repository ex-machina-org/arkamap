import { useState } from "react";
import { RiSensorLine, RiSparklingFill } from "@remixicon/react";
import { Announcement } from "@/components/base/announcement/announcement";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DashboardView } from "../types";

const FIT = { cocok: "Data cocok dengan kebutuhan Anda", sebagian: "Data sebagian cocok", tidak_cocok: "Data belum cocok" } as const;

/** BoardUI Announcement summarising why the view looks like this; the full AI explanation opens in a dialog. */
export function CurationAnnouncement({ view }: { view: DashboardView }) {
  const [open, setOpen] = useState(false);
  const fit = view.fit ? FIT[view.fit] : "Kecocokan belum dievaluasi";
  const missing = view.unsupported.length ? ` · ${view.unsupported.length} kebutuhan belum tersedia` : "";
  return <>
    <Announcement icon={RiSparklingFill} title={`Disusun untuk ${view.field.label}`} description={`${fit}${missing}`} actionLabel="Lihat penjelasan" onAction={() => setOpen(true)} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mengapa dashboard ini</DialogTitle>
          <DialogDescription>Penjelasan AI Arkamap dari profil yang Anda isi, termasuk keterbatasan datanya.</DialogDescription>
        </DialogHeader>
        {view.message && <p className="text-body-regular whitespace-pre-line text-text-primary">{view.message}</p>}
        {!!view.unsupported.length && <div className="mt-4 flex flex-col gap-2">
          <p className="text-body-medium text-text-primary">Belum tersedia di Arkamap</p>
          <ul className="flex flex-wrap gap-2">{view.unsupported.map(item => <li key={item}><Chip variant="subtle" color="yellow">{item}</Chip></li>)}</ul>
        </div>}
        <DialogFooter>
          {!!view.unsupported.length && <Button variant="secondary" leadingIcon={RiSensorLine} onClick={() => window.location.assign("/devices/new")}>Pasang sensor sendiri</Button>}
          <Button onClick={() => setOpen(false)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
