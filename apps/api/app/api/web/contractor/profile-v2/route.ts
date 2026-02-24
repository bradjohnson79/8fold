/**
 * V2 Contractor Profile API — isolated from legacy /api/web/contractor/profile.
 * Used by the stateless contractor setup portal (/contractor/setup).
 *
 * Does NOT modify legacy profile logic.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/src/auth/rbac";
import { toHttpError } from "@/src/http/errors";
import { getV2Profile, upsertV2Profile, V2ProfileBodySchema } from "@/src/services/contractorProfileV2";

export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "CONTRACTOR" && String(u.role) !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await getV2Profile(u.userId);
    return NextResponse.json(result);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "CONTRACTOR" && String(u.role) !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const raw = await req.json().catch(() => ({}));
    const parsed = V2ProfileBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await upsertV2Profile(u.userId, parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status: status || 500 });
  }
}
