import { Map, MapMarker, MarkerContent } from "@/components/ui/map";
import { formatNumber } from "./format";

/** Small locator map for one coordinate pair, with the coordinates also written out. */
export function LocationMap({ lat, lon, label, height = 160 }: { lat: number; lon: number; label: string; height?: number }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return <p className="text-body-compact text-text-secondary">Koordinat tidak valid.</p>;
  }
  return <div className="flex flex-col gap-1.5">
    <div className="overflow-hidden rounded-lg" style={{ height }}>
      <Map center={[lon, lat]} zoom={11}>
        <MapMarker longitude={lon} latitude={lat}>
          <MarkerContent><span className="rounded-md bg-background-primary-default px-2 py-1 text-caption-1 text-text-primary shadow-dropdown">{label}</span></MarkerContent>
        </MapMarker>
      </Map>
    </div>
    <p className="text-caption-1 tabular-nums text-text-secondary">{formatNumber(lat)}, {formatNumber(lon)}</p>
  </div>;
}
