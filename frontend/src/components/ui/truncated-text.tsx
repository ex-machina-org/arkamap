import { useLayoutEffect, useRef, useState } from "react";

export function TruncatedText({ children, className = "" }: { children: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);
  return <span className={`inline-flex min-w-0 max-w-full items-center gap-2 text-sm text-text-primary ${className}`}>
    <span ref={ref} className={expanded ? "min-w-0 break-words" : "min-w-0 truncate"}>{children}</span>
    {(overflowing || expanded) && <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="shrink-0 rounded text-xs font-medium text-accent-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent-500">{expanded ? "Less" : "More"}</button>}
  </span>;
}
