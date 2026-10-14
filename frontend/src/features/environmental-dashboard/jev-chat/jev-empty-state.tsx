import { motion } from "motion/react";
import { RiArrowRightLine } from "@remixicon/react";
import { greeting } from "../greeting";

/** Each starter maps to a tool Jev actually has (alerts, rank_regions, events, region_summary). */
const STARTERS = [
  { title: "Peringatan aktif", prompt: "Ringkas peringatan aktif hari ini" },
  { title: "Risiko kebakaran", prompt: "Wilayah mana yang paling berisiko kebakaran?" },
  { title: "Kejadian terbaru", prompt: "Kejadian apa saja yang tercatat minggu ini?" },
  { title: "Profil wilayah", prompt: "Ringkas kondisi lingkungan di Riau" },
];

const ITEM = {
  hidden: { opacity: 0, y: 6, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", duration: 0.45, bounce: 0 } },
} as const;

// Small uppercase labels need positive tracking; large display text reads better slightly tight.
const EYEBROW = "text-caption-1-medium uppercase tracking-[0.08em] text-text-tertiary";

/** Kodama's first screen: a left-aligned greeting and an index of ways to start. */
export function JevEmptyState({ name, onPick }: { name?: string; onPick: (text: string) => void }) {
  return <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
    className="flex w-full flex-col gap-10 text-left">
    <div className="flex flex-col gap-4">
      <motion.h2 variants={ITEM} className="text-display-4-medium leading-[1.1] tracking-[-0.02em] text-balance text-text-primary">
        {name ? `${greeting(name)}.` : "Halo."}
        <span className="block text-text-tertiary">Apa yang ingin kamu pantau hari ini?</span>
      </motion.h2>
      <motion.p variants={ITEM} className="max-w-[60ch] text-headline-regular leading-normal text-pretty text-text-secondary">
        Tanyakan kondisi wilayah, kejadian, atau peringatan. Kodama menyusun jawaban dari data Arkamap dan menunjukkan sumbernya.
      </motion.p>
    </div>

    <motion.section variants={ITEM} aria-labelledby="kodama-starters" className="flex flex-col gap-2">
      <h3 id="kodama-starters" className={EYEBROW}>Mulai dari</h3>
      <ul className="flex flex-col border-t border-separator-border">
        {STARTERS.map(({ title, prompt }) => <li key={title} className="border-b border-separator-border">
          <button type="button" onClick={() => onPick(prompt)}
            className="group -mx-2 grid w-[calc(100%+1rem)] cursor-pointer grid-cols-[1fr_auto] items-center gap-x-6 gap-y-0.5 rounded-lg px-2 py-3.5 text-left outline-none transition-colors duration-150 ease-out hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring sm:grid-cols-[11rem_1fr_auto]">
            <span className="text-body-medium text-text-primary">{title}</span>
            <span className="col-start-1 text-body-regular text-text-secondary sm:col-start-2 sm:row-start-1">{prompt}</span>
            <RiArrowRightLine className="col-start-2 row-span-2 row-start-1 size-4 text-foreground-icon-tertiary transition-[color,translate] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-foreground-icon-primary sm:col-start-3 sm:row-span-1" aria-hidden />
          </button>
        </li>)}
      </ul>
    </motion.section>

    <motion.p variants={ITEM} className="text-caption-1-regular text-text-tertiary">
      Dijawab dengan model Jev. Riwayat chat tersimpan di browser ini.
    </motion.p>
  </motion.div>;
}
