/**
 * Snapshot Prisma schema + environment metadata for archival.
 *
 * Writes: docs/PRISMA_FROZEN_SCHEMA_2026_02_12.md
 */
import fs from "node:fs";
import path from "node:path";
import childProcess from "node:child_process";

function sh(cmd: string): string {
  return childProcess.execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trimEnd();
}

function safeRead(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function listMigrationFolders(prismaDir: string): string[] {
  const migrationsDir = path.join(prismaDir, "migrations");
  if (!fs.existsSync(migrationsDir)) return [];
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

function main() {
  const repoRoot = process.cwd();
  const timestamp = new Date().toISOString();

  const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Missing prisma schema at ${schemaPath}`);
  }

  const schema = safeRead(schemaPath);
  const nodeVersion = process.version;
  const prismaVersionOutput = sh("npx prisma -v");
  const migrationFolders = listMigrationFolders(path.join(repoRoot, "prisma"));

  const outPath = path.join(repoRoot, "docs", "PRISMA_FROZEN_SCHEMA_2026_02_12.md");

  const lines: string[] = [];
  lines.push("## PRISMA FROZEN — Schema Snapshot (2026-02-12)");
  lines.push("");
  lines.push(`Timestamp: \`${timestamp}\``);
  lines.push("");
  lines.push("### Runtime");
  lines.push("");
  lines.push(`- Node: \`${nodeVersion}\``);
  lines.push("");
  lines.push("### Prisma CLI");
  lines.push("");
  lines.push("```");
  lines.push(prismaVersionOutput);
  lines.push("```");
  lines.push("");
  lines.push("### Migrations folder listing");
  lines.push("");
  lines.push("```");
  lines.push(migrationFolders.length ? migrationFolders.map((m) => `prisma/migrations/${m}/`).join("\n") : "(none)");
  lines.push("```");
  lines.push("");
  lines.push("### prisma/schema.prisma (verbatim)");
  lines.push("");
  lines.push("```prisma");
  lines.push(schema.trimEnd());
  lines.push("```");
  lines.push("");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, outPath }, null, 2));
}

main();

