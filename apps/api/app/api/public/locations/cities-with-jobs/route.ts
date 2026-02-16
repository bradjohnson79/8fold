import { NextResponse } from "next/server";
import { z } from "zod";
import { toHttpError } from "../../../../../src/http/errors";
import { listCitiesByRegion } from "../../../../../src/server/repos/jobPublicRepo.drizzle";

const QuerySchema = z.object({
  country: z.enum(["US", "CA"]),
  regionCode: z.string().trim().min(2).max(2)
});

function titleCaseCity(slugOrCity: string): string {
  const cleaned = slugOrCity.trim().replace(/[-_]+/g, " ");
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      country: url.searchParams.get("country"),
      regionCode: url.searchParams.get("regionCode")
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const { country, regionCode } = parsed.data;
    const out = await listCitiesByRegion(country, regionCode);
    return NextResponse.json(out);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

