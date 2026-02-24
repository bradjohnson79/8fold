import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { getV4RouterProfile, saveV4RouterProfile, V4RouterProfileSchema } from "@/src/services/v4/routerProfileService";

export async function GET(req: Request) {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    const role = await requireRole(req, "ROUTER");
    if (role instanceof Response) return role;
    return NextResponse.json(await getV4RouterProfile(role.internalUser.id), { status: 200 });
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
    return NextResponse.json({ ok: false, error: "PROFILE_LOAD_FAILED" }, { status: status || 500 });
  }
}

async function save(req: Request) {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    const role = await requireRole(req, "ROUTER");
    if (role instanceof Response) return role;
    const raw = await req.json().catch(() => null);
    const parsed = V4RouterProfileSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });

    await saveV4RouterProfile(role.internalUser.id, parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
    return NextResponse.json({ ok: false, error: "PROFILE_SAVE_FAILED" }, { status: status || 500 });
  }
}

export async function POST(req: Request) {
  return save(req);
}

export async function PUT(req: Request) {
  return save(req);
}
