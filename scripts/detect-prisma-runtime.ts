/**
 * Guardrail: detect Prisma usage inside admin API routes (apps/api/app/api/admin/**).
 *
 * Purpose: fail CI/build if NEW admin API files start importing Prisma.
 * Scope is intentionally narrow (admin layer only) to avoid breaking legacy modules.
 *
 * Run:
 *   pnpm exec tsx scripts/detect-prisma-runtime.ts
 */
import fs from "node:fs";
import path from "node:path";

const TARGET_ROOT = path.join(process.cwd(), "apps", "api", "app", "api", "admin");

// Allowlist of CURRENT Prisma-using admin routes (legacy compatibility layer).
// Guardrail intent: prevent Prisma from spreading to *new* admin API files.
const ALLOWED_PRISMA_IMPORT_FILES = new Set<string>([
  "apps/api/app/api/admin/users/routers/route.ts",
  "apps/api/app/api/admin/users/job-posters/route.ts",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function fileImportsPrisma(contents: string): boolean {
  // Detect typical TS imports:
  // - import { PrismaClient } from "@prisma/client"
  // - import { prisma } from ".../src/db/prisma"
  return (
    /from\s+["']@prisma\/client["']/.test(contents) ||
    /from\s+["'][^"']*\/src\/db\/prisma["']/.test(contents) ||
    /from\s+["'][^"']*src\/db\/prisma["']/.test(contents)
  );
}

function main() {
  const files = walk(TARGET_ROOT);
  const offenders: Array<{ file: string; reason: string }> = [];

  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const rel = path.relative(process.cwd(), f);
    if (fileImportsPrisma(text)) {
      if (!ALLOWED_PRISMA_IMPORT_FILES.has(rel)) {
        offenders.push({ file: rel, reason: "Imports Prisma or prisma client wrapper (not allowlisted)" });
      }
    }
  }

  if (offenders.length) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: "Prisma import detected in apps/api/app/api/admin/** (disallowed by Phase 1 guardrail).",
          offenders,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        checked: files.length,
        targetRoot: path.relative(process.cwd(), TARGET_ROOT),
        allowlisted: Array.from(ALLOWED_PRISMA_IMPORT_FILES.values()).sort(),
      },
      null,
      2,
    ),
  );
}

main();

