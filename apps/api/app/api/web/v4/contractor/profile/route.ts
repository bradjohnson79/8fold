import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getClerkIdentity } from "@/src/auth/getClerkIdentity";
import { V4ContractorProfileSchema } from "@/src/validation/v4/contractorProfileSchema";
import { getV4ContractorProfile, upsertV4ContractorProfile } from "@/src/services/v4/contractorProfileService";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "CONTRACTOR");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    return NextResponse.json(await getV4ContractorProfile(role.userId));
  } catch (err) {
    console.error("V4_CONTRACTOR_PROFILE_GET_ERROR", { requestId, err });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CONTRACTOR_PROFILE_LOAD_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}

export async function PUT(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "CONTRACTOR");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const raw = await req.json().catch(() => ({}));
    const parsed = V4ContractorProfileSchema.safeParse(raw);
    if (!parsed.success) {
      throw badRequest(
        "V4_INVALID_REQUEST_BODY",
        "Invalid input",
        { issues: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })) },
      );
    }
    const identity = await getClerkIdentity(role.clerkUserId);
    await upsertV4ContractorProfile(role.userId, parsed.data, identity);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("V4_CONTRACTOR_PROFILE_PUT_ERROR", { requestId, err });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CONTRACTOR_PROFILE_SAVE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
