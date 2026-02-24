import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { getV4JobPosterProfile, saveV4JobPosterProfile } from "@/src/services/v4/jobPosterProfileService";
import { V4JobPosterProfileSchema } from "@/src/validation/v4/jobPosterProfileSchema";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const role = await requireRole(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    return NextResponse.json(await getV4JobPosterProfile(role.internalUser.id));
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_JOB_POSTER_PROFILE_LOAD_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}

export async function PUT(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const role = await requireRole(req, "JOB_POSTER");
    if (role instanceof Response) return role;

    const raw = await req.json().catch(() => null);
    const parsed = V4JobPosterProfileSchema.safeParse(raw);
    if (!parsed.success) {
      throw badRequest(
        "V4_INVALID_REQUEST_BODY",
        "Invalid input",
        { issues: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })) },
      );
    }
    await saveV4JobPosterProfile(role.internalUser.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_JOB_POSTER_PROFILE_SAVE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
