import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { countryContext } from "@/db/schema/directoryEngine";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");

    if (country) {
      const [row] = await db
        .select()
        .from(countryContext)
        .where(eq(countryContext.country, country));
      return NextResponse.json({ ok: true, data: row ?? null });
    }

    const rows = await db.select().from(countryContext);
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("DISE country-context list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
