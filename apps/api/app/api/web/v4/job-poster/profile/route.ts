import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { getV4JobPosterProfile, saveV4JobPosterProfile } from "@/src/services/v4/jobPosterProfileService";
import { V4JobPosterProfileSchema } from "@/src/validation/v4/jobPosterProfileSchema";

export async function GET(req: Request) {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;
  const role = await requireRole(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return NextResponse.json(await getV4JobPosterProfile(role.internalUser.id));
}

export async function PUT(req: Request) {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;
  const role = await requireRole(req, "JOB_POSTER");
  if (role instanceof Response) return role;

  const raw = await req.json().catch(() => null);
  const parsed = V4JobPosterProfileSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  await saveV4JobPosterProfile(role.internalUser.id, parsed.data);
  return NextResponse.json({ ok: true });
}
