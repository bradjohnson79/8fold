import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../../../db/schema/auditLog";
import { contractors } from "../../../../db/schema/contractor";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import {
  ContractorCreateInputSchema,
  ContractorListQuerySchema
} from "@8fold/shared";
import { tradeEnumToCategoryKey, tradeEnumToTradeCategories } from "../../../../src/contractors/tradeMap";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = ContractorListQuerySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
    }

    const { status, q } = parsed.data;
    if (status) {
      const allowed = new Set(["PENDING", "APPROVED", "REJECTED"]);
      if (!allowed.has(String(status))) {
        return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
      }
    }
    const where = and(
      status ? eq(contractors.status, status as any) : undefined,
      q
        ? or(
            ilike(contractors.businessName, `%${q}%`),
            ilike(contractors.email, `%${q}%`),
            ilike(contractors.phone, `%${q}%`),
          )
        : undefined,
    );

    const rows = await db
      .select()
      .from(contractors)
      .where(where as any)
      .orderBy(desc(contractors.createdAt))
      .limit(250);

    return NextResponse.json({ ok: true, data: { contractors: rows } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/contractors", {
      route: "/api/admin/contractors",
      userId: auth.userId,
    });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = ContractorCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "invalid_input" },
        { status: 400 }
      );
    }

    const now = new Date();
    const id = randomUUID();
    const tradeCategories = (parsed.data.tradeCategories ?? tradeEnumToTradeCategories(parsed.data.trade)) as any;
    const contractor = await db
      .insert(contractors)
      .values({
        id,
        status: "PENDING",
        businessName: parsed.data.businessName,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
        country: parsed.data.country as any,
        regionCode: parsed.data.regionCode.toUpperCase(),
        trade: parsed.data.trade as any,
        tradeCategories,
        automotiveEnabled: Boolean(parsed.data.automotiveEnabled),
        categories: [tradeEnumToCategoryKey(parsed.data.trade)],
        regions: [parsed.data.regionCode.toLowerCase()],
        createdAt: now,
      } as any)
      .returning();

    const created = contractor[0]!;

    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: auth.userId,
      action: "CONTRACTOR_CREATE",
      entityType: "Contractor",
      entityId: String((created as any).id),
      metadata: {
        status: String((created as any).status ?? ""),
        businessName: String((created as any).businessName ?? ""),
      } as any,
    });

    return NextResponse.json({ ok: true, data: { contractor: created } }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/contractors", {
      route: "/api/admin/contractors",
      userId: auth.userId,
    });
  }
}

