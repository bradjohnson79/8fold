import { NextResponse } from "next/server";
import { requireRouterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";
import { claimJob } from "../../../../../src/services/routerJobService";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/claim
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  try {
    const ready = await requireRouterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    const id = getIdFromUrl(req);

    const result = await claimJob(user.userId, id);

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.kind === "already_active") {
      return NextResponse.json(
        { error: "You already have an active job", active: { id: result.activeJobId } },
        { status: 409 }
      );
    }
    if (result.kind === "already_claimed") {
      return NextResponse.json({ error: "Job already claimed" }, { status: 409 });
    }
    if (result.kind === "job_not_open") {
      return NextResponse.json({ error: "Job no longer available" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

