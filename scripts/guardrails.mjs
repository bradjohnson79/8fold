import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const WEB_ROOT = path.join(ROOT, "apps", "web");
const ALLOWED_DB_FILE = path.join(WEB_ROOT, "src", "server", "db", "drizzle.ts");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  "coverage",
  ".pnpm",
  ".vercel",
]);

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function rel(p) {
  return path.relative(ROOT, p);
}

function isCodeFile(p) {
  return CODE_EXTS.has(path.extname(p));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (e.isFile()) {
      if (isCodeFile(full)) out.push(full);
    }
  }
  return out;
}

function isUseClient(source) {
  // Heuristic: look for directive near the top.
  const head = source.split(/\r?\n/).slice(0, 30).join("\n");
  return /(^|\n)\s*["']use client["']\s*;?\s*(\n|$)/.test(head);
}

function lineOfIndex(source, idx) {
  // 1-based line number
  let line = 1;
  for (let i = 0; i < idx; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

function findAllMatches(source, re) {
  const matches = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = r.exec(source))) {
    matches.push({ index: m.index, text: m[0] });
  }
  return matches;
}

function extractImportSpecifiers(source) {
  const specs = [];
  const patterns = [
    /import\s+[^;]*?\s+from\s+["']([^"']+)["']/g,
    /export\s+[^;]*?\s+from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const p of patterns) {
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = p.exec(source))) {
      specs.push(m[1]);
    }
  }
  return specs;
}

function resolvesIntoAppsApi(importerFile, spec) {
  if (!spec || typeof spec !== "string") return false;
  if (spec === "@8fold/api" || spec.startsWith("@8fold/api/")) return true;
  if (spec.includes("apps/api")) return true;
  if (spec.startsWith(".")) {
    const abs = path.resolve(path.dirname(importerFile), spec);
    const normalized = abs.replace(/\\/g, "/");
    return normalized.includes(`${ROOT.replace(/\\/g, "/")}/apps/api/`);
  }
  return false;
}

const failures = [];

function fail(rule, message, hits = []) {
  failures.push({ rule, message, hits });
}

const allCodeFiles = walk(ROOT);

// ---- Rule 1: Drizzle init only in canonical db file ----
{
  const re = /\bdrizzle\s*\(/g;
  const hits = [];
  for (const f of allCodeFiles) {
    if (path.resolve(f) === path.resolve(ALLOWED_DB_FILE)) continue;
    const s = fs.readFileSync(f, "utf8");
    const ms = findAllMatches(s, re);
    if (!ms.length) continue;
    for (const m of ms.slice(0, 5)) {
      hits.push(`${rel(f)}:${lineOfIndex(s, m.index)}  ${m.text}`);
    }
  }
  if (hits.length) {
    fail(
      "drizzle-init",
      `Found Drizzle initialization outside ${rel(ALLOWED_DB_FILE)}`,
      hits
    );
  }
}

// ---- Rule 2: Pool construction only in canonical db file ----
{
  const re = /\bnew\s+Pool\s*\(/g;
  const hits = [];
  for (const f of allCodeFiles) {
    if (path.resolve(f) === path.resolve(ALLOWED_DB_FILE)) continue;
    const s = fs.readFileSync(f, "utf8");
    const ms = findAllMatches(s, re);
    if (!ms.length) continue;
    for (const m of ms.slice(0, 5)) {
      hits.push(`${rel(f)}:${lineOfIndex(s, m.index)}  ${m.text}`);
    }
  }
  if (hits.length) {
    fail(
      "pool-init",
      `Found Pool construction outside ${rel(ALLOWED_DB_FILE)}`,
      hits
    );
  }
}

// ---- Rule 3: apps/web must not import apps/api runtime modules ----
{
  const webFiles = allCodeFiles.filter((f) => f.startsWith(WEB_ROOT + path.sep));
  const hits = [];
  for (const f of webFiles) {
    const s = fs.readFileSync(f, "utf8");
    const specs = extractImportSpecifiers(s);
    for (const spec of specs) {
      if (resolvesIntoAppsApi(f, spec)) {
        hits.push(`${rel(f)}  imports '${spec}'`);
      }
    }
  }
  if (hits.length) {
    fail("web-imports-api", "apps/web imports from apps/api (disallowed)", hits.slice(0, 50));
  }
}

// ---- Rule 4: client-side fetch references localhost:3003 ----
{
  const webFiles = allCodeFiles.filter((f) => f.startsWith(WEB_ROOT + path.sep));
  const hits = [];
  for (const f of webFiles) {
    const s = fs.readFileSync(f, "utf8");
    if (!isUseClient(s)) continue;
    const idx = s.indexOf("localhost:3003");
    if (idx !== -1) hits.push(`${rel(f)}:${lineOfIndex(s, idx)}  localhost:3003`);
  }
  if (hits.length) {
    fail("client-localhost-3003", "Client-side code references localhost:3003", hits);
  }
}

// ---- Rule 5: Disallow API base env usage in browser code ----
{
  const ENV_TOKEN = ["API", "BASE", "URL"].join("_");
  const webFiles = allCodeFiles.filter((f) => f.startsWith(WEB_ROOT + path.sep));
  const hits = [];
  for (const f of webFiles) {
    const s = fs.readFileSync(f, "utf8");
    if (!isUseClient(s)) continue;
    const idx = s.indexOf(ENV_TOKEN);
    if (idx !== -1) hits.push(`${rel(f)}:${lineOfIndex(s, idx)}  ${ENV_TOKEN}`);
  }
  if (hits.length) {
    fail("client-api-base-env", "Browser code must not use API base env vars", hits);
  }
}

if (failures.length) {
  // eslint-disable-next-line no-console
  console.error("\n❌ Guardrails failed:\n");
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.error(`- [${f.rule}] ${f.message}`);
    for (const h of f.hits ?? []) {
      // eslint-disable-next-line no-console
      console.error(`  - ${h}`);
    }
    // eslint-disable-next-line no-console
    console.error("");
  }
  process.exit(1);
} else {
  // eslint-disable-next-line no-console
  console.log("✅ Guardrails passed");
}

