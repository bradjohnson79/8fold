import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminUsers } from "../../../../db/schema/adminUser";
import { contractorAccounts, jobPosters, routers, users } from "../../../../db/schema";

const QuerySchema = z.object({
  role: z.enum(["JOB_POSTER", "ROUTER", "CONTRACTOR", "ADMIN"]).optional(),
  range: z.enum(["ALL", "1D", "7D", "30D", "90D"]).optional(),
  query: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED", "PENDING"]).optional(),
  includeSuspended: z.enum(["1", "true"]).optional(),
  includeArchived: z.enum(["1", "true"]).optional(),
  country: z.enum(["US", "CA"]).optional(),
  region: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      role: url.searchParams.get("role") ?? undefined,
      range: url.searchParams.get("range") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      includeSuspended: url.searchParams.get("includeSuspended") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
      country: url.searchParams.get("country") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
    }

    const { role, range, query, status, includeSuspended, includeArchived, country, region, city, search, cursor } = parsed.data;
    const searchTerm = (query ?? search ?? "").trim();

    const take = 100;

    // Admin tab: admins live in AdminUser, not User
    if (role === "ADMIN") {
      const adminRows = await db
        .select({
          id: adminUsers.id,
          email: adminUsers.email,
          fullName: adminUsers.fullName,
          country: adminUsers.country,
          state: adminUsers.state,
          city: adminUsers.city,
          createdAt: adminUsers.createdAt,
        })
        .from(adminUsers)
        .orderBy(desc(adminUsers.createdAt))
        .limit(take + 1);

      let filtered = adminRows;
      if (searchTerm) {
        const pat = searchTerm.toLowerCase();
        filtered = adminRows.filter(
          (r) =>
            (r.email ?? "").toLowerCase().includes(pat) ||
            (r.fullName ?? "").toLowerCase().includes(pat) ||
            (r.country ?? "").toLowerCase().includes(pat) ||
            (r.state ?? "").toLowerCase().includes(pat) ||
            (r.city ?? "").toLowerCase().includes(pat)
        );
      }
      if (range && range !== "ALL") {
        const days = range === "1D" ? 1 : range === "7D" ? 7 : range === "30D" ? 30 : range === "90D" ? 90 : null;
        if (days) {
          const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          filtered = filtered.filter((r) => r.createdAt && new Date(r.createdAt) >= since);
        }
      }

      const page = filtered.slice(0, take);
      const usersOut = page.map((r) => ({
        id: r.id,
        name: r.fullName ?? (r.email ? r.email.split("@")[0] : null),
        email: r.email ?? null,
        role: "ADMIN",
        status: "ACTIVE",
        country: r.country ?? null,
        state: r.state ?? null,
        city: r.city ?? null,
        createdAt: (r.createdAt as any)?.toISOString?.() ?? String(r.createdAt),
        updatedAt: (r.createdAt as any)?.toISOString?.() ?? String(r.createdAt),
      }));
      return NextResponse.json({ ok: true, data: { users: usersOut, nextCursor: null } });
    }

    const cursorId = cursor ?? null;
    const cursorRow = cursorId
      ? (
          await db
            .select({ createdAt: users.createdAt, id: users.id })
            .from(users)
            .where(eq(users.id, cursorId))
            .limit(1)
        )[0] ?? null
      : null;

    const cursorWhere = cursorRow
      ? or(lt(users.createdAt, cursorRow.createdAt), and(eq(users.createdAt, cursorRow.createdAt), lt(users.id, cursorRow.id)))
      : undefined;

    const baseWhereParts: any[] = [];

    if (role) baseWhereParts.push(eq(users.role, role as any));
    if (status) {
      baseWhereParts.push(eq(users.status, status as any));
    } else {
      // Default: ACTIVE only; optionally include SUSPENDED and/or ARCHIVED
      const statuses: ("ACTIVE" | "SUSPENDED" | "ARCHIVED")[] = ["ACTIVE"];
      if (includeSuspended) statuses.push("SUSPENDED");
      if (includeArchived) statuses.push("ARCHIVED");
      baseWhereParts.push(or(...statuses.map((s) => eq(users.status, s))) as any);
    }
    if (country) baseWhereParts.push(eq(users.country, country as any));

    if (range && range !== "ALL") {
      const days =
        range === "1D"
          ? 1
          : range === "7D"
            ? 7
            : range === "30D"
              ? 30
              : range === "90D"
                ? 90
                : null;
      if (days) {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        baseWhereParts.push(gte(users.createdAt, since));
      }
    }

    if (searchTerm) {
      const pat = `%${searchTerm}%`;
      baseWhereParts.push(
        or(
          ilike(users.email, pat),
          ilike(users.name, pat),
          ilike(users.phone, pat),
          ilike(users.country, pat),
          ilike(routers.homeRegionCode, pat),
          ilike(routers.homeCity, pat),
          ilike(contractorAccounts.regionCode, pat),
          ilike(contractorAccounts.city, pat),
          ilike(jobPosters.defaultRegion, pat),
        ) as any,
      );
    }

    if (region) {
      const r = region.toUpperCase();
      if (role === "ROUTER") {
        baseWhereParts.push(eq(routers.homeRegionCode, r) as any);
      } else if (role === "JOB_POSTER") {
        baseWhereParts.push(ilike(jobPosters.defaultRegion, `%${region}%`) as any);
      } else if (role === "CONTRACTOR") {
        baseWhereParts.push(eq(contractorAccounts.regionCode, r) as any);
      } else if (!role) {
        baseWhereParts.push(
          or(
            eq(routers.homeRegionCode, r),
            eq(contractorAccounts.regionCode, r),
            ilike(jobPosters.defaultRegion, `%${region}%`),
          ) as any,
        );
      }
    }

    if (city) {
      const pat = `%${city}%`;
      if (role === "ROUTER") {
        baseWhereParts.push(ilike(routers.homeCity, pat) as any);
      } else if (role === "CONTRACTOR") {
        baseWhereParts.push(ilike(contractorAccounts.city, pat) as any);
      } else if (!role || role === "JOB_POSTER") {
        // Job posters do not currently have a city column in job_posters; treat as cross-role city filter.
        baseWhereParts.push(or(ilike(routers.homeCity, pat), ilike(contractorAccounts.city, pat)) as any);
      }
    }

    const where = baseWhereParts.length > 0
      ? and(...baseWhereParts, ...(cursorWhere ? [cursorWhere] : []))
      : cursorWhere ?? undefined;

    const rows = await db
      .select({
        user: {
          id: users.id,
          authUserId: users.authUserId,
          email: users.email,
          phone: users.phone,
          name: users.name,
          role: users.role,
          status: users.status,
          suspendedUntil: users.suspendedUntil,
          suspensionReason: users.suspensionReason,
          archivedAt: users.archivedAt,
          archivedReason: users.archivedReason,
          country: users.country,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
        jobPoster: {
          userId: jobPosters.userId,
          defaultRegion: jobPosters.defaultRegion,
          totalJobsPosted: jobPosters.totalJobsPosted,
          lastJobPostedAt: jobPosters.lastJobPostedAt,
          createdAt: jobPosters.createdAt,
          createdByAdmin: jobPosters.createdByAdmin,
          isActive: jobPosters.isActive,
          isMock: jobPosters.isMock,
          isTest: jobPosters.isTest,
        },
        router: {
          userId: routers.userId,
          homeCountry: routers.homeCountry,
          homeRegionCode: routers.homeRegionCode,
          homeCity: routers.homeCity,
          isSeniorRouter: routers.isSeniorRouter,
          dailyRouteLimit: routers.dailyRouteLimit,
          routesCompleted: routers.routesCompleted,
          routesFailed: routers.routesFailed,
          rating: routers.rating,
          status: routers.status,
          createdAt: routers.createdAt,
        },
        contractorAccount: {
          userId: contractorAccounts.userId,
          firstName: contractorAccounts.firstName,
          lastName: contractorAccounts.lastName,
          businessName: contractorAccounts.businessName,
          tradeCategory: contractorAccounts.tradeCategory,
          serviceRadiusKm: contractorAccounts.serviceRadiusKm,
          country: contractorAccounts.country,
          regionCode: contractorAccounts.regionCode,
          city: contractorAccounts.city,
          isApproved: contractorAccounts.isApproved,
          jobsCompleted: contractorAccounts.jobsCompleted,
          rating: contractorAccounts.rating,
          createdAt: contractorAccounts.createdAt,
        },
      })
      .from(users)
      .leftJoin(jobPosters, eq(jobPosters.userId, users.id))
      .leftJoin(routers, eq(routers.userId, users.id))
      .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
      .where(where as any)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(take + 1);

    const page = rows.slice(0, take);
    const nextCursor = rows.length > take ? rows[take]?.user?.id ?? null : null;

    const usersOut = page
      .map((r: any) => {
        const u = r.user;
        const state = r.router?.homeRegionCode ?? r.contractorAccount?.regionCode ?? null;
        const city = r.router?.homeCity ?? r.contractorAccount?.city ?? null;
        const email = u.email ?? null;
        const contractorFirstName = r.contractorAccount?.firstName ? String(r.contractorAccount.firstName) : null;
        const contractorLastName = r.contractorAccount?.lastName ? String(r.contractorAccount.lastName) : null;
        const contractorFullName =
          contractorFirstName && contractorLastName ? `${contractorFirstName} ${contractorLastName}` : null;
        const name = u.role === "CONTRACTOR" ? contractorFullName ?? u.name : u.name;
        const outCountry = u.role === "CONTRACTOR" ? (r.contractorAccount?.country ?? u.country) : u.country;
        return {
          id: u.id,
          name,
          firstName: contractorFirstName,
          lastName: contractorLastName,
          email,
          role: u.role,
          status: u.status,
          suspendedUntil: (u.suspendedUntil as any)?.toISOString?.() ?? null,
          suspensionReason: u.suspensionReason ?? null,
          archivedAt: (u.archivedAt as any)?.toISOString?.() ?? null,
          archivedReason: u.archivedReason ?? null,
          country: outCountry ?? null,
          state,
          city,
        createdAt: (u.createdAt as any)?.toISOString?.() ?? String(u.createdAt),
        updatedAt: (u.updatedAt as any)?.toISOString?.() ?? String(u.updatedAt),
        jobPoster: r.jobPoster?.userId ? { ...r.jobPoster, lastJobPostedAt: (r.jobPoster.lastJobPostedAt as any)?.toISOString?.() ?? null, createdAt: (r.jobPoster.createdAt as any)?.toISOString?.() ?? String(r.jobPoster.createdAt) } : null,
        router: r.router?.userId ? { ...r.router, createdAt: (r.router.createdAt as any)?.toISOString?.() ?? String(r.router.createdAt) } : null,
        contractorAccount: r.contractorAccount?.userId
          ? { ...r.contractorAccount, createdAt: (r.contractorAccount.createdAt as any)?.toISOString?.() ?? String(r.contractorAccount.createdAt) }
          : null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, data: { users: usersOut, nextCursor } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users", { route: "/api/admin/users", userId: auth.userId });
  }
}

