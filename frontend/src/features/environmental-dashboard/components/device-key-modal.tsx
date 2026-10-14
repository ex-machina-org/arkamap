import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import type { DTO } from "@/lib/api/client";
import { DeviceQuickstart } from "./device-quickstart";
import { Notice, SecretField } from "./device-ui";

/** Shows a freshly issued key once, with code already filled in for it. */
export function DeviceKeyModal({ value, onClose }: { value: { api_key: string; quickstart: DTO<"Quickstart"> }; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return <Dialog open onOpenChange={open => { if (!open && saved) onClose(); }}><DialogContent className="max-h-[85dvh] overflow-auto">
    <DialogHeader>
      <DialogTitle>Simpan Kunci Baru</DialogTitle>
      <DialogDescription>Kunci lama sudah tidak berlaku. Pasang kunci ini pada alat agar pengiriman data berlanjut.</DialogDescription>
    </DialogHeader>
    <div className="flex flex-col gap-4">
      <Notice tone="warning" title="Kunci Hanya Ditampilkan Sekali">Server hanya menyimpan versi tersandinya. Jangan bagikan kunci ini.</Notice>
      <SecretField label="Kunci API Baru" value={value.api_key} />
      <DeviceQuickstart quickstart={value.quickstart} />
      <Checkbox isSelected={saved} onChange={setSaved}>Saya sudah menyimpan kunci</Checkbox>
    </div>
    <DialogFooter><Button disabled={!saved} onClick={onClose}>Selesai</Button></DialogFooter>
  </DialogContent></Dialog>;
}
