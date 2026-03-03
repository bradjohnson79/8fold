import { NextResponse } from "next/server";
import { listRegionsWithJobs } from "../../../../../src/server/repos/jobPublicRepo.drizzle";

export async function GET() {
  try {
    const out = await listRegionsWithJobs();
    return NextResponse.json(out);
  } catch (err) {
    console.error("PUBLIC_DISCOVERY_ERROR", { route: "/api/public/locations/regions-with-jobs", error: err });
    return NextResponse.json({ error: "PUBLIC_DISCOVERY_FAILED" }, { status: 500 });
  }
}

