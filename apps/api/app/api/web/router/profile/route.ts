import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { requireRouter } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { ensureRouterProvisioned } from "../../../../../src/auth/routerProvisioning";
import { db } from "../../../../../db/drizzle";
import { routers } from "../../../../../db/schema/router";
import { routerProfiles } from "../../../../../db/schema/routerProfile";
import { users } from "../../../../../db/schema/user";

const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  stateProvince: z.string().trim().min(2).max(20),
  postalCode: z.string().trim().min(3).max(24),
  country: z.enum(["CA", "US"]),
  // Human-readable label from OpenStreetMap / Nominatim selection.
  mapDisplayName: z.string().trim().min(1).max(400),
  lat: z.number(),
  lng: z.number(),
});

function isValidGeo(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

export async function GET(req: Request) {
  try {
    const router = await requireRouter(req);
    await ensureRouterProvisioned(router.userId);

    const [userRows, routerRows, profileRows] = await Promise.all([
      db.select({ email: users.email, formattedAddress: users.formattedAddress }).from(users).where(eq(users.id, router.userId)).limit(1),
      db
        .select({
          termsAccepted: routers.termsAccepted,
          homeCountry: routers.homeCountry,
          homeRegionCode: routers.homeRegionCode,
        })
        .from(routers)
        .where(eq(routers.userId, router.userId))
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
        .where(eq(routerProfiles.userId, router.userId))
        .limit(1),
    ]);

    const u = userRows[0] ?? null;
    const r = routerRows[0] ?? null;
    const p = profileRows[0] ?? null;

    return NextResponse.json(
      {
        ok: true,
        data: {
          router: {
            userId: router.userId,
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
      },
      { status: 200 },
    );
  } catch (err) {
    const { status } = toHttpError(err);
    return NextResponse.json({ ok: false, error: "PROFILE_LOAD_FAILED" }, { status: status || 500 });
  }
}

export async function POST(req: Request) {
  try {
    const router = await requireRouter(req);
    const raw = await req.json().catch(() => null);
    const parsed = ProfileSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });

    const body = parsed.data;
    if (!isValidGeo(body.lat, body.lng)) {
      return NextResponse.json({ ok: false, error: "INVALID_GEO" }, { status: 400 });
    }

    try {
      await db.transaction(async (tx) => {
        const now = new Date();
        await ensureRouterProvisioned(router.userId, { tx });

        // Persist the geocoded display name + coords on the user record for UI confirmation and cross-role consistency.
        await tx
          .update(users)
          .set({
            formattedAddress: body.mapDisplayName,
            latitude: body.lat as any,
            longitude: body.lng as any,
            updatedAt: now,
          } as any)
          .where(eq(users.id, router.userId));

        // Router routing-region is canonical on routers table.
        await tx
          .update(routers)
          .set({ homeCountry: body.country as any, homeRegionCode: body.stateProvince.trim().toUpperCase() } as any)
          .where(eq(routers.userId, router.userId));

        // Idempotent upsert; do NOT overwrite status on update (admin-controlled activation).
        await tx
          .insert(routerProfiles)
          .values({
            id: randomUUID(),
            userId: router.userId,
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
    } catch {
      return NextResponse.json({ ok: false, error: "PROFILE_SAVE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status } = toHttpError(err);
    return NextResponse.json({ ok: false, error: "PROFILE_SAVE_FAILED" }, { status: status || 500 });
  }
}

