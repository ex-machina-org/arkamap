import type { CSSProperties } from "react";
import type { UIMessage } from "ai";
import { motion } from "motion/react";
import { RiCheckLine, RiLoader4Line } from "@remixicon/react";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { jevReply } from "./jev-transport";

const STEP_ENTER = { type: "spring", duration: 0.3, bounce: 0 } as const;
// The same shimmer as the status label (and its reduced-motion fallback), tinted with the brand color.
const BRAND_SHIMMER = { "--bui-agent-thinking-tone": "var(--color-accent-600)" } as CSSProperties;

/**
 * The live state before Kodama's first word: a shimmering status with a timer,
 * and a trail of the tools Jev has called, in the brand color. The newest step spins and shimmers;
 * earlier ones are checked off. Once the answer starts, the reply's
 * "Berpikir selama N detik" row keeps the same trail collapsed.
 */
export function JevThinking({ messages }: { messages: UIMessage[] }) {
  const last = messages.at(-1);
  const steps = (last?.role === "assistant" ? jevReply(last)?.steps : undefined) ?? [];
  return <div className="flex flex-col gap-2.5 px-1">
    <AgentThinking variant="wave" tone="accent" label="Kodama sedang berpikir" />
    {steps.length > 0 && <ol aria-label="Langkah Kodama" className="ml-[7px] flex flex-col gap-2 border-l border-separator-border pl-4">
      {steps.map((step, index) => {
        const label = step.replace(/\.\.\.$/, "");
        const active = index === steps.length - 1;
        return <motion.li key={step} initial={{ opacity: 0, y: 4, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={STEP_ENTER}
          className="flex items-center gap-2 text-body-compact">
          {active
            ? <RiLoader4Line className="size-3.5 shrink-0 animate-spin text-accent-600 motion-reduce:animate-none" aria-hidden />
            : <RiCheckLine className="size-3.5 shrink-0 text-accent-600 dark:text-accent-400" aria-hidden />}
          {active ? <span className="bui-agent-thinking-label" style={BRAND_SHIMMER}>{label}</span> : <span className="text-text-tertiary">{label}</span>}
        </motion.li>;
      })}
    </ol>}
  </div>;
}
