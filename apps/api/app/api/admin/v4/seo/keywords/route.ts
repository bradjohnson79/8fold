import { z } from "zod";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { discoverKeywords } from "@/src/services/v4/seo/keywordService";

const QuerySchema = z.object({
  keyword: z.string().min(2).max(100),
});

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "SEO_KEYWORDS_INVALID", parsed.error.errors[0]?.message ?? "Invalid keyword");
    }

    const keywords = await discoverKeywords(parsed.data.keyword);
    return ok({ keywords });
  } catch (e) {
    console.error("[seo/keywords POST]", e);
    return err(500, "SEO_KEYWORDS_ERROR", "Failed to discover keywords");
  }
}
