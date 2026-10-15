import type { ReactNode } from "react";
import type { RowStatus } from "../alert-level";

/** What a row is about; picks the drawing beside it. */
export type AlertKind = "device" | "source" | "fire" | "fireRisk" | "heat" | "weather" | "quake" | "disaster" | "region";

type Mood = RowStatus["color"];

const INK = "#3b2314", BLUSH = "#f7b9a6", MOUTH = "#c9573f", BROW = "#5e8f2a";
const HOOD = "#8dc63f", EAR = "#4f6b2a", FACE = "#fcf5e3";
const LED: Record<Mood, string> = { rose: "#ef4444", yellow: "#f59e0b", lime: "#22c55e", neutral: "#9ca3af" };

/** A Raspberry Pi 5, the same for every device: its status LED carries the level, grey when offline or unknown. */
function RaspberryPi({ mood }: { mood: Mood }) {
  return <svg viewBox="0 0 40 40" className="size-9 overflow-visible">
    <rect x="1" y="7" width="35" height="26" rx="2.2" fill="#2f9a4c" stroke="#1f7a3a" strokeWidth=".6" />
    {[[4.2, 10.2], [26.5, 10.2], [4.2, 29.8], [26.5, 29.8]].map(([cx, cy]) => <g key={`${cx}:${cy}`}>
      <circle cx={cx} cy={cy} r="1.8" fill="#e8c547" /><circle cx={cx} cy={cy} r=".8" fill="#1f7a3a" />
    </g>)}
    <rect x="7.5" y="8.2" width="17" height="3.4" rx=".4" fill="#1f2328" />
    {Array.from({ length: 8 }, (_, index) => <circle key={index} cx={8.9 + index * 2} cy="9.9" r=".45" fill="#d4af37" />)}
    <rect x="11" y="15" width="9" height="9" rx="1" fill="#d3d7dc" stroke="#9aa1a9" strokeWidth=".5" />
    <path d="M12.5 17.5h6M12.5 19.5h6M12.5 21.5h4" stroke="#aab0b8" strokeWidth=".5" />
    <rect x="22" y="16.5" width="4.5" height="4.5" rx=".5" fill="#1f2328" />
    <rect x="31" y="8.5" width="8" height="6.5" rx=".6" fill="#d7dbe0" stroke="#9aa1a9" strokeWidth=".5" />
    <rect x="31" y="16.2" width="8" height="6.5" rx=".6" fill="#d7dbe0" stroke="#9aa1a9" strokeWidth=".5" />
    <rect x="31" y="23.9" width="8" height="8.2" rx=".6" fill="#c3c8ce" stroke="#9aa1a9" strokeWidth=".5" />
    <path d="M32.5 11.7h5M32.5 19.4h5" stroke="#1f2328" strokeWidth="1.2" />
    <rect x="8.5" y="30.6" width="4" height="3" rx=".4" fill="#c3c8ce" />
    <rect x="14.5" y="30.6" width="4" height="3" rx=".4" fill="#c3c8ce" />
    <circle cx="7.6" cy="20.6" r="1.7" fill="#c51a4a" />
    <path d="M6.4 18.6c.6-.9 1.6-.9 2.4 0" stroke="#4fa64a" strokeWidth=".9" strokeLinecap="round" fill="none" />
    {mood !== "neutral" && <circle cx="21" cy="27.2" r="2.2" fill={LED[mood]} fillOpacity=".3" />}
    <circle cx="21" cy="27.2" r="1.2" fill={LED[mood]} />
  </svg>;
}

/** Face by level: determined brows and an open mouth for bahaya, a startled "o" for waspada, a smile for aman. */
function Face({ mood, mouth = true }: { mood: Mood; mouth?: boolean }) {
  return <>
    <circle cx="16" cy="25" r="1.9" fill={INK} /><circle cx="16.6" cy="24.3" r=".6" fill="#fff" />
    <circle cx="24" cy="25" r="1.9" fill={INK} /><circle cx="24.6" cy="24.3" r=".6" fill="#fff" />
    {mood === "rose" && <path d="M13.6 21.2l3.4 1.3M26.4 21.2 23 22.5" stroke={BROW} strokeWidth="1.3" strokeLinecap="round" />}
    {mood === "yellow" && <path d="M14.2 21.6h3.2M22.6 21.6h3.2" stroke={BROW} strokeWidth="1.2" strokeLinecap="round" />}
    {mouth && (mood === "rose" ? <path d="M18 30.8c.6-2.4 3.4-2.4 4 0z" fill={MOUTH} />
      : mood === "yellow" ? <ellipse cx="20" cy="29.8" rx="1.1" ry="1.3" fill={MOUTH} />
      : mood === "lime" ? <path d="M17.9 29.2q2.1 1.9 4.2 0" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
      : <path d="M18.4 29.8h3.2" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />)}
  </>;
}

const SWEAT = <path d="M33.5 17.5c1.3 1.8 1.9 2.9 1.9 3.7a1.9 1.9 0 0 1-3.8 0c0-.8.6-1.9 1.9-3.7z" fill="#7cc7f2" />;

/** What Kodama wears or holds for each hazard. `back` sits behind the head, `front` over it. */
const PROPS: Record<Exclude<AlertKind, "device">, { back?: ReactNode; front?: ReactNode; sprout?: [string, string]; cheeks?: string; mouth?: boolean }> = {
  // Fever: thermometer in the mouth, flushed cheeks, a bead of sweat.
  heat: { cheeks: "#f28b7a", mouth: false, front: <>
    <path d="M19 29.6 31 35" stroke="#94a3b8" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M19 29.6 31 35" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M23 31.4 31 35" stroke="#ef4444" strokeWidth="1" strokeLinecap="round" />
    <circle cx="31.6" cy="35.3" r="2" fill="#ef4444" />
    {SWEAT}
  </> },
  fire: { front: <>
    <path d="M33 39c-3.4 0-5.4-2.3-5.4-5 0-2.5 1.7-4 2.6-6.2.9 1.4 1.6 2 2.3 2.2-.1-1.8.6-3.7 2-5 .2 2.7 3.9 4.4 3.9 8.6 0 3.2-2.2 5.4-5.4 5.4z" fill="#f97316" />
    <path d="M33 39c-1.6 0-2.7-1.1-2.7-2.6 0-1.6 1.4-2.4 2.2-3.9.4 1.2 3.2 2 3.2 3.9 0 1.5-1.1 2.6-2.7 2.6z" fill="#fde047" />
    {SWEAT}
  </> },
  // Dry spell: the sprout itself has wilted brown.
  fireRisk: { sprout: ["#b07a3a", "#d4a25a"], front: <path d="M31 6.5c1.5.6 2.2 1.8 2 3.2-1.4-.1-2.4-1-2.6-2.4z" fill="#d4a25a" /> },
  weather: { front: <>
    <path d="M27 10.5h8.5a3.2 3.2 0 0 0 .3-6.4 4.6 4.6 0 0 0-8.8-.8A3.6 3.6 0 0 0 27 10.5z" fill="#94a3b8" />
    <path d="M29 12.5l-.8 2.2M32.5 12.5l-.8 2.2M36 12.5l-.8 2.2" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />
  </> },
  quake: { front: <path d="M2.5 19.5l1.8 2.5-1.8 2.5 1.8 2.5M37.5 19.5l-1.8 2.5 1.8 2.5-1.8 2.5" fill="none" stroke="#a16207" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /> },
  // The orange alarm strokes from the mascot art.
  disaster: { front: <path d="M3.5 9.5l2.6 3.6M1.5 16l3.8 1M36.5 9.5l-2.6 3.6M38.5 16l-3.8 1" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" /> },
  region: { front: <>
    <path d="M33 39.5s-4.6-4.7-4.6-8a4.6 4.6 0 0 1 9.2 0c0 3.3-4.6 8-4.6 8z" fill="#ef4444" />
    <circle cx="33" cy="31.4" r="1.7" fill="#fff" />
  </> },
  source: { front: <>
    <ellipse cx="33" cy="30" rx="4.5" ry="1.8" fill="#cbd5e1" />
    <path d="M28.5 30v7c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-7" fill="#94a3b8" />
    <path d="M28.5 33.5c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8" fill="none" stroke="#cbd5e1" strokeWidth=".8" />
    <ellipse cx="33" cy="30" rx="4.5" ry="1.8" fill="none" stroke="#64748b" strokeWidth=".5" />
  </> },
};

/** Kodama, the sprout-topped ranger from the alerts card background, dressed for the hazard; its face carries the level. */
function Kodama({ kind, mood }: { kind: Exclude<AlertKind, "device">; mood: Mood }) {
  const p = PROPS[kind];
  const [leafA, leafB] = p.sprout ?? ["#6aae22", "#9ccc3c"];
  return <svg viewBox="0 0 40 40" className="size-9 overflow-visible">
    {p.back}
    <path d="M20 9V4" stroke={p.sprout ? "#8a5a2b" : "#4f8a1f"} strokeWidth="1.6" strokeLinecap="round" />
    {p.sprout
      ? <><path d="M20 5.5C16 6.6 13.4 9 13.2 11.8 16.8 11 19.4 8.6 20 5.5Z" fill={leafA} /><path d="M20 4.8C23.6 5.6 26 8 26.6 10.6 23.4 10.2 20.8 8 20 4.8Z" fill={leafB} /></>
      : <><path d="M20 5.5C15.5 5.8 12.6 3.4 12.2.6 16.2.4 19.2 2.4 20 5.5Z" fill={leafA} /><path d="M20 4.8C23.8 5 26.6 3.2 27.8 1 24 .6 21 2 20 4.8Z" fill={leafB} /></>}
    <circle cx="9.5" cy="14" r="5" fill={HOOD} /><circle cx="9.5" cy="14" r="2.6" fill={EAR} />
    <circle cx="30.5" cy="14" r="5" fill={HOOD} /><circle cx="30.5" cy="14" r="2.6" fill={EAR} />
    <circle cx="20" cy="24" r="14" fill={HOOD} />
    <ellipse cx="20" cy="26" rx="10.5" ry="9" fill={FACE} />
    <ellipse cx="13.2" cy="28.6" rx="1.7" ry="1.1" fill={p.cheeks ?? BLUSH} /><ellipse cx="26.8" cy="28.6" rx="1.7" ry="1.1" fill={p.cheeks ?? BLUSH} />
    <Face mood={mood} mouth={p.mouth} />
    {p.front}
  </svg>;
}

export function AlertArt({ kind, mood }: { kind: AlertKind; mood: Mood }) {
  return kind === "device" ? <RaspberryPi mood={mood} /> : <Kodama kind={kind} mood={mood} />;
}
