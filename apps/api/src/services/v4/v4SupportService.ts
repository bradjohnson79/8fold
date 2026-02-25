import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";

export async function createSupportTicket(
  userId: string,
  role: string,
  subject: string,
  category: string,
  body: string
): Promise<{ id: string }> {
  const id = randomUUID();
  const sub = String(subject ?? "").trim();
  const cat = String(category ?? "").trim();
  const b = String(body ?? "").trim();
  if (!sub) throw new Error("Subject is required");
  if (!cat) throw new Error("Category is required");
  if (!b) throw new Error("Body is required");

  await db.insert(v4SupportTickets).values({
    id,
    userId,
    role,
    subject: sub,
    category: cat,
    body: b,
    status: "OPEN",
  });

  return { id };
}
