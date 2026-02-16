import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { routers } from "../../../../db/schema/router";
import { routerProfiles } from "../../../../db/schema/routerProfile";
import { users } from "../../../../db/schema/user";
import { requireUser } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  address: z.string().trim().min(3).max(240).optional(),
  addressPrivate: z.string().trim().min(3).max(240).optional(),
  termsAccepted: z.boolean().optional(),
  payoutMethod: z.enum(["STRIPE", "PAYPAL"]).nullable().optional(),
  stateProvince: z.string().trim().min(2).max(2).optional(),
});

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    if (String(u.role) !== "ROUTER" && String(u.role) !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { name, email, address, addressPrivate, payoutMethod, stateProvince, termsAccepted } = body.data;
    const isAdmin = String(u.role) === "ADMIN";
    const nextStateProvince = isAdmin && stateProvince ? stateProvince.trim().toUpperCase() : null;
    const nextAddressPrivate = (addressPrivate ?? address) ?? null;

    await db.transaction(async (tx) => {
      if (email) {
        await tx.update(users).set({ email }).where(eq(users.id, u.userId));
      }

      if (termsAccepted === true) {
        await tx.update(routers).set({ termsAccepted: true }).where(eq(routers.userId, u.userId));
      }

      if (nextStateProvince) {
        // Admin-only: allow editing router home region + profile state from the role dashboard.
        // Do not auto-create router rows; updateMany is no-op if missing.
        await tx.update(routers).set({ homeRegionCode: nextStateProvince }).where(eq(routers.userId, u.userId));
      }

      // Preserve existing stripeAccountId: never set it here.
      const createValues: Record<string, unknown> = {
        userId: u.userId,
        status: "ACTIVE",
        ...(name != null ? { name } : {}),
        ...(nextAddressPrivate != null ? { addressPrivate: nextAddressPrivate } : {}),
        ...(payoutMethod != null ? { payoutMethod } : {}),
        ...(nextStateProvince ? { state: nextStateProvince } : {}),
      };
      const updateValues: Record<string, unknown> = {
        ...(name != null ? { name } : {}),
        ...(nextAddressPrivate != null ? { addressPrivate: nextAddressPrivate } : {}),
        ...(payoutMethod != null ? { payoutMethod } : {}),
        ...(nextStateProvince ? { state: nextStateProvince } : {}),
      };

      await tx
        .insert(routerProfiles)
        .values(createValues as any)
        .onConflictDoUpdate({
          target: routerProfiles.userId,
          set: updateValues as any,
        });

      // Keep profileComplete in sync (deterministic, additive).
      const pRows = await tx
        .select({ name: routerProfiles.name, addressPrivate: routerProfiles.addressPrivate })
        .from(routerProfiles)
        .where(eq(routerProfiles.userId, u.userId))
        .limit(1);
      const p = pRows[0] ?? null;
      const complete = Boolean(String(p?.name ?? "").trim()) && Boolean(String((p as any)?.addressPrivate ?? "").trim());
      await tx.update(routers).set({ profileComplete: complete }).where(eq(routers.userId, u.userId));
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

