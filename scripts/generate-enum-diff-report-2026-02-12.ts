/**
 * Generate docs/ENUM_DIFF_REPORT_2026_02_12.md by comparing:
 * - Postgres enum snapshot (docs/POSTGRES_ENUM_SNAPSHOT_2026_02_12.md)
 * - Prisma schema enums (prisma/schema.prisma)
 * - Drizzle enums (apps/api/db/schema/enums.ts)
 *
 * No DB writes. Pure documentation.
 */
import fs from "node:fs";
import path from "node:path";

function readUtf8(p: string) {
  return fs.readFileSync(p, "utf8");
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function parsePostgresSnapshot(md: string): Map<string, string[]> {
  // Snapshot embeds JSON array inside ```json ... ```
  const m = md.match(/```json\s*([\s\S]*?)\s*```/);
  if (!m) throw new Error("Could not find ```json block in POSTGRES_ENUM_SNAPSHOT");
  const jsonText = m[1];
  const rows = JSON.parse(jsonText) as Array<{ typname: string; enumlabel: string }>;
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const k = r.typname;
    const prev = out.get(k) ?? [];
    prev.push(r.enumlabel);
    out.set(k, prev);
  }
  return out;
}

function parsePrismaEnums(schema: string): Map<string, string[]> {
  // Minimal parser: finds `enum Name { ... }` blocks.
  const out = new Map<string, string[]>();
  const re = /(^|\n)\s*enum\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) {
    const name = m[2];
    const body = m[3];
    const values = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => !l.startsWith("//"))
      .map((l) => l.split(/\s+/)[0]) // first token
      .filter((v) => /^[A-Za-z0-9_]+$/.test(v));
    out.set(name, values);
  }
  return out;
}

function parseDrizzleEnums(ts: string): Map<string, string[]> {
  // Parse `pgEnum("EnumName", [ "A", "B", ... ])`
  const out = new Map<string, string[]>();
  const re = /pgEnum\(\s*"([^"]+)"\s*,\s*\[([\s\S]*?)\]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ts))) {
    const name = m[1];
    const body = m[2];
    const values = Array.from(body.matchAll(/"([^"]+)"/g)).map((x) => x[1]);
    out.set(name, values);
  }
  return out;
}

function setDiff(a: string[], b: string[]) {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x));
}

function main() {
  const repoRoot = process.cwd();
  const timestamp = new Date().toISOString();

  const postgresMdPath = path.join(repoRoot, "docs", "POSTGRES_ENUM_SNAPSHOT_2026_02_12.md");
  const prismaPath = path.join(repoRoot, "prisma", "schema.prisma");
  const drizzleEnumsPath = path.join(repoRoot, "apps", "api", "db", "schema", "enums.ts");
  const outPath = path.join(repoRoot, "docs", "ENUM_DIFF_REPORT_2026_02_12.md");

  const postgres = parsePostgresSnapshot(readUtf8(postgresMdPath));
  const prisma = parsePrismaEnums(readUtf8(prismaPath));
  const drizzle = parseDrizzleEnums(readUtf8(drizzleEnumsPath));

  const allEnumNames = uniq([
    ...Array.from(postgres.keys()),
    ...Array.from(prisma.keys()),
    ...Array.from(drizzle.keys()),
  ]).sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];
  lines.push("## ENUM DIFF REPORT — 2026-02-12");
  lines.push("");
  lines.push(`Generated: \`${timestamp}\``);
  lines.push("");
  lines.push("Compared sources:");
  lines.push("");
  lines.push(`- Postgres snapshot: \`docs/POSTGRES_ENUM_SNAPSHOT_2026_02_12.md\``);
  lines.push(`- Prisma schema (frozen): \`prisma/schema.prisma\``);
  lines.push(`- Drizzle enums: \`apps/api/db/schema/enums.ts\``);
  lines.push("");

  for (const name of allEnumNames) {
    const pgVals = postgres.get(name) ?? null;
    const prismaVals = prisma.get(name) ?? null;
    const drizzleVals = drizzle.get(name) ?? null;

    const pgList = pgVals ?? [];
    const prismaList = prismaVals ?? [];
    const drizzleList = drizzleVals ?? [];

    const pgMissingInPrisma = pgVals ? setDiff(pgList, prismaList) : [];
    const prismaExtraVsPg = pgVals ? setDiff(prismaList, pgList) : [];
    const pgMissingInDrizzle = pgVals ? setDiff(pgList, drizzleList) : [];
    const drizzleExtraVsPg = pgVals ? setDiff(drizzleList, pgList) : [];

    const status =
      !pgVals
        ? "NO_POSTGRES_ENUM"
        : pgMissingInPrisma.length === 0 &&
            prismaExtraVsPg.length === 0 &&
            pgMissingInDrizzle.length === 0 &&
            drizzleExtraVsPg.length === 0
          ? "ALIGNED"
          : "MISMATCH";

    lines.push(`### ${name} — ${status}`);
    lines.push("");
    lines.push("- Postgres values:");
    lines.push("");
    lines.push("```");
    lines.push(pgVals ? pgList.join("\n") : "(not present)");
    lines.push("```");
    lines.push("");
    lines.push("- Prisma values:");
    lines.push("");
    lines.push("```");
    lines.push(prismaVals ? prismaList.join("\n") : "(not present)");
    lines.push("```");
    lines.push("");
    lines.push("- Drizzle values:");
    lines.push("");
    lines.push("```");
    lines.push(drizzleVals ? drizzleList.join("\n") : "(not present)");
    lines.push("```");
    lines.push("");

    if (pgVals) {
      if (pgMissingInPrisma.length || prismaExtraVsPg.length) {
        lines.push("**Prisma vs Postgres mismatches**");
        lines.push("");
        if (pgMissingInPrisma.length) lines.push(`- Missing in Prisma: \`${pgMissingInPrisma.join("`, `")}\``);
        if (prismaExtraVsPg.length) lines.push(`- Extra in Prisma: \`${prismaExtraVsPg.join("`, `")}\``);
        lines.push("");
      }
      if (pgMissingInDrizzle.length || drizzleExtraVsPg.length) {
        lines.push("**Drizzle vs Postgres mismatches**");
        lines.push("");
        if (pgMissingInDrizzle.length) lines.push(`- Missing in Drizzle: \`${pgMissingInDrizzle.join("`, `")}\``);
        if (drizzleExtraVsPg.length) lines.push(`- Extra in Drizzle: \`${drizzleExtraVsPg.join("`, `")}\``);
        lines.push("");
      }
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, outPath, enumCount: allEnumNames.length }, null, 2));
}

main();

