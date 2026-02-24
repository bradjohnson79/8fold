#!/usr/bin/env tsx
/**
 * Conflict report for preserved rows during admin-domain migration.
 *
 * Reports source rows that were NOT inserted due to unique-key collisions in public.
 * Current scope:
 * - public."User" unique keys: email, clerkUserId, authUserId
 * - public."AdminUser" unique key: email
 *
 * Usage:
 *   pnpm -C apps/api exec tsx scripts/report-admin-domain-conflicts.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

type UserConflict = {
  sourceId: string;
  sourceEmail: string | null;
  sourceClerkUserId: string | null;
  sourceAuthUserId: string | null;
  collisions: Array<{
    field: "email" | "clerkUserId" | "authUserId";
    targetId: string;
    targetEmail: string | null;
    targetClerkUserId: string | null;
    targetAuthUserId: string | null;
  }>;
};

type AdminUserConflict = {
  sourceId: string;
  sourceEmail: string;
  collisions: Array<{
    field: "email";
    targetId: string;
    targetEmail: string;
  }>;
};

type Report = {
  ok: boolean;
  sourceSchema: string;
  targetSchema: string;
  database: string;
  timestamp: string;
  summary: {
    userConflicts: number;
    adminUserConflicts: number;
  };
  userConflicts: UserConflict[];
  adminUserConflicts: AdminUserConflict[];
};

const SOURCE_SCHEMA = "8fold_test";
const TARGET_SCHEMA = "public";

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(scriptDir, "..", "..", "..");
  dotenv.config({ path: path.join(apiRoot, ".env.local") });

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required (apps/api/.env.local)");

  const database = (() => {
    try {
      const u = new URL(url);
      return u.pathname.replace(/^\//, "") || "unknown";
    } catch {
      return "unknown";
    }
  })();

  const report: Report = {
    ok: true,
    sourceSchema: SOURCE_SCHEMA,
    targetSchema: TARGET_SCHEMA,
    database,
    timestamp: new Date().toISOString(),
    summary: {
      userConflicts: 0,
      adminUserConflicts: 0,
    },
    userConflicts: [],
    adminUserConflicts: [],
  };

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const userSourceRes = await client.query<{
      id: string;
      email: string | null;
      clerkUserId: string | null;
      authUserId: string | null;
    }>(
      `
      SELECT s."id", s."email", s."clerkUserId", s."authUserId"
      FROM "8fold_test"."User" s
      WHERE NOT EXISTS (
        SELECT 1 FROM public."User" t WHERE t."id" = s."id"
      )
      ORDER BY s."id"
      `,
    );

    for (const src of userSourceRes.rows) {
      const collisions: UserConflict["collisions"] = [];

      if (src.email) {
        const r = await client.query<{ id: string; email: string | null; clerkUserId: string | null; authUserId: string | null }>(
          `SELECT "id","email","clerkUserId","authUserId" FROM public."User" WHERE "email" = $1 LIMIT 1`,
          [src.email],
        );
        if (r.rows[0]) {
          collisions.push({
            field: "email",
            targetId: r.rows[0].id,
            targetEmail: r.rows[0].email,
            targetClerkUserId: r.rows[0].clerkUserId,
            targetAuthUserId: r.rows[0].authUserId,
          });
        }
      }

      if (src.clerkUserId) {
        const r = await client.query<{ id: string; email: string | null; clerkUserId: string | null; authUserId: string | null }>(
          `SELECT "id","email","clerkUserId","authUserId" FROM public."User" WHERE "clerkUserId" = $1 LIMIT 1`,
          [src.clerkUserId],
        );
        if (r.rows[0]) {
          collisions.push({
            field: "clerkUserId",
            targetId: r.rows[0].id,
            targetEmail: r.rows[0].email,
            targetClerkUserId: r.rows[0].clerkUserId,
            targetAuthUserId: r.rows[0].authUserId,
          });
        }
      }

      if (src.authUserId) {
        const r = await client.query<{ id: string; email: string | null; clerkUserId: string | null; authUserId: string | null }>(
          `SELECT "id","email","clerkUserId","authUserId" FROM public."User" WHERE "authUserId" = $1 LIMIT 1`,
          [src.authUserId],
        );
        if (r.rows[0]) {
          collisions.push({
            field: "authUserId",
            targetId: r.rows[0].id,
            targetEmail: r.rows[0].email,
            targetClerkUserId: r.rows[0].clerkUserId,
            targetAuthUserId: r.rows[0].authUserId,
          });
        }
      }

      if (collisions.length > 0) {
        report.userConflicts.push({
          sourceId: src.id,
          sourceEmail: src.email,
          sourceClerkUserId: src.clerkUserId,
          sourceAuthUserId: src.authUserId,
          collisions,
        });
      }
    }

    const adminSourceRes = await client.query<{ id: string; email: string }>(
      `
      SELECT s."id", s."email"
      FROM "8fold_test"."AdminUser" s
      WHERE NOT EXISTS (
        SELECT 1 FROM public."AdminUser" t WHERE t."id" = s."id"
      )
      ORDER BY s."id"
      `,
    );

    for (const src of adminSourceRes.rows) {
      const collisions: AdminUserConflict["collisions"] = [];
      const r = await client.query<{ id: string; email: string }>(
        `SELECT "id","email" FROM public."AdminUser" WHERE "email" = $1 LIMIT 1`,
        [src.email],
      );
      if (r.rows[0]) {
        collisions.push({
          field: "email",
          targetId: r.rows[0].id,
          targetEmail: r.rows[0].email,
        });
      }
      if (collisions.length > 0) {
        report.adminUserConflicts.push({
          sourceId: src.id,
          sourceEmail: src.email,
          collisions,
        });
      }
    }

    report.summary.userConflicts = report.userConflicts.length;
    report.summary.adminUserConflicts = report.adminUserConflicts.length;
  } finally {
    await client.end();
  }

  const outPath = path.join(repoRoot, "docs", "ADMIN_DOMAIN_CONFLICT_REPORT.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        reportPath: outPath,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

