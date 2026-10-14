import { useEffect, useState } from "react";
import type { ComposerMention } from "@/components/application/agent-chat/agent-composer";
import { apiList } from "@/lib/api/client";
import { useSession } from "@/hooks/use-session";

/** "Sensor Balikpapan 01" as a mention token: "Sensor_Balikpapan_01", letters and digits only.
 *  The agent maps it back to the exact name by those words. */
const token = (name: string) => name.replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/ /g, "_");

// What Kodama can answer about, in the agent's own topic words (backend agent/catalog.py TOPICS):
// "@udara di Riau" reaches the agent as "udara di Riau".
const TOPICS: ComposerMention[] = [
  ["udara", "Kualitas udara: PM2.5, PM10, NO₂, SO₂, O₃, CO"],
  ["cuaca", "Suhu, indeks panas, UV, hujan, angin"],
  ["kebakaran", "Rawan kebakaran dan titik panas satelit"],
  ["gempa", "Kerawanan gempa dan gempa tercatat"],
  ["air", "Air bersih, banjir, debit sungai"],
  ["laut", "Gelombang dan suhu permukaan laut"],
  ["energi", "Pembangkit, potensi surya, SPKLU"],
  ["penduduk", "Kepadatan, fasilitas, jalan, transportasi"],
  ["peringatan", "Peringatan cuaca BMKG, gempa, wilayah yang perlu perhatian"],
].map(([word, hint]) => ({ token: word, label: word, group: "Topik", hint }));

// Sources change only on deploy: one request per page load, shared by every composer.
// One mention per publisher, in at most two words (@BMKG, @NASA_FIRMS); feeds that share them merge.
let sources: Promise<ComposerMention[]> | undefined;
const loadSources = () => sources ??= apiList("/sources", "SourceInfo")
  .then(items => {
    const byToken = new Map<string, ComposerMention>();
    for (const item of items.filter(item => item.last_ok_at)) {
      const short = token(item.publisher).split("_").slice(0, 2).join("_");
      const seen = byToken.get(short);
      byToken.set(short, { token: short, label: item.publisher, group: "Sumber Data",
        hint: seen ? `${seen.hint}, ${item.title}` : item.title });
    }
    return [...byToken.values()];
  })
  .catch(() => { sources = undefined; return []; });

/** What "@" in Kodama's input offers: topics first, the account's own IoT & BYOD devices, then the running data sources. */
export function useMentions() {
  const { me } = useSession();
  // tagged with the account they belong to, so another login never sees the last one's devices
  const [devices, setDevices] = useState<{ userId: number; items: ComposerMention[] }>();
  const [active, setActive] = useState<ComposerMention[]>([]);
  useEffect(() => {
    let live = true;
    void loadSources().then(value => { if (live) setActive(value); });
    return () => { live = false; };
  }, []);
  const userId = me?.user.id;
  useEffect(() => {
    // guests have no devices, and a private request without a session would only end in a 401
    if (userId === undefined) return;
    const controller = new AbortController();
    apiList("/me/devices", "DeviceOut", { signal: controller.signal })
      .then(items => setDevices({ userId, items: items.map(device => ({
        token: token(device.name), label: device.name, group: "Perangkat IoT & BYOD",
        hint: device.region_name ?? undefined })) }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [userId]);
  return [...TOPICS, ...(devices && devices.userId === userId ? devices.items : []), ...active];
}
