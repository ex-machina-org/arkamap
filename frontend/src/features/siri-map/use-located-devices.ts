import { useEffect, useState } from "react";
import { apiList, type DTO } from "@/lib/api/client";

export type LocatedDevice = DTO<"DeviceOut"> & { lat: number; lon: number };

/** The account's devices that have a location. Signed out, or when the list fails, the map simply has none. */
export function useLocatedDevices(signedIn: boolean) {
  const [devices, setDevices] = useState<LocatedDevice[]>([]);
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    apiList("/me/devices", "DeviceOut", { signal: controller.signal })
      .then(list => {
        if (!controller.signal.aborted) setDevices(list.filter((d): d is LocatedDevice => d.lat != null && d.lon != null));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [signedIn]);
  return signedIn ? devices : [];
}
