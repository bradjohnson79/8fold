import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { backlinks } from "@/db/schema/directoryEngine";

type PatchBody = {
  verified?: boolean;
  listingUrl?: string;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as PatchBody;

    const update: Record<string, unknown> = {};
    if (body.verified != null) update.verified = body.verified;
    if (body.listingUrl != null) update.listingUrl = body.listingUrl;
    if (body.verified === true) update.lastChecked = new Date();

    const [row] = await db
      .update(backlinks)
      .set(update)
      .where(eq(backlinks.id, id))
      .returning();

    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (err) {
    console.error("DISE backlink patch error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
