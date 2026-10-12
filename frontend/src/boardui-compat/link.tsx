import type { AnchorHTMLAttributes } from "react";

/** BoardUI's links work as ordinary links in JOINTS's Vite app. */
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} />;
}
