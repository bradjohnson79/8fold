import { mapUsersRowsToAdminUserDTO, requireAdmin, usersRepo } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

function parseBoolish(v: string | null): boolean {
  const n = String(v ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(n);
}

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);

    const roleRaw = String(searchParams.get("role") ?? "").trim().toUpperCase();
    const role = roleRaw && roleRaw !== "ALL" ? (roleRaw as any) : undefined;
    const q = String(searchParams.get("q") ?? searchParams.get("query") ?? "").trim();
    const country = String(searchParams.get("country") ?? "").trim() || undefined;
    const region = String(searchParams.get("region") ?? searchParams.get("state") ?? searchParams.get("province") ?? "").trim() || undefined;
    const city = String(searchParams.get("city") ?? "").trim() || undefined;
    const statusRaw = String(searchParams.get("status") ?? "").trim().toUpperCase();
    const status = statusRaw && statusRaw !== "ALL" ? statusRaw : undefined;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "100") || 100));
    const rangeRaw = String(searchParams.get("range") ?? "ALL").trim().toUpperCase();

    const data = await usersRepo.listUsers({
      role,
      q,
      status,
      country,
      region,
      city,
      page,
      pageSize,
      includeSuspended: parseBoolish(searchParams.get("includeSuspended")),
      includeArchived: parseBoolish(searchParams.get("includeArchived")),
      range: ["ALL", "1D", "7D", "30D", "90D"].includes(rangeRaw) ? (rangeRaw as any) : "ALL",
    });

    const rows = mapUsersRowsToAdminUserDTO(data.rows as any[]);
    const users = rows.map((r) => ({
      id: r.id,
      name: r.name,
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      email: r.email,
      role: r.role,
      country: r.country,
      state: r.regionCode,
      city: r.city,
      createdAt: r.createdAt,
      status: r.status,
      suspendedUntil: r.suspendedUntil,
      archivedAt: r.archivedAt,
    }));

    return ok({
      rows,
      totalCount: data.totalCount,
      page: data.page,
      pageSize: data.pageSize,
      users,
      nextCursor: null,
    });
  } catch (error) {
    console.error("[ADMIN_V4_USERS_LIST_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_USERS_LIST_FAILED", "Failed to load users");
  }
}
