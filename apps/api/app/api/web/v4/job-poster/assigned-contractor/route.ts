import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getAssignedContractorForJobPoster } from "@/src/services/v4/jobPosterAssignedContractorService";

export async function GET(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;

  const assignment = await getAssignedContractorForJobPoster(role.userId);
  return NextResponse.json({ ok: true, assignment }, { status: 200 });
}
