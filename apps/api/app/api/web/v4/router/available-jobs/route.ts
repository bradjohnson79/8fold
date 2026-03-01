import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getV4RouterAvailableJobs } from "@/src/services/v4/routerAvailableJobsService";

export async function GET(req: Request) {
  try {
    const authed = await requireV4Role(req, "ROUTER");
    if (authed instanceof Response) return authed;
    const result = await getV4RouterAvailableJobs(authed.userId);
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true, jobs: [] }, { status: 200 });
  }
}
