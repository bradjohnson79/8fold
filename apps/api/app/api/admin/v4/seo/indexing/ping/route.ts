import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { pingUrl } from "@/src/services/v4/seo/indexingService";

const PingSchema = z.object({
  url: z.string().url({ message: "Must be a valid URL" }),
});

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = PingSchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "SEO_PING_INVALID", parsed.error.errors[0]?.message ?? "Invalid URL");
    }

    const results = await pingUrl(parsed.data.url, "manual");
    return ok({ results });
  } catch (e) {
    console.error("[seo/indexing/ping POST]", e);
    return err(500, "SEO_PING_ERROR", "Failed to ping indexing engines");
  }
}
