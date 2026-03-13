import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { launchOptIns } from "@/db/schema/launchOptIn";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

const SortBySchema = z.enum(["date", "city", "status"]);
const OrderSchema = z.enum(["asc", "desc"]);

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  const sortBy = SortBySchema.catch("date").parse(searchParams.get("sortBy") ?? "date");
  const order = OrderSchema.catch("desc").parse(searchParams.get("order") ?? "desc");

  const allRows = await db.select().from(launchOptIns);

  const sorted = [...allRows].sort((a, b) => {
    if (sortBy === "date") {
      const cmp = a.createdAt.getTime() - b.createdAt.getTime();
      return order === "desc" ? -cmp : cmp;
    }
    const aVal = String(a[sortBy] ?? "");
    const bVal = String(b[sortBy] ?? "");
    const cmp = aVal.localeCompare(bVal);
    return order === "desc" ? -cmp : cmp;
  });

  if (format === "csv") {
    const header = "First Name,Email,City,State,Status,Date";
    const rows = sorted.map((r) =>
      [
        `"${(r.firstName ?? "").replace(/"/g, '""')}"`,
        `"${(r.email ?? "").replace(/"/g, '""')}"`,
        `"${(r.city ?? "").replace(/"/g, '""')}"`,
        `"${(r.state ?? "").replace(/"/g, '""')}"`,
        `"${(r.status ?? "").replace(/"/g, '""')}"`,
        r.createdAt.toISOString(),
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="launch-opt-ins.csv"',
      },
    });
  }

  return ok({ optIns: sorted, total: sorted.length });
}
