import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/** Characters per second at the slowest, so a short burst still reads as typing. */
const MIN_RATE = 60;
/** How hard the reveal leans on the backlog: higher catches up sooner after a large chunk. */
const CATCH_UP = 4;

function commonPrefix(a: string, b: string) {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index++;
  return a.slice(0, index);
}

/**
 * Reveals streamed text at a steady, word-aligned pace instead of in the
 * uneven chunks a model sends. Only text that was streaming when the caller
 * mounted is animated; a restored reply shows in full at once. When the source
 * rewrites what it already sent, the reveal falls back to the shared prefix.
 */
export function useSmoothText(target: string, streaming: boolean) {
  const reduceMotion = useReducedMotion();
  const [animated] = useState(streaming);
  const [shown, setShown] = useState("");
  const shownRef = useRef("");

  useEffect(() => {
    if (!animated || reduceMotion) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const seconds = Math.min(64, now - last) / 1000;
      last = now;
      const base = target.startsWith(shownRef.current) ? shownRef.current : commonPrefix(shownRef.current, target);
      const backlog = target.length - base.length;
      if (backlog <= 0) {
        shownRef.current = base;
        setShown(base);
        return;
      }
      let end = Math.min(target.length, base.length + Math.max(1, Math.round(seconds * Math.max(MIN_RATE, backlog * CATCH_UP))));
      // Finish the word in progress, so markup like "**" is not left half drawn for a frame.
      const nextSpace = target.slice(end).search(/\s/);
      if (nextSpace > 0 && nextSpace < 16) end += nextSpace;
      shownRef.current = target.slice(0, end);
      setShown(shownRef.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, animated, reduceMotion]);

  const active = animated && !reduceMotion;
  return { text: active ? shown : target, animated: active, revealing: active && shown !== target };
}
