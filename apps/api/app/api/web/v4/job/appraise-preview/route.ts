import { NextResponse } from "next/server";
import { computeV4JobAppraisal, V4JobAppraiseBodySchema } from "@/src/services/v4/jobAppraisePreviewService";

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = V4JobAppraiseBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join("; ") || "Invalid request body";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json(computeV4JobAppraisal(parsed.data));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Appraisal preview failed." },
      { status: 500 },
    );
  }
}
