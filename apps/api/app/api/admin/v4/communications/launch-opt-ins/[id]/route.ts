import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { launchOptIns } from "@/db/schema/launchOptIn";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const PatchSchema = z.object({
  status: z.enum(["new", "contacted", "invited", "converted"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Invalid status";
    return err(400, "ADMIN_V4_INVALID_REQUEST", msg);
  }

  const [updated] = await db
    .update(launchOptIns)
    .set({ status: parsed.data.status })
    .where(eq(launchOptIns.id, id))
    .returning();

  if (!updated) {
    return err(404, "ADMIN_V4_NOT_FOUND", "Launch opt-in not found");
  }

  return ok({ optIn: updated });
}
