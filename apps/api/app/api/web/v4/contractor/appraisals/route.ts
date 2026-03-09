import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { listAdjustmentsForContractor } from "@/src/services/v4/v4JobPriceAdjustmentService";

export async function GET(req: Request) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  try {
    const appraisals = await listAdjustmentsForContractor(role.userId);
    return NextResponse.json({ ok: true, appraisals });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to load appraisals" }, { status });
  }
}
