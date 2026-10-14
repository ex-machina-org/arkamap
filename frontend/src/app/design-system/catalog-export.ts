import type { DocEntry } from "./registry";

const sources = import.meta.glob<string>(["/src/components/**/*.{tsx,ts}", "/src/styles/*.css", "/src/index.css", "/src/app/design-system/examples/*.tsx"], {
  query: "?raw",
  import: "default",
});

export async function catalogMarkdown(entry: DocEntry): Promise<string> {
  const paths = [...(entry.source ?? "").split(/\s*\u00b7\s*/).filter(path => path.startsWith("src/")), ...(entry.example ? [entry.example] : [])];
  const lines = [
    `# ${entry.title}`, "", entry.description, "",
    `Preview: /design-system/${entry.slug}`, "",
    "Read AGENTS.md, docs/frontend/COMPONENTS.md, and docs/frontend/DESIGN-SYSTEM.md before implementation.",
    "Use existing APIs and semantic tokens. BoardUI app-shell tokens own dark surfaces.",
    "Arkamap catalog examples are fixtures; source presence does not imply a verified live backend or model endpoint.", "",
    "## Authoritative implementation", "",
  ];
  if (!paths.length) lines.push(`Reference: ${entry.source ?? "docs/frontend/README.md"}`, "");
  for (const path of paths) {
    lines.push(`### ${path}`, "");
    const loader = sources[`/${path}`];
    if (!loader) throw new Error(`Catalog source unavailable: ${path}`);
    const source = await loader();
    if (source.length > 40000) {
      lines.push("Source exceeds the export size limit. Read this file locally for its API and dependencies.", "");
    } else {
      const fence = "`".repeat(Math.max(3, ...[...source.matchAll(/`+/g)].map(match => match[0].length + 1)));
      lines.push(`${fence}${path.endsWith(".css") ? "css" : "tsx"}`, source.trim(), fence, "");
    }
  }
  lines.push("Inspect imported modules for transitive dependencies. This export is repository context, not a standalone application.");
  return lines.join("\n");
}

export async function catalogPrompt(entry: DocEntry): Promise<string> {
  return `Use the following JOINTS documentation as implementation context. Follow the repository contract and preserve existing working tree changes. Do not invent component props, variants, or integrations.\n\n${await catalogMarkdown(entry)}`;
}
