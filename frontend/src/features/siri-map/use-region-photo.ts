import { useEffect, useState } from "react";

export interface RegionPhoto {
  src: string;
  /** The Wikipedia article the photo comes from, linked as its credit (CC BY-SA). */
  pageUrl: string;
}

type Summary = {
  type?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

// Wikimedia serves thumbnails only at standard widths; 500px stays sharp in the ~360px card.
const THUMB_WIDTH = 500;
// One lookup per region per page load, shared by every card that shows it.
const cache = new Map<string, Promise<RegionPhoto | null>>();

/**
 * The article title for a region as Arkamap names it. Provinces and cities
 * already match ("Kalimantan Timur", "Kota Balikpapan"); regencies are stored
 * bare ("Kutai Kartanegara") and live under "Kabupaten …" on Wikipedia.
 */
function articleTitle(name: string, level: "provinsi" | "kabkota") {
  if (level === "provinsi" || /^(Kota|Kabupaten)\s/.test(name)) return name;
  return `Kabupaten ${name.replace(/^Kab\.\s*/, "")}`;
}

async function lookup(title: string): Promise<RegionPhoto | null> {
  const response = await fetch(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!response.ok) return null;
  const summary = (await response.json()) as Summary;
  const source = summary.thumbnail?.source;
  // Disambiguation pages carry no region photo, and an SVG lead image is a map
  // or coat of arms rather than a picture of the place.
  if (summary.type !== "standard" || !source || /\.svg/i.test(source)) return null;
  return {
    src: source.replace(/\/\d+px-/, `/${THUMB_WIDTH}px-`),
    pageUrl: summary.content_urls?.desktop?.page ?? `https://id.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

/** A representative photo of a province or regency from Indonesian Wikipedia; null when there is none. */
export function useRegionPhoto(name: string, level: "provinsi" | "kabkota") {
  const title = articleTitle(name, level);
  const [state, setState] = useState<{ title: string; photo: RegionPhoto | null } | null>(null);

  useEffect(() => {
    let current = true;
    let request = cache.get(title);
    if (!request) {
      // A network failure is not cached, so reopening the card tries again.
      request = lookup(title).catch(() => { cache.delete(title); return null; });
      cache.set(title, request);
    }
    void request.then((photo) => { if (current) setState({ title, photo }); });
    return () => { current = false; };
  }, [title]);

  const resolved = state?.title === title;
  return { photo: resolved ? state.photo : null, loading: !resolved };
}
