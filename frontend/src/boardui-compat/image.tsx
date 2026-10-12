import type { ImgHTMLAttributes } from "react";

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

/** Vite equivalent for the small subset of next/image used by BoardUI. */
export default function Image({ fill, priority, unoptimized: _unoptimized, style, ...props }: ImageProps) {
  void _unoptimized;
  return (
    <img
      {...props}
      loading={priority ? "eager" : props.loading ?? "lazy"}
      fetchPriority={priority ? "high" : props.fetchPriority}
      style={fill ? { ...style, position: "absolute", inset: 0, width: "100%", height: "100%" } : style}
    />
  );
}
