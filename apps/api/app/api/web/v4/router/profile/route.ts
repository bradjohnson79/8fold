import { NextResponse } from "next/server";
import { requireRouter } from "@/src/auth/rbac";
import { toHttpError } from "@/src/http/errors";
import { getV4RouterProfile, saveV4RouterProfile, V4RouterProfileSchema } from "@/src/services/v4/routerProfileService";

export async function GET(req: Request) {
  try {
    const router = await requireRouter(req);
    return NextResponse.json(await getV4RouterProfile(router.userId), { status: 200 });
  } catch (err) {
    const { status } = toHttpError(err);
    return NextResponse.json({ ok: false, error: "PROFILE_LOAD_FAILED" }, { status: status || 500 });
  }
}

async function save(req: Request) {
  try {
    const router = await requireRouter(req);
    const raw = await req.json().catch(() => null);
    const parsed = V4RouterProfileSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });

    await saveV4RouterProfile(router.userId, parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status } = toHttpError(err);
    return NextResponse.json({ ok: false, error: "PROFILE_SAVE_FAILED" }, { status: status || 500 });
  }
}

export async function POST(req: Request) {
  return save(req);
}

export async function PUT(req: Request) {
  return save(req);
}
