import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { V4ContractorProfileSchema } from "@/src/validation/v4/contractorProfileSchema";
import { getV4ContractorProfile, upsertV4ContractorProfile } from "@/src/services/v4/contractorProfileService";

export async function GET(req: Request) {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    const role = await requireRole(req, "CONTRACTOR");
    if (role instanceof Response) return role;
    return NextResponse.json(await getV4ContractorProfile(role.internalUser.id));
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
    return NextResponse.json({ ok: false, error: "PROFILE_LOAD_FAILED" }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    const role = await requireRole(req, "CONTRACTOR");
    if (role instanceof Response) return role;
    const raw = await req.json().catch(() => ({}));
    const parsed = V4ContractorProfileSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await upsertV4ContractorProfile(role.internalUser.id, parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
    return NextResponse.json({ ok: false, error: "PROFILE_SAVE_FAILED" }, { status });
  }
}
