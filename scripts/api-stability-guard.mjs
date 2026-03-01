import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "apps", "api");
const API_ROUTE_ROOT = path.join(API_DIR, "app", "api");
const CANONICAL_DB_FILE = path.join(API_DIR, "src", "server", "db", "drizzle.ts");
const HEALTHZ_FILE = path.join(API_DIR, "app", "healthz", "route.ts");
const NOOP_FILE = path.join(API_DIR, "app", "api", "health", "noop", "route.ts");

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", "coverage"]);

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, "/");
}

function toApiUrlPath(absDir) {
  const relDir = path.relative(API_ROUTE_ROOT, absDir).replace(/\\/g, "/");
  if (!relDir || relDir === ".") return "/api";
  return `/api/${relDir}`;
}

function walkDirs(root, out = []) {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    out.push(full);
    walkDirs(full, out);
  }
  return out;
}

function walkFiles(root, out = []) {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkFiles(full, out);
      continue;
    }
    if (entry.isFile() && CODE_EXTS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function parseDynamicSegment(dirName) {
  let m = dirName.match(/^\[([A-Za-z0-9_]+)\]$/);
  if (m) return m[1];
  m = dirName.match(/^\[\.\.\.([A-Za-z0-9_]+)\]$/);
  if (m) return m[1];
  m = dirName.match(/^\[\[\.\.\.([A-Za-z0-9_]+)\]\]$/);
  if (m) return m[1];
  return null;
}

function findAll(source, re) {
  const out = [];
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const g = new RegExp(re.source, flags);
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = g.exec(source))) out.push(m);
  return out;
}

function lineOfIndex(source, idx) {
  let line = 1;
  for (let i = 0; i < idx; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

const failures = [];

function fail(rule, message, hits = []) {
  failures.push({ rule, message, hits });
}

function checkDynamicRoutes() {
  const dirs = walkDirs(API_ROUTE_ROOT);
  const dynamicEntries = [];
  const byParent = new Map();

  for (const dir of dirs) {
    const name = path.basename(dir);
    const paramName = parseDynamicSegment(name);
    if (!paramName) continue;
    const parent = path.dirname(dir);
    const routePath = toApiUrlPath(dir);
    dynamicEntries.push({
      path: routePath,
      paramName,
      parent: toApiUrlPath(parent),
    });
    const key = parent;
    const row = byParent.get(key) ?? { params: new Set(), routes: [] };
    row.params.add(paramName);
    row.routes.push(routePath);
    byParent.set(key, row);
  }

  const conflicts = [];
  for (const [parent, row] of byParent.entries()) {
    const params = Array.from(row.params).sort();
    if (params.length > 1) {
      conflicts.push({
        parent: toApiUrlPath(parent),
        params,
        routes: row.routes.sort(),
      });
    }
  }

  if (conflicts.length) {
    fail(
      "dynamic-slug-siblings",
      "Dynamic route sibling slug mismatch detected under apps/api/app/api",
      conflicts.map((c) => `${c.parent} -> [${c.params.join(", ")}]`),
    );
  }

  return {
    dynamicCount: dynamicEntries.length,
    conflictCount: conflicts.length,
    conflicts,
  };
}

function checkDbSingleton() {
  const files = walkFiles(API_DIR);
  const poolViolations = [];
  const drizzleViolations = [];
  const pgDriverViolations = [];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const isCanonical = path.resolve(file) === path.resolve(CANONICAL_DB_FILE);

    if (!isCanonical) {
      for (const m of findAll(source, /\bnew\s+Pool\s*\(/g)) {
        poolViolations.push(`${rel(file)}:${lineOfIndex(source, m.index)} new Pool(`);
      }
      for (const m of findAll(source, /\bdrizzle\s*\(/g)) {
        drizzleViolations.push(`${rel(file)}:${lineOfIndex(source, m.index)} drizzle(`);
      }
    }

    const inApiSrc = file.startsWith(path.join(API_DIR, "src") + path.sep);
    if (inApiSrc) {
      for (const m of findAll(source, /from\s+["']pg["']|require\s*\(\s*["']pg["']\s*\)/g)) {
        pgDriverViolations.push(`${rel(file)}:${lineOfIndex(source, m.index)} ${m[0]}`);
      }
    }
  }

  if (poolViolations.length) {
    fail("db-pool-singleton", "new Pool() found outside canonical drizzle.ts", poolViolations.slice(0, 25));
  }
  if (drizzleViolations.length) {
    fail("db-drizzle-singleton", "drizzle() found outside canonical drizzle.ts", drizzleViolations.slice(0, 25));
  }
  if (pgDriverViolations.length) {
    fail("db-driver-pg-disallowed", "pg driver import/require found in apps/api/src", pgDriverViolations.slice(0, 25));
  }

  if (!fs.existsSync(CANONICAL_DB_FILE)) {
    fail("db-canonical-file", "Canonical DB file missing", [rel(CANONICAL_DB_FILE)]);
    return {
      poolViolations,
      drizzleViolations,
      pgDriverViolations,
      canonicalChecks: { exists: false, usesServerlessPool: false, usesNeonDrizzleDriver: false, poolMaxDefaultOne: false },
    };
  }

  const canonical = fs.readFileSync(CANONICAL_DB_FILE, "utf8");
  const usesServerlessPool = /from\s+["']@neondatabase\/serverless["']/.test(canonical);
  const usesNeonDrizzleDriver = /from\s+["']drizzle-orm\/neon-serverless["']/.test(canonical);
  const poolMaxDefaultOne = /process\.env\.POOL_MAX[\s\S]{0,220}:\s*1/.test(canonical);

  if (!usesServerlessPool) {
    fail("db-driver-neon-missing", "Canonical DB file must import @neondatabase/serverless", [rel(CANONICAL_DB_FILE)]);
  }
  if (!usesNeonDrizzleDriver) {
    fail("db-drizzle-driver-missing", "Canonical DB file must use drizzle-orm/neon-serverless", [rel(CANONICAL_DB_FILE)]);
  }
  if (!poolMaxDefaultOne) {
    fail("db-pool-max-default", "POOL_MAX default must resolve to 1 in canonical DB file", [rel(CANONICAL_DB_FILE)]);
  }

  return {
    poolViolations,
    drizzleViolations,
    pgDriverViolations,
    canonicalChecks: { exists: true, usesServerlessPool, usesNeonDrizzleDriver, poolMaxDefaultOne },
  };
}

function checkHealthIsolation() {
  const targets = [HEALTHZ_FILE, NOOP_FILE];
  const out = [];

  for (const file of targets) {
    if (!fs.existsSync(file)) {
      fail("health-file-missing", "Health endpoint file missing", [rel(file)]);
      continue;
    }
    const source = fs.readFileSync(file, "utf8");
    const imports = findAll(source, /^\s*import\s+.*?from\s+["']([^"']+)["']/gm).map((m) => m[1]);
    const disallowedImports = imports.filter((spec) => spec !== "next/server");
    const hasFetch = /\bfetch\s*\(/.test(source);
    const bannedTokens = [
      "requireAuth",
      "requireAdmin",
      "@/src/server/db",
      "@/server/db",
      "DATABASE_URL",
      "getValidated",
      "ADMIN_ORIGIN",
      "WEB_ORIGIN",
    ];
    const forbiddenTokenHits = bannedTokens.filter((tok) => source.includes(tok));

    if (disallowedImports.length) {
      fail("health-import-isolation", "Health endpoints must only import next/server", [
        `${rel(file)} imports: ${disallowedImports.join(", ")}`,
      ]);
    }
    if (hasFetch) {
      fail("health-upstream-fetch", "Health endpoints must not call upstream fetch()", [rel(file)]);
    }
    if (forbiddenTokenHits.length) {
      fail("health-forbidden-tokens", "Health endpoints contain forbidden auth/db/config usage", [
        `${rel(file)} tokens: ${forbiddenTokenHits.join(", ")}`,
      ]);
    }

    out.push({
      file: rel(file),
      importCount: imports.length,
      onlyNextServerImports: disallowedImports.length === 0,
      hasFetch,
      forbiddenTokenHits,
    });
  }

  return out;
}

function run() {
  if (!fs.existsSync(API_ROUTE_ROOT)) {
    fail("api-route-root", "Missing apps/api/app/api directory", [rel(API_ROUTE_ROOT)]);
  }

  const dynamicReport = checkDynamicRoutes();
  const dbReport = checkDbSingleton();
  const healthReport = checkHealthIsolation();

  const summary = {
    checks: {
      dynamicSlugConflictCheck: dynamicReport.conflictCount === 0 ? "passed" : "failed",
      dbSingletonCheck:
        dbReport.poolViolations.length === 0 &&
        dbReport.drizzleViolations.length === 0 &&
        dbReport.pgDriverViolations.length === 0 &&
        dbReport.canonicalChecks.exists &&
        dbReport.canonicalChecks.usesServerlessPool &&
        dbReport.canonicalChecks.usesNeonDrizzleDriver &&
        dbReport.canonicalChecks.poolMaxDefaultOne
          ? "passed"
          : "failed",
      healthIsolationCheck: healthReport.every((r) => r.onlyNextServerImports && !r.hasFetch && r.forbiddenTokenHits.length === 0)
        ? "passed"
        : "failed",
    },
    dynamicRoutes: {
      scannedRoot: rel(API_ROUTE_ROOT),
      dynamicCount: dynamicReport.dynamicCount,
      conflictCount: dynamicReport.conflictCount,
    },
    dbSingleton: {
      canonicalFile: rel(CANONICAL_DB_FILE),
      poolViolations: dbReport.poolViolations.length,
      drizzleViolations: dbReport.drizzleViolations.length,
      pgDriverViolations: dbReport.pgDriverViolations.length,
      canonicalChecks: dbReport.canonicalChecks,
    },
    healthIsolation: healthReport,
  };

  if (failures.length) {
    // eslint-disable-next-line no-console
    console.error("❌ API stability guard failed");
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ summary, failures }, null, 2));
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("✅ API stability guard passed");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

run();
