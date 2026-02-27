import "dotenv/config";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { admins } from "@/db/schema/admin";

async function main() {
  const email = String(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD ?? "");
  const role = String(process.env.ADMIN_ROLE ?? "ADMIN_SUPER").trim().toUpperCase();

  if (!email || !email.includes("@")) throw new Error("ADMIN_EMAIL is required");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email)).limit(1);
  if (existing[0]?.id) {
    await db
      .update(admins)
      .set({ passwordHash, role, disabledAt: null })
      .where(eq(admins.id, existing[0].id));
    console.log(JSON.stringify({ ok: true, action: "updated", email, role }, null, 2));
    return;
  }

  const created = await db
    .insert(admins)
    .values({ email, passwordHash, role })
    .returning({ id: admins.id, email: admins.email, role: admins.role });

  console.log(JSON.stringify({ ok: true, action: "created", admin: created[0] ?? null }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
