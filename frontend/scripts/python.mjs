import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const envLocal = {};
if (existsSync("../.env.local")) {
  for (const line of readFileSync("../.env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      envLocal[key] = val;
    }
  }
}

if (process.platform === "win32") {
  const needsDb = process.argv.some(arg => /uvicorn|pytest|seed/i.test(arg));
  if (needsDb) {
    const initScript = resolve("../scripts/init-local.ps1");
    if (existsSync(initScript)) {
      const dbCheck = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", initScript], {
        stdio: "inherit",
      });
      if (dbCheck.error) {
        console.warn("Peringatan: Gagal menjalankan scripts/init-local.ps1:", dbCheck.error);
      }
    }
  }
}

const candidate = process.platform === "win32" ? "../.venv/Scripts/python.exe" : "../.venv/bin/python";
const python = process.env.PYTHON || (existsSync(candidate) ? resolve(candidate) : "python");
const result = spawnSync(python, process.argv.slice(2), {
  stdio: "inherit",
  env: { ...envLocal, ...process.env, PYTHONPATH: resolve("../backend") },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
