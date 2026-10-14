import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import type { DocEntry } from "./registry";

export function CatalogExportActions({ entry }: { entry: DocEntry }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function copy(kind: "markdown" | "prompt") {
    setStatus("loading");
    try {
      const exporter = await import("./catalog-export");
      const value = await (kind === "prompt" ? exporter.catalogPrompt(entry) : exporter.catalogMarkdown(entry));
      await navigator.clipboard.writeText(value);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return <div className="mb-6 flex flex-wrap items-center gap-2">
    <Button variant="secondary" size="small" disabled={status === "loading"} onClick={() => void copy("markdown")}>Copy Markdown</Button>
    <Button variant="secondary" size="small" disabled={status === "loading"} onClick={() => void copy("prompt")}>Copy agent context</Button>
    <span role="status" className="text-caption-regular text-text-secondary">
      {status === "loading" ? "Preparing source…" : status === "success" ? "Copied." : status === "error" ? "Copy failed. Check clipboard permission and retry." : ""}
    </span>
  </div>;
}
