import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getTradeSkillsWithCerts, upsertTradeSkills } from "@/src/services/v4/contractorTradeService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";
import { getResolvedSchema } from "@/server/db/schemaLock";

export const runtime = "nodejs";

async function assertTradeTableExists(): Promise<boolean> {
  try {
    const schema = getResolvedSchema();
    const res = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${schema} AND table_name = 'v4_contractor_trade_skills'
      ) AS exists
    `);
    const rows = (res as { rows?: { exists: boolean }[] })?.rows ?? [];
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "CONTRACTOR");
    if (role instanceof Response) return role;
    requestId = role.requestId;

    if (!(await assertTradeTableExists())) {
      console.error("V4_CONTRACTOR_TRADES_SCHEMA_MISSING: v4_contractor_trade_skills not found");
      return NextResponse.json(
        { ok: false, error: "Contractor trade system not initialized — migration required" },
        { status: 503 },
      );
    }

    const skills = await getTradeSkillsWithCerts(role.userId);
    return NextResponse.json({ ok: true, trades: skills });
  } catch (err) {
    console.error("V4_CONTRACTOR_TRADES_GET_ERROR", { requestId, err });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_TRADES_LOAD_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}

const PutBodySchema = z.object({
  trades: z
    .array(
      z.object({
        tradeCategory: z.string().min(1),
        yearsExperience: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(3),
});

export async function PUT(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "CONTRACTOR");
    if (role instanceof Response) return role;
    requestId = role.requestId;

    if (!(await assertTradeTableExists())) {
      console.error("V4_CONTRACTOR_TRADES_SCHEMA_MISSING: v4_contractor_trade_skills not found");
      return NextResponse.json(
        { ok: false, error: "Contractor trade system not initialized — migration required" },
        { status: 503 },
      );
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = PutBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const result = await upsertTradeSkills(role.userId, parsed.data.trades);
    return NextResponse.json({ ok: true, trades: result });
  } catch (err) {
    console.error("V4_CONTRACTOR_TRADES_PUT_ERROR", { requestId, err });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_TRADES_SAVE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
