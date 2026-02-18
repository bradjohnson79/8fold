import fs from "node:fs";
import path from "node:path";

type Failure = { message: string; files?: string[] };

const ROOT = path.resolve(process.cwd());

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "dist") continue;
      walk(full, exts, out);
    } else if (e.isFile()) {
      if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
  }
  return out;
}

function fileContains(file: string, patterns: RegExp[]): boolean {
  const s = fs.readFileSync(file, "utf8");
  return patterns.some((p) => p.test(s));
}

function rel(p: string) {
  return path.relative(ROOT, p);
}

function depsOf(pkgJsonPath: string): Set<string> {
  const j = readJson(pkgJsonPath);
  const all = { ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}), ...(j.optionalDependencies ?? {}) };
  return new Set(Object.keys(all));
}

function fail(message: string, files?: string[]) {
  const f: Failure = { message, files };
  failures.push(f);
}

const failures: Failure[] = [];

// ---- Rule A: apps/web must not depend on drizzle/pg and must not import api db ----
const webPkg = path.join(ROOT, "apps/web/package.json");
if (fs.existsSync(webPkg)) {
  const deps = depsOf(webPkg);
  const forbiddenDeps = ["drizzle-orm", "pg"];
  const hit = forbiddenDeps.filter((d) => deps.has(d));
  if (hit.length) fail(`apps/web/package.json must not include ${hit.join(", ")}`);
}

const webFiles = walk(path.join(ROOT, "apps/web/src"), [".ts", ".tsx", ".js", ".jsx"]);
const webForbiddenImports = [
  /from\s+["']drizzle-orm\b/,
  /from\s+["']pg["']/,
  /from\s+["']@api\/db\//,
  /from\s+["']\.\.\/\.\.\/api\/db\//,
  /from\s+["']\.\.\/api\/db\//,
];
const webBad = webFiles.filter((f) => fileContains(f, webForbiddenImports));
if (webBad.length) fail("apps/web must not import drizzle/pg or @api/db/*", webBad.map(rel));

// ---- Rule B: only the canonical DB module may initialize Drizzle/Pool for prod ----
// Note: we intentionally scan code files only (docs can contain snippets).
const repoFiles = walk(ROOT, [".ts", ".tsx", ".js", ".jsx"]);
const drizzleInit = /drizzle\s*\(\s*pool\s*\)|drizzle\s*\(\s*new\s+Pool\s*\(|drizzle-orm\/node-postgres/;
const poolInit = /new\s+Pool\s*\(/;

const allowedInit = new Set([
  rel(path.join(ROOT, "apps/api/src/server/db/drizzle.ts")),
  rel(path.join(ROOT, "apps/api/src/testUtils/testDb.ts")), // test-only
]);

const initHits = repoFiles
  .filter((f) => fileContains(f, [drizzleInit, poolInit]))
  .map(rel)
  .filter((r) => !allowedInit.has(r));

if (initHits.length) {
  fail("Found unexpected Drizzle/Pool initialization outside allowed files", initHits);
}

// ---- Rule C: apps/admin should not import drizzle-orm directly in runtime code (use @api/db/* boundary) ----
// Allow scripts/ to use pg/clients for one-off ops.
const adminRuntimeDirs = [
  path.join(ROOT, "apps/admin/app"),
  path.join(ROOT, "apps/admin/src"),
];
const adminRuntimeFiles = adminRuntimeDirs.flatMap((d) => walk(d, [".ts", ".tsx", ".js", ".jsx"]));
const adminForbiddenDirect = [/from\s+["']drizzle-orm\b/, /from\s+["']pg["']/];
const adminBad = adminRuntimeFiles.filter((f) => fileContains(f, adminForbiddenDirect));
if (adminBad.length) {
  fail(
    "apps/admin runtime code must not import drizzle-orm or pg directly (import db/helpers from @api/* instead)",
    adminBad.map(rel)
  );
}

// ---- Rule E: DISE routes must remain operationally isolated ----
// DISE isolation contract:
// - Must not couple to job lifecycle, ledger, or Stripe/payments.
// - Must not import non-DISE schemas in DISE routes (DB writes/read must be via directoryEngine tables only).
//
// We scan import strings (not full AST) intentionally to keep this check dependency-free.
const diseRouteDirs = [
  path.join(ROOT, "apps/api/app/api/dise"),
  path.join(ROOT, "apps/dise/src/app/api/dise"),
];
const diseFiles = diseRouteDirs.flatMap((d) => walk(d, [".ts", ".tsx", ".js", ".jsx"]));

const diseForbiddenImports: RegExp[] = [
  // Schema boundary: only allow directoryEngine in DISE routes
  /from\s+["']@\/db\/schema\/(?!directoryEngine\b)[^"']+["']/,

  // No job lifecycle coupling
  /from\s+["']@\/.*\bjobs?\b[^"']*["']/,

  // No ledger coupling
  /from\s+["']@\/.*\bledger\b[^"']*["']/,

  // No Stripe / payments coupling (direct + common internal modules)
  /from\s+["']stripe\b["']/,
  /from\s+["']@\/.*\bstripe\b[^"']*["']/,
  /from\s+["']@\/.*\bpayments?\b[^"']*["']/,
  /from\s+["']@\/.*\bpayouts?\b[^"']*["']/,
  /from\s+["']@\/.*\bwebhooks?\b[^"']*["']/,
];

const diseBad = diseFiles.filter((f) => fileContains(f, diseForbiddenImports));
if (diseBad.length) {
  fail(
    "DISE routes must not import jobs/ledger/stripe/payments, and must only import DB schema from @/db/schema/directoryEngine",
    diseBad.map(rel)
  );
}

// ---- Rule D: canonical db file must exist in apps/api ----
const canonicalDb = path.join(ROOT, "apps/api/src/server/db/drizzle.ts");
if (!fs.existsSync(canonicalDb)) {
  fail("Missing canonical db instance file: apps/api/src/server/db/drizzle.ts");
}

if (failures.length) {
  // eslint-disable-next-line no-console
  console.error("\n❌ Boundary check failed:\n");
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.error(`- ${f.message}`);
    if (f.files?.length) {
      for (const p of f.files) {
        // eslint-disable-next-line no-console
        console.error(`  - ${p}`);
      }
    }
  }
  process.exit(1);
} else {
  // eslint-disable-next-line no-console
  console.log("✅ Boundary check passed");
}

