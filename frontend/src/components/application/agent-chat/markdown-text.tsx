import { isValidElement, type ReactNode } from "react";
import { motion } from "motion/react";

// The same block entrance as the starter's AgentMessage lines, so both chats stream alike.
const BLOCK_HIDDEN = { opacity: 0, filter: "blur(5px)", y: 4 };
const BLOCK_SHOWN = { opacity: 1, filter: "blur(0px)", y: 0 };
const BLOCK_TRANSITION = { duration: 0.42, ease: [0.22, 0.61, 0.36, 1] } as const;

// Limit: covers the Markdown subset Gemini answers use (paragraphs, headings, lists, bold,
// italic, inline code); tables/links stay plain text. Swap in a parser if answers need more.
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).filter(Boolean).map((part, index) => {
    const id = `${key}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={id} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={id} className="rounded bg-background-secondary-default px-1 text-body-compact">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={id}>{part.slice(1, -1)}</em>;
    return part;
  });
}

/**
 * Renders model output as React elements (never as HTML), so text cannot inject markup.
 * With `animate`, each block softens in once as it first appears and then only grows.
 */
export function MarkdownText({ text, animate = false }: { text: string; animate?: boolean }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={`p${blocks.length}`}>{inline(paragraph.join(" "), `p${blocks.length}`)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const key = `l${blocks.length}`;
    const items = list.items.map((item, index) => <li key={index}>{inline(item, `${key}-${index}`)}</li>);
    blocks.push(list.ordered ? <ol key={key} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={key} className="list-disc space-y-1 pl-5">{items}</ul>);
    list = null;
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (!line) { flushParagraph(); flushList(); continue; }
    if (heading) { flushParagraph(); flushList(); blocks.push(<h4 key={`h${blocks.length}`} className="text-heading-sm text-text-primary">{inline(heading[1], `h${blocks.length}`)}</h4>); continue; }
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  return <div className="flex flex-col gap-2 text-body-regular text-text-primary">
    {/* Always wrapped, so a reply that stops streaming keeps its elements instead of remounting. */}
    {blocks.map(block => isValidElement(block) && <motion.div key={block.key} initial={animate ? BLOCK_HIDDEN : false} animate={BLOCK_SHOWN} transition={BLOCK_TRANSITION}>{block}</motion.div>)}
  </div>;
}
