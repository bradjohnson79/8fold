import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db/drizzle";
import { routers } from "../../../db/schema/router";
import { routerProfiles } from "../../../db/schema/routerProfile";
import { users } from "../../../db/schema/user";
import { ensureRouterProvisioned } from "../../auth/routerProvisioning";
import { validateGeoCoords } from "../../jobs/geoValidation";

export const V4RouterProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  stateProvince: z.string().trim().min(2).max(20),
  postalCode: z.string().trim().min(3).max(24),
  country: z.enum(["CA", "US"]),
  mapDisplayName: z.string().trim().min(1).max(400),
  lat: z.number(),
  lng: z.number(),
});

export async function getV4RouterProfile(userId: string) {
  await ensureRouterProvisioned(userId);

  const [userRows, routerRows, profileRows] = await Promise.all([
    db.select({ email: users.email, formattedAddress: users.formattedAddress }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({
        termsAccepted: routers.termsAccepted,
        homeCountry: routers.homeCountry,
        homeRegionCode: routers.homeRegionCode,
      })
      .from(routers)
      .where(eq(routers.userId, userId))
      .limit(1),
    db
      .select({
        name: routerProfiles.name,
        address: (routerProfiles as any).address,
        city: (routerProfiles as any).city,
        stateProvince: (routerProfiles as any).stateProvince,
        postalCode: (routerProfiles as any).postalCode,
        country: (routerProfiles as any).country,
        lat: routerProfiles.lat,
        lng: routerProfiles.lng,
      })
      .from(routerProfiles)
      .where(eq(routerProfiles.userId, userId))
      .limit(1),
  ]);

  const u = userRows[0] ?? null;
  const r = routerRows[0] ?? null;
  const p = profileRows[0] ?? null;

  return {
    ok: true as const,
    data: {
      router: {
        userId,
        email: u?.email ?? null,
        formattedAddress: u?.formattedAddress ?? null,
        hasAcceptedTerms: Boolean(r?.termsAccepted),
        homeCountry: r?.homeCountry ?? null,
        homeRegionCode: r?.homeRegionCode ?? null,
      },
      profile: p
        ? {
            name: p.name ?? null,
            address: (p as any).address ?? null,
            city: (p as any).city ?? null,
            stateProvince: (p as any).stateProvince ?? null,
            postalCode: (p as any).postalCode ?? null,
            country: (p as any).country ?? null,
            lat: p.lat ?? null,
            lng: p.lng ?? null,
          }
        : null,
    },
  };
}

export async function saveV4RouterProfile(userId: string, body: z.infer<typeof V4RouterProfileSchema>) {
  validateGeoCoords(body.lat, body.lng);

  await db.transaction(async (tx) => {
    const now = new Date();
    await ensureRouterProvisioned(userId, { tx });

    await tx
      .update(users)
      .set({
        formattedAddress: body.mapDisplayName,
        latitude: body.lat as any,
        longitude: body.lng as any,
        updatedAt: now,
      } as any)
      .where(eq(users.id, userId));

    await tx
      .update(routers)
      .set({ homeCountry: body.country as any, homeRegionCode: body.stateProvince.trim().toUpperCase() } as any)
      .where(eq(routers.userId, userId));

    await tx
      .insert(routerProfiles)
      .values({
        id: randomUUID(),
        userId,
        name: body.name,
        address: body.address,
        city: body.city,
        stateProvince: body.stateProvince.trim().toUpperCase(),
        postalCode: body.postalCode,
        country: body.country,
        lat: body.lat,
        lng: body.lng,
        createdAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoUpdate({
        target: routerProfiles.userId,
        set: {
          name: body.name,
          address: body.address,
          city: body.city,
          stateProvince: body.stateProvince.trim().toUpperCase(),
          postalCode: body.postalCode,
          country: body.country,
          lat: body.lat,
          lng: body.lng,
          updatedAt: now,
        } as any,
      });
  });
}
