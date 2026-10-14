"use client";

import {
  RiArrowUpLine,
  RiAttachment2,
  RiInfinityLine,
  RiMicFill,
  RiMicLine,
  RiSparklingLine,
  RiStopFill,
} from "@remixicon/react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { VoiceBeam, useMicrophone } from "voice-glow";

import { ComposerLoader } from "@/components/application/composer-loader/composer-loader";
import { useThemeMode } from "@/components/application/theme/theme-toggle";
import { MENU_ITEM, MENU_ITEM_ACTIVE, MENU_ITEM_INTERACTIVE, MENU_POPOVER_SURFACE } from "@/components/base/dropdown/menu-styles";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { cx } from "@/utils/cx";

/**
 * The free composer: a 52px pill with a text field and circular controls,
 * plus the thin status row beneath it.
 *
 * It matches the proportions of the Pro composer on purpose, so a starter
 * looks like it belongs to the same product — the fixed-height pill, 8px
 * padding with 36px circles sitting flush inside it, and the 10px gap rhythm
 * across the row. What it deliberately does NOT carry is the paid work in
 * `composer`: the liquid-glass surfaces behind the controls, the model and
 * effort menus, the attachment plugin panel, and the voice equalizer. Those
 * are the reason someone buys that component, so this one leaves the slots
 * present but plain.
 *
 * The status row shows what is actually true of the running app — which
 * provider answered, which model, how many messages are in the thread —
 * rather than decorative chrome, so it stays honest in a deployed starter.
 */

/** Something "@" in the field can name; `token` is what lands in the text ("@Sensor_Balikpapan_01"). */
export interface ComposerMention {
  token: string;
  label: string;
  /** Heading the item is listed under, e.g. "Sumber Data". */
  group: string;
  hint?: string;
}

/** Mentions that contain the query, groups kept in their order; within a group the tokens that start with it come first. */
function rank(mentions: ComposerMention[], query: string) {
  const q = query.replace(/_/g, " ");
  const groups = [...new Set(mentions.map(item => item.group))];
  const score = (item: ComposerMention) => groups.indexOf(item.group) * 2 + (item.token.toLowerCase().replace(/_/g, " ").startsWith(q) ? 0 : 1);
  return mentions
    .filter(item => `${item.token} ${item.label}`.toLowerCase().replace(/_/g, " ").includes(q))
    .sort((a, b) => score(a) - score(b));
}

/** The "@query" the caret sits right after, if any: at the start or after a space. */
function mentionAt(text: string, caret: number) {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length - 1, query: match[1].toLowerCase() } : null;
}

/** One model named in the status row, with its own mark; `title` says what it does. */
export interface ComposerProvider {
  name: string;
  icon: typeof RiInfinityLine;
  title?: string;
}

export interface AgentComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  /** Model id reported by the runtime, e.g. "openai/gpt-5-nano". */
  model?: string | null;
  provider?: string | null;
  /** Several models instead of one `provider`, each with its own mark; names hide on phones, marks stay. */
  providers?: ComposerProvider[];
  messageCount: number;
  placeholder?: string;
  /** The attachment button. Off when the backend cannot take files. */
  showAttachment?: boolean;
  /** Dictation into the field, in this BCP 47 language (e.g. "id-ID"). Hidden where the browser has no speech recognition. */
  voiceLanguage?: string;
  /** The provider and message-count row under the pill; compact hosts drop it. */
  showStatus?: boolean;
  /** Mark shown at the pill's start in place of the attachment button, e.g. the assistant's avatar. */
  leading?: ReactNode;
  autoFocus?: boolean;
  className?: string;
  /** Typing "@" lists these to insert into the question. */
  mentions?: ComposerMention[];
}

export function AgentComposer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  busy,
  model,
  provider,
  providers,
  messageCount,
  placeholder = "Ask me anything",
  showAttachment = true,
  voiceLanguage,
  showStatus = true,
  leading,
  autoFocus,
  className,
  mentions = [],
}: AgentComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  // Escape hides the list until the "@" it was opened for is gone
  const [dismissedAt, setDismissedAt] = useState<number>();
  const mention = mentions.length ? mentionAt(value, caret) : null;
  const matches = mention && mention.start !== dismissedAt ? rank(mentions, mention.query) : [];
  const open = matches.length > 0;
  const current = Math.min(highlight, matches.length - 1);
  // arrow keys move through a list taller than its box: keep the highlighted one in sight
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [open, current, listId]);

  const pick = (item: ComposerMention) => {
    if (!mention) return;
    const before = `${value.slice(0, mention.start)}@${item.token} `;
    onValueChange(before + value.slice(caret).replace(/^\S*\s?/, ""));
    setCaret(before.length);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(before.length, before.length);
    });
  };
  const speech = useSpeechInput({ lang: voiceLanguage, onText: onValueChange });
  const showVoice = voiceLanguage !== undefined && speech.supported;
  // Speech recognition exposes no audio, so the glow listens on its own
  // microphone stream. It only decorates: if it is denied, dictation still works.
  const mic = useMicrophone();
  const theme = useThemeMode();

  // Recognition ends on its own after a pause; release the glow's microphone
  // with it, including a stream that resolved after recognition already ended.
  const { state: micState, stop: stopMic } = mic;
  useEffect(() => {
    if (!speech.listening && micState === "live") stopMic();
  }, [speech.listening, micState, stopMic]);

  // What was typed before dictation stays still; only the spoken words animate in.
  const [typedBeforeVoice, setTypedBeforeVoice] = useState("");

  const toggleVoice = () => {
    if (speech.listening) return speech.stop();
    setTypedBeforeVoice(value);
    speech.start(value);
    if (mic.supported) void mic.start();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    speech.stop();
    onSubmit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setHighlight((current + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
      return;
    }
    if (open && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      pick(matches[current]);
      return;
    }
    if (open && event.key === "Escape") {
      event.preventDefault();
      setDismissedAt(mention?.start);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={cx("relative flex w-full flex-col gap-2.5", className)}>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sebut perangkat atau sumber data"
          // above the pill, over the transcript; mousedown keeps focus (and the caret) in the field
          onMouseDown={event => event.preventDefault()}
          className={cx(MENU_POPOVER_SURFACE, "absolute bottom-full left-0 z-30 mb-2 flex max-h-72 w-full max-w-sm flex-col gap-1")}
        >
          {matches.map((item, index) => (
            <li key={`${item.group}:${item.token}`} role="presentation" className="contents">
              {(index === 0 || matches[index - 1].group !== item.group) && (
                <span role="presentation" className="px-2 pt-1 text-caption-1-medium text-text-tertiary">{item.group}</span>
              )}
              <span
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === current}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(item)}
                className={cx(MENU_ITEM, MENU_ITEM_INTERACTIVE, index === current && MENU_ITEM_ACTIVE, "flex-col items-start gap-0")}
              >
                <span className="w-full truncate text-body-2-medium">@{item.token}</span>
                {item.hint && <span className="w-full truncate text-caption-1-regular text-text-tertiary">{item.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* 26px is half the 52px pill; the wrapper's own radius is not the pill's. */}
      <VoiceBeam stream={mic.stream} active={speech.listening} theme={theme} borderRadius={26}>
      {/* radius omitted: ComposerLoader defaults to a full pill, matching the form. */}
      <ComposerLoader active={busy}>
        {/* The pill sits one step lighter than the chat surface behind it in
            both themes (white on neutral-100 in light, neutral-800 on
            neutral-900 in dark), so a single token works without a dark
            override. Its controls then step back down to secondary. */}
        <form
          onSubmit={submit}
          className={cx(
            "flex h-[52px] w-full items-center gap-2.5 rounded-full p-2",
            // ComposerLoader paints its own pill surface and runs the light
            // behind its children, so an opaque form would cover the light
            // entirely. While busy the form steps aside and lets it show.
            busy ? "bg-transparent" : "bg-background-primary-default shadow-xs",
          )}
        >
          {/* Attachment slot. Plain on purpose — the plugin panel behind this
              button in the Pro composer is part of what that component sells. */}
          {/* Shares the Pro composer's add-button tokens so the two read as the
              same control. They resolve one step lighter than the pill in dark
              and one step darker in light, which is why a single pair works for
              both themes without a dark: override. */}
          {showAttachment && (
            <button
              type="button"
              aria-label="Add attachment"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ai-chat-composer-add-background text-foreground-icon-primary transition-colors duration-150 ease hover:bg-ai-chat-composer-add-hover-background"
            >
              <RiAttachment2 className="size-5" aria-hidden />
            </button>
          )}

          {leading && <span className="flex size-9 shrink-0 items-center justify-center">{leading}</span>}

          <label className="sr-only" htmlFor="agent-composer-input">
            Message
          </label>
          {/* Without the 36px attachment circle the text would sit 8px from the pill's curve. */}
          <div className={cx("relative h-5 min-w-0 flex-1", !showAttachment && !leading && "pl-3")}>
          <input
            id="agent-composer-input"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => {
              const text = event.target.value, at = event.target.selectionStart ?? text.length;
              onValueChange(text);
              setCaret(at);
              setHighlight(0);
              // a dismissed list stays shut only for its own "@": gone, or a fresh one typed, opens again
              const next = mentionAt(text, at);
              if (!next || next.query === "") setDismissedAt(undefined);
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            role={mentions.length ? "combobox" : undefined}
            aria-expanded={mentions.length ? open : undefined}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open ? `${listId}-${current}` : undefined}
            aria-autocomplete={mentions.length ? "list" : undefined}
            placeholder={speech.listening ? "Mendengarkan..." : placeholder}
            autoComplete="off"
            autoFocus={autoFocus}
            className={cx(
              "size-full bg-transparent text-body-regular caret-text-primary outline-none placeholder:text-text-tertiary",
              // While dictating, the input keeps the value but the overlay draws it.
              speech.listening ? "text-transparent" : "text-text-primary",
            )}
          />
          {speech.listening && (
            <SpokenText typed={typedBeforeVoice} value={value} className={cx(!showAttachment && !leading && "left-3")} />
          )}
          </div>

          {model ? (
            <span
              // Static where the Pro composer puts its model picker: the model
              // is set by an env var, so there is nothing to switch at runtime.
              className="flex h-8 shrink-0 items-center gap-1 rounded-xl py-1.5 pr-2 pl-2 text-body-2-medium text-text-secondary"
              title={`Answering with ${model}`}
            >
              <RiSparklingLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span className="hidden max-w-[13ch] truncate sm:inline">{shortModel(model)}</span>
            </span>
          ) : null}

          <div className="flex shrink-0 items-center gap-2 pl-1.5">
            {showVoice && !busy && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-label={speech.listening ? "Berhenti mendengarkan" : "Input suara"}
                aria-pressed={speech.listening}
                title={speech.error ?? (speech.listening ? "Berhenti mendengarkan" : "Input suara")}
                className={cx(
                  "flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors",
                  speech.listening
                    ? "animate-pulse bg-accent-500/15 text-accent-600 dark:text-accent-300"
                    : "text-foreground-icon-secondary hover:bg-background-secondary-hover hover:text-foreground-icon-primary",
                )}
              >
                {speech.listening ? <RiMicFill className="size-5" aria-hidden /> : <RiMicLine className="size-5" aria-hidden />}
              </button>
            )}
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-background-secondary-default text-foreground-icon-secondary transition-colors hover:bg-background-secondary-hover"
              >
                <RiStopFill className="size-5" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Send message"
                disabled={value.trim().length === 0}
                className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-button-primary text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RiArrowUpLine className="size-5" aria-hidden />
              </button>
            )}
          </div>
        </form>
      </ComposerLoader>
      </VoiceBeam>

      {showStatus && <div className="flex h-6.5 w-full items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {providers?.length ? (
            <span className="flex min-w-0 items-center gap-2.5" aria-label={`Dijawab oleh ${providers.map(item => item.name).join(", ")}`}
              title="Angka dan data selalu dari basis data Arkamap, bukan dari model">
              {providers.map(item => <StatusItem key={item.name} icon={item.icon} label={item.name} title={item.title} compact />)}
            </span>
          ) : <StatusItem icon={RiInfinityLine} label={provider ?? "Not configured"} />}
          {speech.error && (
            <span role="alert" className="text-caption-1-regular text-text-error-primary">
              {speech.error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusItem
            icon={RiSparklingLine}
            label={messageCount === 0 ? "New chat" : `${messageCount} messages`}
          />
        </div>
      </div>}
      {!showStatus && speech.error && (
        <span role="alert" className="px-3 text-caption-1-regular text-text-error-primary">{speech.error}</span>
      )}
    </div>
  );
}

/**
 * The field's text while dictating, drawn word by word so each spoken word
 * rises in. Keys include the word, so a word the recognizer revises animates
 * again. Pinned to the end, like the input, so the newest words stay visible.
 */
function SpokenText({ typed, value, className }: { typed: string; value: string; className?: string }) {
  const prefix = value.startsWith(typed) ? typed : "";
  const words = value.slice(prefix.length).split(/(\s+)/).filter(Boolean);
  return (
    <div aria-hidden className={cx("pointer-events-none absolute inset-y-0 right-0 left-0 flex justify-end overflow-hidden", className)}>
      <span className="min-w-full shrink-0 text-body-regular whitespace-pre text-text-primary">
        {prefix}
        {words.map((word, index) =>
          /^\s+$/.test(word) ? word : (
            <span key={`${index}:${word}`} className="voice-word-in inline-block">{word}</span>
          ),
        )}
      </span>
    </div>
  );
}

function StatusItem({
  icon: Icon,
  label,
  title,
  compact = false,
}: {
  icon: typeof RiInfinityLine;
  label: string;
  title?: string;
  /** The name hides below sm, leaving the mark (and the title on hover). */
  compact?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1" title={title}>
      <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <span className={cx("truncate whitespace-nowrap text-body-2-medium text-text-secondary", compact && "hidden sm:inline")}>{label}</span>
    </span>
  );
}

/** "openai/gpt-5-nano" reads better in a 13ch slot as "gpt-5-nano". */
function shortModel(model: string) {
  const slash = model.lastIndexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}
