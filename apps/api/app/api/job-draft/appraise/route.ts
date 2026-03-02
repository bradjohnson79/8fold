import { NextResponse } from "next/server";
import { requireJobPoster } from "@/src/auth/rbac";

function gone() {
  // eslint-disable-next-line no-console
  console.warn("[JOB_DRAFT_DEPRECATED]");
  return NextResponse.json({ success: false, message: "Draft system deprecated" }, { status: 410 });
}

export async function POST(req: Request) {
  try {
    await requireJobPoster(req);
    return gone();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Draft system deprecated" },
      { status },
    );
  }
}
