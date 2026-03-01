import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { getClerkIdentity } from "@/src/auth/getClerkIdentity";
import { getV4RouterProfile, saveV4RouterProfile, V4RouterProfileSchema } from "@/src/services/v4/routerProfileService";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

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
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ROUTER_PROFILE_LOAD_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
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

    const identity = await getClerkIdentity(role.clerkUserId);
    await saveV4RouterProfile(role.internalUser.id, parsed.data, identity);
    return NextResponse.json(await getV4RouterProfile(role.internalUser.id), { status: 200 });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ROUTER_PROFILE_SAVE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}

export async function POST(req: Request) {
  return save(req);
}

export async function PUT(req: Request) {
  return save(req);
}
