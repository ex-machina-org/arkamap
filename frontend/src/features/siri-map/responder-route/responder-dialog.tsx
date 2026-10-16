import { useState } from "react";
import { toast } from "sonner";
import {
  RiCrosshair2Line,
  RiMapPinLine,
  RiRouteLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cx } from "@/utils/cx";
import type { TacticalRouteRequest } from "./types";
import type { SpatialIncident } from "../types";

interface ResponderDialogProps {
  incident: SpatialIncident | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (request: TacticalRouteRequest) => void;
}

export function ResponderDialog({
  incident,
  isOpen,
  onClose,
  onSubmit,
}: ResponderDialogProps) {
  const [originType, setOriginType] = useState<"gps" | "base">("base");
  const [isLocating, setIsLocating] = useState(false);
  const [customOrigin, setCustomOrigin] = useState<[number, number] | null>(null);

  if (!incident) return null;

  // Default staging base ~4km west of the incident
  const defaultBaseCoords: [number, number] = [
    incident.coords[0] - 0.038,
    incident.coords[1] - 0.015,
  ];

  function handleGetGps() {
    if (!navigator.geolocation) {
      toast.error("Geolocation tidak didukung oleh browser Anda.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setCustomOrigin([pos.coords.longitude, pos.coords.latitude]);
        setOriginType("gps");
        toast.success("Koordinat GPS berhasil diperoleh.");
      },
      (err) => {
        setIsLocating(false);
        toast.error(`Gagal memperoleh GPS: ${err.message}. Menggunakan pos default.`);
        setOriginType("base");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  function handleCalculate() {
    if (!incident) return;

    const originCoords =
      originType === "gps" && customOrigin
        ? customOrigin
        : defaultBaseCoords;

    const originLabel =
      originType === "gps"
        ? "Posisi GPS Tim Lapangan"
        : "Posko Induk Terdekat";

    onSubmit({
      incidentId: incident.id,
      hazardType: incident.hazardType,
      incidentTitle: incident.title,
      incidentCoords: incident.coords,
      originCoords,
      originLabel,
    });
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-status-cyan-background text-status-cyan-text">
              <RiRouteLine className="size-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-title-2-semibold text-text-primary">
                Jalur Akses & Evakuasi
              </DialogTitle>
              <DialogDescription className="text-body-2-regular text-text-secondary">
                Tentukan titik keberangkatan tim bala bantuan untuk menghitung rute aman.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3.5 py-2 text-body-medium">
          {/* Target incident banner */}
          <div className="rounded-xl border border-border-button-default bg-background-secondary-default p-3">
            <p className="text-caption-1-medium text-text-secondary">
              Lokasi Insiden Target
            </p>
            <p className="text-body-semibold text-text-primary">
              {incident.title}
            </p>
            <p className="text-caption-1-regular text-text-tertiary">
              {incident.reading} · {incident.source}
            </p>
          </div>

          {/* Starting point selector */}
          <div>
            <label className="mb-2 block text-caption-1-semibold text-text-primary">
              Titik Keberangkatan Tim Penolong
            </label>
            <div className="space-y-2">
              <div
                onClick={() => setOriginType("base")}
                className={cx(
                  "flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all",
                  originType === "base"
                    ? "border-border-focus-ring bg-background-secondary-hover ring-1 ring-border-focus-ring"
                    : "border-border-button-default hover:bg-background-secondary-default"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-background-secondary-default text-text-secondary">
                    <RiMapPinLine className="size-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-body-2-semibold text-text-primary">
                      Posko Induk / Pos Terdekat
                    </p>
                    <p className="text-caption-1-regular text-text-tertiary">
                      Est. ~4.2 km dari titik kejadian
                    </p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="origin"
                  checked={originType === "base"}
                  onChange={() => setOriginType("base")}
                  className="size-4"
                />
              </div>

              <div
                onClick={handleGetGps}
                className={cx(
                  "flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all",
                  originType === "gps"
                    ? "border-border-focus-ring bg-background-secondary-hover ring-1 ring-border-focus-ring"
                    : "border-border-button-default hover:bg-background-secondary-default"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-background-secondary-default text-text-secondary">
                    <RiCrosshair2Line className="size-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-body-2-semibold text-text-primary">
                      Gunakan Posisi GPS Saya
                    </p>
                    <p className="text-caption-1-regular text-text-tertiary">
                      {customOrigin
                        ? `GPS terkunci (${customOrigin[1].toFixed(4)}, ${customOrigin[0].toFixed(4)})`
                        : isLocating
                        ? "Mencari sinyal GPS..."
                        : "Deteksi lokasi armada darurat saat ini"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={isLocating}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGetGps();
                  }}
                >
                  {isLocating ? "Mencari..." : customOrigin ? "Perbarui" : "Ambil GPS"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" size="medium" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            size="medium"
            leadingIcon={RiRouteLine}
            onClick={handleCalculate}
          >
            Hitung Jalur Aman
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
