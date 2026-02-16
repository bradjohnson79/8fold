import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { regionalContext } from "@/db/schema/directoryEngine";

type PatchBody = {
  country?: string;
  keyIndustries?: unknown;
  topTrades?: unknown;
  serviceDemand?: unknown;
  populationTraits?: unknown;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ region: string }> }
) {
  try {
    const { region } = await params;
    const [row] = await db
      .select()
      .from(regionalContext)
      .where(eq(regionalContext.region, decodeURIComponent(region)));
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("DISE regional-context get error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ region: string }> }
) {
  try {
    const { region } = await params;
    const body = (await req.json().catch(() => ({}))) as PatchBody;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.country != null) update.country = body.country;
    if (body.keyIndustries != null) update.keyIndustries = body.keyIndustries;
    if (body.topTrades != null) update.topTrades = body.topTrades;
    if (body.serviceDemand != null) update.serviceDemand = body.serviceDemand;
    if (body.populationTraits != null) update.populationTraits = body.populationTraits;

    const [row] = await db
      .update(regionalContext)
      .set(update)
      .where(eq(regionalContext.region, decodeURIComponent(region)))
      .returning();

    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("DISE regional-context patch error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
