import { useEffect, useRef } from "react";
import { useMap } from "@/components/ui/map";
import type { DTO } from "@/lib/api/client";
import { AIR_STOPS, SURFACE_STOPS, hasTemperature, heatRgb } from "./heat-ramp";

/**
 * A continuous temperature surface painted per pixel. A fill layer over region polygons would colour by
 * administrative boundary and show hard edges where the weather has none.
 */
export function HeatLayer({ grid, visible }: { grid: DTO<"WindGrid"> | undefined; visible: boolean }) {
  const { map } = useMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !grid || !visible) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // Ground surface is the heat a person on the street feels; air is the fallback for an older grid.
    const field = grid.surface?.length ? grid.surface : grid.temperature;
    const stops = grid.surface?.length ? SURFACE_STOPS : AIR_STOPS;
    const { nx, ny, west, east, south, north } = grid;

    const sample = (lon: number, lat: number): number | null => {
      const fx = ((lon - west) / (east - west)) * (nx - 1);
      const fy = ((lat - south) / (north - south)) * (ny - 1);
      if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return null;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, nx - 1), y1 = Math.min(y0 + 1, ny - 1);
      const tx = fx - x0, ty = fy - y0;
      let sum = 0, weight = 0;
      for (const [gx, gy, w] of [
        [x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)],
        [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty],
      ] as Array<[number, number, number]>) {
        const v = field[gy * nx + gx];
        if (v == null) continue;
        sum += v * w;
        weight += w;
      }
      return weight > 0 ? sum / weight : null;
    };

    const draw = () => {
      const base = map.getCanvas();
      // Quarter resolution: the field is smooth, and a full-size per-pixel loop stalls every pan.
      const step = 4;
      const w = Math.max(1, Math.round(base.clientWidth / step));
      const h = Math.max(1, Math.round(base.clientHeight / step));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${base.clientWidth}px`;
        canvas.style.height = `${base.clientHeight}px`;
      }
      const image = context.createImageData(w, h);
      const d = image.data;
      const EDGE_DEG = 0.5;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ll = map.unproject([x * step, y * step]);
          const t = sample(ll.lng, ll.lat);
          const i = (y * w + x) * 4;
          if (t == null) { d[i + 3] = 0; continue; }
          const [r, g, b] = heatRgb(t, stops);
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
          // Fade the last half-degree of coverage so the grid's edge does not read as a rendering artefact.
          const edge = Math.min((ll.lng - west) / EDGE_DEG, (east - ll.lng) / EDGE_DEG, (ll.lat - south) / EDGE_DEG, (north - ll.lat) / EDGE_DEG, 1);
          // Translucent so roads, borders and labels underneath stay legible.
          d[i + 3] = Math.round(110 * Math.max(0, Math.min(1, edge)));
        }
      }
      context.putImageData(image, 0, 0);
    };

    draw();
    // Repaint only when the view settles; redrawing mid-gesture runs the pixel loop for frames nobody sees.
    map.on("moveend", draw);
    map.on("resize", draw);
    return () => {
      map.off("moveend", draw);
      map.off("resize", draw);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [map, grid, visible]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[4]"
      style={{ display: visible && hasTemperature(grid) ? "block" : "none" }}
    />
  );
}
