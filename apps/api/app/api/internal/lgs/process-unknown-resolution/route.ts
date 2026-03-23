export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

async function handleUnknownResolution(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  return Response.json({
    ok: true,
    started_at: startedAt,
    disabled: true,
    message: "Legacy unknown-resolution worker disabled for simplicity reset",
  });
}

export async function GET(req: Request) {
  return handleUnknownResolution(req);
}

export async function POST(req: Request) {
  return handleUnknownResolution(req);
}
