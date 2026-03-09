import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { storeContractorCertificate } from "@/src/storage/contractorCertificates";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "CONTRACTOR");
    if (role instanceof Response) return role;
    requestId = role.requestId;

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      throw badRequest("CERT_UPLOAD_FILE_REQUIRED", "Missing file");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await storeContractorCertificate({
      userId: role.userId,
      originalName: file.name || "certificate",
      mimeType: String(file.type ?? "").toLowerCase(),
      buf,
    });

    return NextResponse.json({
      ok: true,
      url: stored.publicUrl,
      certificateType: stored.certificateType,
    });
  } catch (err) {
    console.error("V4_CERT_UPLOAD_ERROR", { requestId, err });
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CERT_UPLOAD_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
