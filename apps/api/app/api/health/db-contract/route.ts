import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";

/**
 * DB contract health check.
 * Verifies canonical schema: jobs table exists, required snake_case columns exist,
 * no quoted camelCase duplicates.
 * Returns 500 if drift detected.
 */
const REQUIRED_JOBS_COLUMNS = [
  "id",
  "status",
  "archived",
  "title",
  "country",
  "region",
  "created_at",
  "updated_at",
  "amount_cents",
  "payment_status",
  "public_status",
  "job_poster_user_id",
  "contractor_user_id",
  "router_approved_at",
];

const CAMELCASE_VIOLATIONS = ["amountCents", "createdAt", "updatedAt", "jobId"];

export async function GET() {
  try {
    // 1) jobs table exists
    const tableCheck = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'jobs'
      ) AS exists
    `);
    const tableExists = (tableCheck as any)?.rows?.[0]?.exists === true;
    if (!tableExists) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_contract_violation",
          detail: "jobs table does not exist",
          expected: "public.jobs",
        },
        { status: 500 },
      );
    }

    // 2) Required snake_case columns exist
    const colsRes = await db.execute<{ column_name: string }>(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'jobs'
    `);
    const existingCols = new Set(((colsRes as any)?.rows ?? []).map((r: { column_name: string }) => r.column_name));

    const missing: string[] = [];
    for (const col of REQUIRED_JOBS_COLUMNS) {
      if (!existingCols.has(col)) {
        missing.push(col);
      }
    }
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_contract_violation",
          detail: "jobs table missing required snake_case columns",
          missing,
        },
        { status: 500 },
      );
    }

    // 3) No quoted camelCase duplicates (legacy columns should not exist)
    const camelCaseFound: string[] = [];
    for (const bad of CAMELCASE_VIOLATIONS) {
      if (existingCols.has(bad)) {
        camelCaseFound.push(bad);
      }
    }
    if (camelCaseFound.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_contract_violation",
          detail: "jobs table has legacy quoted camelCase columns",
          legacyColumns: camelCaseFound,
        },
        { status: 500 },
      );
    }

    // 4) job_photos table exists with snake_case job_id
    const photosTableCheck = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'job_photos'
      ) AS exists
    `);
    const photosExists = (photosTableCheck as any)?.rows?.[0]?.exists === true;
    if (!photosExists) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_contract_violation",
          detail: "job_photos table does not exist",
          expected: "public.job_photos",
        },
        { status: 500 },
      );
    }

    const photosColsRes = await db.execute<{ column_name: string }>(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'job_photos'
    `);
    const photosCols = new Set(((photosColsRes as any)?.rows ?? []).map((r: { column_name: string }) => r.column_name));
    if (!photosCols.has("job_id")) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_contract_violation",
          detail: "job_photos missing snake_case job_id column",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      contract: "canonical",
      jobs: "ok",
      job_photos: "ok",
      snake_case: "verified",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "db_contract_error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
