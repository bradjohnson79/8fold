import crypto from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { contractorAccounts, users } from "@/db/schema";
import { contractorsRepo, db, mapUsersRowsToAdminUserDTO, requireAdmin, requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const CreateContractorSchema = z.object({
  clerkUserId: z.string().trim().min(1),
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(32).optional(),
  country: z.enum(["US", "CA"]).default("US"),
  regionCode: z.string().trim().min(1).max(16),
  city: z.string().trim().min(1).max(100).optional(),
  businessName: z.string().trim().min(1).max(160),
});

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const params = contractorsRepo.parseRoleListParams(searchParams);
    const data = await contractorsRepo.list(params);

    const nullRows = (data.rows as any[]).filter((r) => !r.name && !r.email && r.clerkUserId);
    if (nullRows.length > 0) {
      const client = await clerkClient();
      const { data: clerkUsers } = await client.users.getUserList({
        userId: nullRows.map((r: any) => r.clerkUserId),
      });
      const clerkMap = new Map(clerkUsers.map((u) => [u.id, u]));
      (data as any).rows = (data.rows as any[]).map((row: any) => {
        if (!row.name && !row.email && row.clerkUserId) {
          const cu = clerkMap.get(row.clerkUserId);
          if (cu) {
            const name =
              `${cu.firstName ?? ""} ${cu.lastName ?? ""}`.trim() ||
              cu.username ||
              "Unknown User";
            const email =
              cu.emailAddresses?.find((e: any) => e.id === cu.primaryEmailAddressId)
                ?.emailAddress ?? null;
            return { ...row, name, email };
          }
        }
        return row;
      });
    }

    return ok({ ...data, rows: mapUsersRowsToAdminUserDTO(data.rows as any[]) });
  } catch (error) {
    console.error("[ADMIN_V4_CONTRACTORS_LIST_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_CONTRACTORS_LIST_FAILED", "Failed to load contractors");
  }
}

export async function POST(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const json = await req.json().catch(() => null);
    const body = CreateContractorSchema.safeParse(json);
    if (!body.success) return err(400, "ADMIN_V4_CONTRACTOR_CREATE_INVALID", "Invalid contractor create payload");

    const now = new Date();
    const data = body.data;

    const existingUsers = await db
      .select({
        id: users.id,
        role: users.role,
        email: users.email,
        clerkUserId: users.clerkUserId,
      })
      .from(users)
      .where(or(eq(users.clerkUserId, data.clerkUserId), eq(users.email, data.email)))
      .limit(2);

    const existing = existingUsers[0] ?? null;
    if (existing && String(existing.role).toUpperCase() !== "CONTRACTOR") {
      return err(409, "ROLE_IMMUTABLE", "User already exists with a different role.");
    }

    let userId = existing?.id ?? null;
    if (!userId) {
      const inserted = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          clerkUserId: data.clerkUserId,
          email: data.email,
          name: data.name,
          phone: data.phone ?? null,
          role: "CONTRACTOR",
          status: "ACTIVE",
          country: data.country as any,
          countryCode: data.country as any,
          stateCode: data.regionCode.toUpperCase(),
          legalCity: data.city ?? "",
          legalCountry: data.country,
          updatedByAdminId: authed.adminId,
          createdAt: now,
          updatedAt: now,
        } as any)
        .returning({ id: users.id });
      userId = inserted[0]?.id ?? null;
    } else {
      await db
        .update(users)
        .set({
          email: data.email,
          name: data.name,
          phone: data.phone ?? null,
          status: "ACTIVE",
          country: data.country as any,
          countryCode: data.country as any,
          stateCode: data.regionCode.toUpperCase(),
          legalCity: data.city ?? "",
          legalCountry: data.country,
          updatedByAdminId: authed.adminId,
          updatedAt: now,
        } as any)
        .where(and(eq(users.id, userId), eq(users.role, "CONTRACTOR" as any)));
    }

    if (!userId) return err(500, "ADMIN_V4_CONTRACTOR_CREATE_FAILED", "Failed to create contractor user");

    await db
      .insert(contractorAccounts)
      .values({
        userId,
        firstName: data.name.split(" ")[0] ?? data.name,
        lastName: data.name.split(" ").slice(1).join(" ") || null,
        businessName: data.businessName,
        country: data.country as any,
        regionCode: data.regionCode.toUpperCase(),
        city: data.city ?? null,
        isActive: true,
        isApproved: false,
        createdByAdmin: true,
        createdAt: now,
      } as any)
      .onConflictDoUpdate({
        target: contractorAccounts.userId,
        set: {
          businessName: data.businessName,
          country: data.country as any,
          regionCode: data.regionCode.toUpperCase(),
          city: data.city ?? null,
          isActive: true,
          createdByAdmin: true,
        } as any,
      });

    return ok({ userId, role: "CONTRACTOR", created: true }, 201);
  } catch (error) {
    console.error("[ADMIN_V4_CONTRACTOR_CREATE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_CONTRACTOR_CREATE_FAILED", "Failed to create contractor");
  }
}
