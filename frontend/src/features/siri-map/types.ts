export type HazardType = "hotspot" | "flood" | "air_quality" | "seismic" | "iot_sensor" | "disaster";
export type BasemapType = "street" | "detail" | "satellite" | "heat";

/** A recorded event returned by the public data APIs. */
export interface SpatialIncident {
  id: string;
  title: string;
  coords: [number, number]; // [lng, lat]
  hazardType: HazardType;
  source: string;
  /** ISO timestamp from the source. */
  lastUpdated: string;
  /** Short value shown on the pin and card, e.g. "M 5.1" or "12.4 MW". */
  reading: string;
  summary: string;
}
