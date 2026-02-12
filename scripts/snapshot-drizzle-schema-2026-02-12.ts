/**
 * Snapshot Drizzle schema sources (verbatim) + version/config metadata.
 *
 * Writes: docs/DRIZZLE_SCHEMA_SNAPSHOT_2026_02_12.md
 */
import fs from "node:fs";
import path from "node:path";

type Pkg = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readUtf8(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function main() {
  const repoRoot = process.cwd();
  const timestamp = new Date().toISOString();

  const apiPkgPath = path.join(repoRoot, "apps", "api", "package.json");
  const apiPkg = JSON.parse(readUtf8(apiPkgPath)) as Pkg;
  const drizzleOrmVersion =
    apiPkg.dependencies?.["drizzle-orm"] ??
    apiPkg.devDependencies?.["drizzle-orm"] ??
    "(not found in apps/api/package.json)";

  const drizzleKitVersion = (() => {
    const rootPkgPath = path.join(repoRoot, "package.json");
    if (!fs.existsSync(rootPkgPath)) return "(root package.json missing)";
    const rootPkg = JSON.parse(readUtf8(rootPkgPath)) as Pkg;
    return rootPkg.devDependencies?.["drizzle-kit"] ?? "(not found in root devDependencies)";
  })();

  const drizzleDbPath = path.join(repoRoot, "apps", "api", "db", "drizzle.ts");
  const drizzleSchemaRoot = path.join(repoRoot, "apps", "api", "db", "schema");

  const schemaFiles = listFilesRecursive(drizzleSchemaRoot)
    .filter((p) => p.endsWith(".ts"))
    .sort((a, b) => a.localeCompare(b));

  const outPath = path.join(repoRoot, "docs", "DRIZZLE_SCHEMA_SNAPSHOT_2026_02_12.md");
  const lines: string[] = [];
  lines.push("## DRIZZLE SCHEMA SNAPSHOT — 2026-02-12");
  lines.push("");
  lines.push(`Timestamp: \`${timestamp}\``);
  lines.push("");
  lines.push("### Versions");
  lines.push("");
  lines.push(`- drizzle-orm (apps/api): \`${drizzleOrmVersion}\``);
  lines.push(`- drizzle-kit (root): \`${drizzleKitVersion}\``);
  lines.push("");
  lines.push("### DB connection config (verbatim)");
  lines.push("");
  lines.push(`File: \`${path.relative(repoRoot, drizzleDbPath)}\``);
  lines.push("");
  lines.push("```ts");
  lines.push(readUtf8(drizzleDbPath).trimEnd());
  lines.push("```");
  lines.push("");
  lines.push("### Schema sources (verbatim)");
  lines.push("");
  lines.push("Files included:");
  lines.push("");
  lines.push("```");
  lines.push(schemaFiles.map((p) => path.relative(repoRoot, p)).join("\n"));
  lines.push("```");
  lines.push("");

  for (const p of schemaFiles) {
    lines.push(`#### ${path.relative(repoRoot, p)}`);
    lines.push("");
    lines.push("```ts");
    lines.push(readUtf8(p).trimEnd());
    lines.push("```");
    lines.push("");
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, outPath, schemaFileCount: schemaFiles.length }, null, 2));
}

main();

