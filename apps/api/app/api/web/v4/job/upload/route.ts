import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { uploadV4JobPhoto } from "@/src/services/v4/jobUploadService";

export async function POST(req: Request) {
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;
  const role = await requireRole(req, "JOB_POSTER");
  if (role instanceof Response) return role;

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  }

  return NextResponse.json(await uploadV4JobPhoto(role.internalUser.id, file), { status: 200 });
}
