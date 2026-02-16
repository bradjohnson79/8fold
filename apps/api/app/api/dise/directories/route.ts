import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { directories } from "@/db/schema/directoryEngine";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");
    const country = searchParams.get("country");
    const scope = searchParams.get("scope");

    const conditions = [];
    if (region) conditions.push(eq(directories.region, region));
    if (country) conditions.push(eq(directories.country, country));
    if (scope && (scope === "REGIONAL" || scope === "NATIONAL")) {
      conditions.push(eq(directories.scope, scope));
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = whereClause
      ? await db.select().from(directories).where(whereClause).orderBy(directories.createdAt)
      : await db.select().from(directories).orderBy(directories.createdAt);
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("DISE directories list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
