import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// Manifest targets are repository paths, so resolve everything from the repo root.
const repo = new URL("../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("docs/integration/source-manifest.json", repo), "utf8"));
const protectedPath = path => /^frontend\/(public\/|src\/assets\/|src\/styles\/|src\/components\/(base|foundations|ui)\/)/.test(path)
  || path.startsWith("frontend/src/app/design-system/") && path !== "frontend/src/app/design-system/catalog-export.ts"
  || ["frontend/src/index.css", "DESIGN.md", "frontend/components.json"].includes(path);
let checked = 0, accepted = 0;
for (const file of manifest["joints-prototype"].files.filter(file => protectedPath(file.target))) {
  const actual = createHash("sha256").update(readFileSync(new URL(file.target, repo))).digest("hex");
  // accepted_sha256 records a reviewed, intentional change; sha256 stays the original provenance.
  if (actual !== (file.accepted_sha256 ?? file.sha256)) throw new Error(`Protected frontend source changed: ${file.target}`);
  checked++;
  if (file.accepted_sha256) accepted++;
}
console.log(`${checked} protected design, token, base component and asset files match the frontend baseline byte-for-byte (${accepted} via a reviewed accepted change).`);
