import { asc } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@/server/db/drizzle";
import { v4FrontpageTickerMessages } from "@/db/schema/v4FrontpageTicker";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const CreateSchema = z.object({
  message: z.string().trim().min(1).max(500),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(1).max(5),
  intervalSeconds: z.number().int().min(1).max(120).default(6),
});

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const rows = await db
    .select()
    .from(v4FrontpageTickerMessages)
    .orderBy(asc(v4FrontpageTickerMessages.displayOrder));

  return ok({ messages: rows });
}

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Invalid ticker message payload";
    return err(400, "ADMIN_V4_INVALID_REQUEST", msg);
  }

  const existing = await db.select({ id: v4FrontpageTickerMessages.id }).from(v4FrontpageTickerMessages);
  if (existing.length >= 5) {
    return err(400, "ADMIN_V4_TICKER_LIMIT", "Maximum of 5 ticker messages allowed");
  }

  const rows = await db
    .insert(v4FrontpageTickerMessages)
    .values({
      id: randomUUID(),
      message: parsed.data.message,
      isActive: parsed.data.isActive,
      displayOrder: parsed.data.displayOrder,
      intervalSeconds: parsed.data.intervalSeconds,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return ok({ message: rows[0] ?? null }, 201);
}
