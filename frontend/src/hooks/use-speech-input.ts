import { useEffect, useRef, useState } from "react";

// The Web Speech API is not in TypeScript's DOM lib, so only what is used here is typed.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser.",
  "service-not-allowed": "Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser.",
  "audio-capture": "Mikrofon tidak ditemukan.",
  network: "Pengenalan suara butuh koneksi internet.",
};

/**
 * Dictation into a text field. Speech is appended to what was already typed,
 * and interim words show while speaking so the field never looks idle.
 * `supported` is false in browsers without the Web Speech API (e.g. Firefox).
 */
export function useSpeechInput({ lang = "id-ID", onText }: { lang?: string; onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();
  const recognition = useRef<Recognition | null>(null);
  const supported = recognitionConstructor() !== undefined;

  useEffect(() => () => recognition.current?.abort(), []);

  function start(current: string) {
    const Constructor = recognitionConstructor();
    if (!Constructor || recognition.current) return;
    const base = current.trim() ? `${current.trimEnd()} ` : "";
    const session = new Constructor();
    session.lang = lang;
    session.interimResults = true;
    session.continuous = false;
    session.onresult = event => {
      const spoken = Array.from(event.results, result => result[0].transcript).join("");
      onText(base + spoken.trimStart());
    };
    session.onerror = event => {
      // "no-speech" and "aborted" are ordinary endings, not faults to report.
      if (event.error !== "no-speech" && event.error !== "aborted") setError(ERRORS[event.error] ?? "Pengenalan suara gagal.");
    };
    session.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = session;
    setError(undefined);
    setListening(true);
    session.start();
  }

  function stop() {
    recognition.current?.stop();
  }

  return { supported, listening, error, start, stop };
}
