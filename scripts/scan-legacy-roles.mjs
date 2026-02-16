/**
 * Legacy role drift guard (CI protection).
 * Scans repo for "USER", "CUSTOMER", "SUPER_ADMIN" outside allowlisted locations.
 * Exits 1 if any violation found.
 *
 * Usage: node scripts/scan-legacy-roles.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd());
const LEGACY = ["USER", "CUSTOMER", "SUPER_ADMIN"];

// Paths/patterns to skip (no scan)
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".data",
  ".cursor",
  "coverage",
]);
const SKIP_EXT = new Set([".sql", ".md", ".json", ".lock", ".map", ".min.js"]);
const SKIP_FILES = new Set([
  "scan-legacy-roles.mjs",
  "backfillUnifiedUsers.ts",
  "backfill-jobposter-role.ts",
  "backfill-role-taxonomy.ts",
  "db-authority-reconciliation.ts",
  "db-schema-diff.ts",
  "verify-financial-schema.ts",
]);

function* walk(dir, base = ROOT) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = relative(base, full);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full, base);
    } else if (e.isFile()) {
      const ext = (e.name.match(/\.[^.]+$/) ?? [""])[0];
      if (SKIP_EXT.has(ext)) continue;
      if (SKIP_FILES.has(e.name)) continue;
      yield full;
    }
  }
}

function checkFile(path) {
  const rel = relative(ROOT, path);
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  const violations = [];

  for (const legacy of LEGACY) {
    const re = new RegExp(
      `(?<![a-zA-Z0-9_])${legacy}(?![a-zA-Z0-9_])`,
      "g"
    );
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(re);
      if (m) {
        // Allow: USER-DEFINED (Postgres), comments documenting legacy, backfill/migration scripts
        if (line.includes("USER-DEFINED")) continue;
        if (/\/\/.*legacy|@deprecated|historical|backfill|e\.g\.|voterType/.test(line)) continue;
        violations.push({ file: rel, line: i + 1, legacy, snippet: line.trim().slice(0, 80) });
      }
    }
  }

  return violations;
}

function main() {
  const all = [];
  for (const f of walk(ROOT)) {
    if (!f.endsWith(".ts") && !f.endsWith(".tsx") && !f.endsWith(".js") && !f.endsWith(".jsx") && !f.endsWith(".mjs")) continue;
    const v = checkFile(f);
    all.push(...v);
  }

  if (all.length > 0) {
    console.error("[scan-legacy-roles] FAIL: legacy role references found\n");
    for (const v of all) {
      console.error(`  ${v.file}:${v.line}  "${v.legacy}"  ${v.snippet}`);
    }
    process.exit(1);
  }

  console.log("[scan-legacy-roles] ok");
}

main();
