import { NextResponse } from "next/server";
import { toHttpError } from "../../../../../src/http/errors";
import { listRegionsWithJobs } from "../../../../../src/server/repos/jobPublicRepo.drizzle";

export async function GET() {
  try {
    const out = await listRegionsWithJobs();
    return NextResponse.json(out);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

