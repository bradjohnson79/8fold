import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { getClerkIdentity } from "@/src/auth/getClerkIdentity";
import { getV4RouterProfile, saveV4RouterProfile, V4RouterProfileSchema } from "@/src/services/v4/routerProfileService";
import { badRequest, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const role = await requireRole(req, "ROUTER");
    if (role instanceof Response) return role;
    return NextResponse.json(await getV4RouterProfile(role.internalUser.id), { status: 200 });
  } catch (err) {
    const wrapped =
      err instanceof Error && "status" in err
        ? (err as V4Error)
        : badRequest("V4_ROUTER_PROFILE_LOAD_FAILED", "Failed to load router profile");
    const safeStatus = wrapped.status === 401 ? 401 : 400;
    const safeError =
      safeStatus === 401 ? wrapped : badRequest(wrapped.code ?? "V4_ROUTER_PROFILE_LOAD_FAILED", wrapped.message ?? "Failed to load router profile", wrapped.details);
    return NextResponse.json(toV4ErrorResponse(safeError, requestId), { status: safeStatus });
  }
}

async function save(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const role = await requireRole(req, "ROUTER");
    if (role instanceof Response) return role;
    const raw = await req.json().catch(() => null);
    const parsed = V4RouterProfileSchema.safeParse(raw);
    if (!parsed.success) {
      throw badRequest(
        "V4_INVALID_REQUEST_BODY",
        "Invalid input",
        { issues: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })) },
      );
    }

    if (!parsed.data.homeCountryCode?.trim() || !parsed.data.homeRegionCode?.trim()) {
      throw badRequest("V4_INVALID_REQUEST_BODY", "Router jurisdiction required");
    }

    let identity: Awaited<ReturnType<typeof getClerkIdentity>> | null = null;
    try {
      identity = await getClerkIdentity(role.clerkUserId);
    } catch (identityErr) {
      console.error("[router-profile-save] getClerkIdentity failed, continuing with null", identityErr);
    }
    await saveV4RouterProfile(role.internalUser.id, parsed.data, identity);
    return NextResponse.json(await getV4RouterProfile(role.internalUser.id), { status: 200 });
  } catch (err) {
    console.error("[router-profile-save]", err);
    const wrapped =
      err instanceof Error && "status" in err
        ? (err as V4Error)
        : badRequest("V4_ROUTER_PROFILE_SAVE_FAILED", "Failed to save router profile");
    const safeStatus = wrapped.status === 401 ? 401 : 400;
    const safeError =
      safeStatus === 401 ? wrapped : badRequest(wrapped.code ?? "V4_ROUTER_PROFILE_SAVE_FAILED", wrapped.message ?? "Failed to save router profile", wrapped.details);
    return NextResponse.json(toV4ErrorResponse(safeError, requestId), { status: safeStatus });
  }
}

export async function POST(req: Request) {
  return save(req);
}

export async function PUT(req: Request) {
  return save(req);
}
