import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { requireRouter } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { db } from "../../../../../db/drizzle";
import { routers } from "../../../../../db/schema/router";
import { routerProfiles } from "../../../../../db/schema/routerProfile";
import { users } from "../../../../../db/schema/user";
import { incCounter } from "../../../../../src/server/observability/metrics";
import { logEvent } from "../../../../../src/server/observability/log";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().min(7).max(32).optional(),
  addressPrivate: z.string().trim().min(1).max(240).optional(),
  notifyViaEmail: z.boolean().optional(),
  notifyViaSms: z.boolean().optional(),
  termsAccepted: z.boolean().optional(),
  // Router home region (explicit; no inference/fallback).
  country: z.enum(["CA", "US"]).optional(),
  regionCode: z.string().trim().min(2).max(10).optional(),
}).refine(
  (v) => !v.country === !v.regionCode,
  { message: "country and regionCode must be provided together" },
);

export async function GET(req: Request) {
  try {
    const router = await requireRouter(req);

    const [userRows, routerRows, profileRows] = await Promise.all([
      db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, router.userId)).limit(1),
      db
        .select({
          homeCountry: routers.homeCountry,
          homeRegionCode: routers.homeRegionCode,
          isSeniorRouter: routers.isSeniorRouter,
          dailyRouteLimit: routers.dailyRouteLimit,
          routesCompleted: routers.routesCompleted,
          termsAccepted: routers.termsAccepted,
          profileComplete: routers.profileComplete,
          status: routers.status,
        })
        .from(routers)
        .where(eq(routers.userId, router.userId))
        .limit(1),
      db
        .select({
          name: routerProfiles.name,
          phone: routerProfiles.phone,
          notifyViaEmail: routerProfiles.notifyViaEmail,
          notifyViaSms: routerProfiles.notifyViaSms,
          state: routerProfiles.state,
          addressPrivate: routerProfiles.addressPrivate,
          payoutMethod: routerProfiles.payoutMethod,
          payoutStatus: routerProfiles.payoutStatus,
          stripeAccountId: routerProfiles.stripeAccountId,
          paypalEmail: routerProfiles.paypalEmail,
        })
        .from(routerProfiles)
        .where(eq(routerProfiles.userId, router.userId))
        .limit(1),
    ]);

    const user = userRows[0] ?? null;
    const routerRow = routerRows[0] ?? null;
    const profile = profileRows[0] ?? null;

    if (!user || !routerRow || routerRow.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "Forbidden", code: "ROUTER_NOT_PROVISIONED" }, { status: 403 });
    }

    return NextResponse.json({
      router: {
        userId: router.userId,
        email: user.email,
        homeCountry: routerRow.homeCountry,
        homeRegionCode: routerRow.homeRegionCode,
        isSeniorRouter: routerRow.isSeniorRouter,
        dailyRouteLimit: routerRow.dailyRouteLimit,
        routesCompleted: routerRow.routesCompleted,
        termsAccepted: routerRow.termsAccepted,
        profileComplete: routerRow.profileComplete,
      },
      profile: {
        name: profile?.name ?? null,
        phone: profile?.phone ?? null,
        notifyViaEmail: profile?.notifyViaEmail ?? true,
        notifyViaSms: profile?.notifyViaSms ?? false,
        state: profile?.state ?? null,
        addressPrivate: (profile as any)?.addressPrivate ?? null,
        payoutMethod: (profile as any)?.payoutMethod ?? null,
        payoutStatus: (profile as any)?.payoutStatus ?? null,
        stripeAccountId: (profile as any)?.stripeAccountId ?? null,
        paypalEmail: (profile as any)?.paypalEmail ?? null,
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const router = await requireRouter(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = UpdateSchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { name, email, phone, addressPrivate, notifyViaEmail, notifyViaSms, termsAccepted, country, regionCode } = body.data;

    const updated = await db.transaction(async (tx) => {
      const now = new Date();

      if (email) {
        await tx.update(users).set({ email, updatedAt: now }).where(eq(users.id, router.userId));
      }

      const existingProfile = await tx
        .select({ userId: routerProfiles.userId })
        .from(routerProfiles)
        .where(eq(routerProfiles.userId, router.userId))
        .limit(1);

      if (existingProfile.length === 0) {
        await tx.insert(routerProfiles).values({
          id: randomUUID(),
          userId: router.userId,
          status: "ACTIVE",
          name: name ?? undefined,
          phone: phone ?? undefined,
          addressPrivate: addressPrivate ?? undefined,
          notifyViaEmail: notifyViaEmail ?? true,
          notifyViaSms: notifyViaSms ?? false,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        const set: Record<string, unknown> = { updatedAt: now };
        if (name != null) set.name = name;
        if (phone != null) set.phone = phone;
        if (addressPrivate != null) set.addressPrivate = addressPrivate;
        if (notifyViaEmail != null) set.notifyViaEmail = notifyViaEmail;
        if (notifyViaSms != null) set.notifyViaSms = notifyViaSms;
        await tx.update(routerProfiles).set(set).where(eq(routerProfiles.userId, router.userId));
      }

      // Update router gating flags (additive, deterministic).
      if (termsAccepted === true) {
        await tx.update(routers).set({ termsAccepted: true }).where(eq(routers.userId, router.userId));
      }

      // Explicitly persist router home region (no inference).
      if (country && regionCode) {
        await tx
          .update(routers)
          .set({ homeCountry: country as any, homeRegionCode: regionCode.trim().toUpperCase() } as any)
          .where(eq(routers.userId, router.userId));
      }

      const profileRowsForComplete = await tx
        .select({
          name: routerProfiles.name,
          phone: routerProfiles.phone,
          addressPrivate: routerProfiles.addressPrivate,
        })
        .from(routerProfiles)
        .where(eq(routerProfiles.userId, router.userId))
        .limit(1);
      const p = profileRowsForComplete[0] ?? null;
      const complete =
        Boolean(String(p?.name ?? "").trim()) &&
        Boolean(String((p as any)?.addressPrivate ?? "").trim());
      await tx.update(routers).set({ profileComplete: complete }).where(eq(routers.userId, router.userId));

      const [userRow, routerRow, profileRow] = await Promise.all([
        tx.select({ email: users.email }).from(users).where(eq(users.id, router.userId)).limit(1),
        tx
          .select({
            homeCountry: routers.homeCountry,
            homeRegionCode: routers.homeRegionCode,
            isSeniorRouter: routers.isSeniorRouter,
            dailyRouteLimit: routers.dailyRouteLimit,
            routesCompleted: routers.routesCompleted,
            termsAccepted: routers.termsAccepted,
            profileComplete: routers.profileComplete,
            status: routers.status,
          })
          .from(routers)
          .where(eq(routers.userId, router.userId))
          .limit(1),
        tx
          .select({
            name: routerProfiles.name,
            phone: routerProfiles.phone,
            notifyViaEmail: routerProfiles.notifyViaEmail,
            notifyViaSms: routerProfiles.notifyViaSms,
            state: routerProfiles.state,
          })
          .from(routerProfiles)
          .where(eq(routerProfiles.userId, router.userId))
          .limit(1),
      ]);

      return { user: userRow[0] ?? null, routerRow: routerRow[0] ?? null, profile: profileRow[0] ?? null };
    });

    if (!updated.user || !updated.routerRow || updated.routerRow.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "Forbidden", code: "ROUTER_NOT_PROVISIONED" }, { status: 403 });
    }

    // Metrics: router readiness (terms + profileComplete).
    if (Boolean((updated.routerRow as any).termsAccepted) && Boolean((updated.routerRow as any).profileComplete)) {
      incCounter("router_ready_total", { route: "/api/web/router/profile" });
      logEvent({
        level: "info",
        event: "router.ready",
        route: "/api/web/router/profile",
        method: "POST",
        status: 200,
        userId: router.userId,
        role: "ROUTER",
      });
    }

    return NextResponse.json({
      router: {
        userId: router.userId,
        email: updated.user.email,
        homeCountry: updated.routerRow.homeCountry,
        homeRegionCode: updated.routerRow.homeRegionCode,
        isSeniorRouter: updated.routerRow.isSeniorRouter,
        dailyRouteLimit: updated.routerRow.dailyRouteLimit,
        routesCompleted: updated.routerRow.routesCompleted,
        termsAccepted: (updated.routerRow as any).termsAccepted ?? false,
        profileComplete: (updated.routerRow as any).profileComplete ?? false,
      },
      profile: {
        name: updated.profile?.name ?? null,
        phone: updated.profile?.phone ?? null,
        notifyViaEmail: updated.profile?.notifyViaEmail ?? true,
        notifyViaSms: updated.profile?.notifyViaSms ?? false,
        state: updated.profile?.state ?? null
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

