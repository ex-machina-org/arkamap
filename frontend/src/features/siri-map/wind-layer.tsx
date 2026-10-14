import { useEffect, useRef } from "react";
import { useMap } from "@/components/ui/map";
import type { DTO } from "@/lib/api/client";

// Ported from Nusantara Atlas so the flow field looks and moves the same.
// 1100 rather than 2600: the visual difference is small and it halves the per-frame work.
const COUNT = 1100;
const MAX_AGE = 160;
// Degrees of travel per km/h per second; an equivalent of ~0.55/frame read as a gale at every zoom.
const SPEED = 0.1;
const FADE = 0.955;
// Cyan for slow, white for fast: a hue none of the map's data layers use. Banded so each band strokes as one path.
const SPEED_BANDS = 4;
const CORE_COLORS = Array.from({ length: SPEED_BANDS }, (_, band) => {
  const t = band / (SPEED_BANDS - 1);
  return `rgba(${Math.round(40 + t * 215)},${Math.round(220 + t * 35)},255,0.95)`;
});

interface Particle { lon: number; lat: number; age: number }

/**
 * Animated wind particles, the Windy-style flow field. Drawn on a 2D canvas over the map rather than
 * as a MapLibre layer: the trail needs the previous frame left partly intact, which a GL layer that
 * clears every frame cannot do.
 */
export function WindLayer({ grid, visible }: { grid: DTO<"WindGrid"> | undefined; visible: boolean }) {
  const { map, resolvedTheme } = useMap();
  const dark = resolvedTheme === "dark";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !grid || !visible) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let running = true;
    let raf = 0;

    const fit = () => {
      const base = map.getCanvas();
      // Capped at 1.5: compositing this full-screen canvas over WebGL dominates the frame, and soft trails lose nothing visible above it.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(base.clientWidth * dpr);
      canvas.height = Math.round(base.clientHeight * dpr);
      canvas.style.width = `${base.clientWidth}px`;
      canvas.style.height = `${base.clientHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    /** Bilinear sample of the grid as a [u, v] vector. */
    const sample = (lon: number, lat: number): [number, number] | null => {
      const { nx, ny, west, east, south, north, direction, speed } = grid;
      const fx = ((lon - west) / (east - west)) * (nx - 1);
      const fy = ((lat - south) / (north - south)) * (ny - 1);
      if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return null;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, nx - 1), y1 = Math.min(y0 + 1, ny - 1);
      const tx = fx - x0, ty = fy - y0;
      // Interpolate the vector, never the bearing: averaging 350 and 10 degrees gives 180.
      let u = 0, v = 0;
      for (const [gx, gy, w] of [
        [x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)],
        [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty],
      ] as Array<[number, number, number]>) {
        const i = gy * nx + gx;
        // A meteorological bearing is where the wind comes from, so add 180 for the travel direction.
        const rad = ((direction[i] + 180) * Math.PI) / 180;
        u += Math.sin(rad) * speed[i] * w;
        v += Math.cos(rad) * speed[i] * w;
      }
      return [u, v];
    };

    const spawn = (p: Particle) => {
      const b = map.getBounds();
      p.lon = b.getWest() + Math.random() * (b.getEast() - b.getWest());
      p.lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth());
      p.age = Math.floor(Math.random() * MAX_AGE);
    };

    if (particles.current.length !== COUNT) {
      particles.current = Array.from({ length: COUNT }, () => {
        const p: Particle = { lon: 0, lat: 0, age: 0 };
        spawn(p);
        return p;
      });
    }

    // Trails live in screen space, so a moved map leaves them stale; the frame loop fades harder for a moment instead of blinking.
    let moving = 0;
    const onMove = () => { moving = performance.now(); };
    let last = performance.now();

    const frame = (now: number) => {
      if (!running) return;
      // Clamped: a backgrounded tab returns a huge delta and would teleport every particle.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const want = Math.round(map.getCanvas().clientWidth * Math.min(window.devicePixelRatio || 1, 1.5));
      if (canvas.width !== want) fit();

      // Fade instead of clear: what remains of the last frame is the trail.
      const fade = performance.now() - moving < 250 ? 0.8 : FADE;
      context.globalCompositeOperation = "destination-in";
      context.fillStyle = `rgba(0,0,0,${fade})`;
      context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      context.globalCompositeOperation = "source-over";
      context.lineCap = "round";

      // Degrees per second shrink as you zoom in so the on-screen speed stays steady.
      const scale = (SPEED * dt) / Math.pow(2, (map.getZoom() - 4) * 0.95);

      // Segments are collected first and stroked as a few batched paths: one stroke call per particle
      // (twice, with the halo) is what made the layer heavy.
      const halo = new Path2D();
      const cores = Array.from({ length: SPEED_BANDS }, () => new Path2D());
      for (const p of particles.current) {
        const uv = sample(p.lon, p.lat);
        if (!uv || p.age++ > MAX_AGE) { spawn(p); continue; }
        const [u, v] = uv;
        const nlon = p.lon + u * scale;
        const nlat = p.lat + v * scale;
        const a = map.project([p.lon, p.lat]);
        const z = map.project([nlon, nlat]);
        const band = Math.min(SPEED_BANDS - 1, Math.floor((Math.hypot(u, v) / 35) * SPEED_BANDS));
        halo.moveTo(a.x, a.y);
        halo.lineTo(z.x, z.y);
        cores[band].moveTo(a.x, a.y);
        cores[band].lineTo(z.x, z.y);
        p.lon = nlon;
        p.lat = nlat;
      }
      // A dark halo under a bright core keeps the trail readable over imagery, the street map and the orange hotspot pins alike.
      context.lineWidth = 3.2;
      context.strokeStyle = dark ? "rgba(0,12,24,0.45)" : "rgba(0,20,40,0.55)";
      context.stroke(halo);
      context.lineWidth = 1.6;
      cores.forEach((path, band) => {
        context.strokeStyle = CORE_COLORS[band];
        context.stroke(path);
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    map.on("resize", fit);
    map.on("move", onMove);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      map.off("resize", fit);
      map.off("move", onMove);
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };
  }, [map, grid, visible, dark]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5]"
      style={{ display: visible && grid ? "block" : "none" }}
    />
  );
}
