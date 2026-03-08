import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4FrontpageTickerMessages } from "@/db/schema/v4FrontpageTicker";

export async function GET() {
  try {
    const rows = await db
      .select({
        id: v4FrontpageTickerMessages.id,
        message: v4FrontpageTickerMessages.message,
        displayOrder: v4FrontpageTickerMessages.displayOrder,
        intervalSeconds: v4FrontpageTickerMessages.intervalSeconds,
      })
      .from(v4FrontpageTickerMessages)
      .where(eq(v4FrontpageTickerMessages.isActive, true))
      .orderBy(asc(v4FrontpageTickerMessages.displayOrder))
      .limit(5);

    return NextResponse.json(
      { ok: true, messages: rows },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (err) {
    console.error("[TICKER] Failed to fetch ticker messages:", err);
    return NextResponse.json({ ok: false, messages: [] }, { status: 500 });
  }
}
