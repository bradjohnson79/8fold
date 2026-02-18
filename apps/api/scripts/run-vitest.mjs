import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseDotEnv(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;

    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function maybeLoadEnvLocal() {
  if (String(process.env.DATABASE_URL ?? "").trim()) return;

  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const txt = fs.readFileSync(envPath, "utf8");
  const kv = parseDotEnv(txt);
  for (const [k, v] of Object.entries(kv)) {
    if (!String(process.env[k] ?? "").trim()) process.env[k] = String(v ?? "");
  }
}

maybeLoadEnvLocal();

const args = process.argv.slice(2);
const res = spawnSync("vitest", ["run", ...args], { stdio: "inherit", env: process.env });
process.exit(res.status ?? 1);

