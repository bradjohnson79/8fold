import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  countryContext,
  directories,
  regionalContext,
  submissions,
} from "@/db/schema/directoryEngine";

type GenerateInput = {
  directoryId: string;
  region?: string;
  country?: string;
  wordLimit?: number;
};

const BASE_URL = "https://8fold.app";

function resolveTargetUrl(
  dir: { scope: string; targetUrlOverride: string | null; region: string | null; country: string | null }
): string {
  if (dir.targetUrlOverride) return dir.targetUrlOverride;
  if (dir.scope === "NATIONAL") {
    return dir.country?.toUpperCase() === "US" ? `${BASE_URL}/us` : BASE_URL;
  }
  return dir.region ? `${BASE_URL}/${dir.region.toLowerCase().replace(/\s+/g, "-")}` : BASE_URL;
}

// REGIONAL: 120–180 words, region-aware, trade density, local framing
const MOCK_REGIONAL = [
  "8Fold connects homeowners in Alberta with vetted local contractors for repairs and installations. We serve the Greater Edmonton and Calgary areas with reliable, transparent pricing and quality assurance. Our platform focuses on handyman services, plumbing, electrical, and general home maintenance—addressing the high demand for skilled trades across the province.",
  "8Fold is a trusted platform linking Alberta homeowners to skilled tradespeople. Our focus is on handyman services, plumbing, electrical, and general home maintenance. We prioritize customer satisfaction and contractor accountability, with region-specific availability across Alberta's major markets.",
  "8Fold provides a streamlined way for Alberta residents to find and book qualified contractors. We serve the province's growing trade demand with reliable pricing, quality assurance, and local contractor networks.",
];

// NATIONAL: 120–180 words, country-level framing, broad trade categories, no province mention
const MOCK_NATIONAL = [
  "8Fold connects homeowners across Canada with vetted contractors for repairs and installations. We offer reliable, transparent pricing and quality assurance nationwide. Our platform covers handyman services, plumbing, electrical, HVAC, and general home maintenance—serving the broad trade landscape from coast to coast.",
  "8Fold is a trusted national platform linking homeowners to skilled tradespeople. We focus on handyman services, plumbing, electrical, and home maintenance across Canada. Our marketplace prioritizes customer satisfaction and contractor accountability with consistent standards nationwide.",
  "8Fold provides a streamlined way for Canadian homeowners to find and book qualified contractors. We serve the country's trade demand with reliable pricing, quality assurance, and a nationwide network of vetted professionals.",
];

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as GenerateInput;
    const { directoryId, region, country, wordLimit = 150 } = body;

    if (!directoryId) {
      return NextResponse.json(
        { ok: false, error: "directoryId required" },
        { status: 400 }
      );
    }

    const [dir] = await db.select().from(directories).where(eq(directories.id, directoryId));
    if (!dir) return NextResponse.json({ ok: false, error: "Directory not found" }, { status: 404 });

    const scope = (dir.scope ?? "REGIONAL") as "REGIONAL" | "NATIONAL";

    if (scope === "REGIONAL" && !region) {
      return NextResponse.json(
        { ok: false, error: "region required for REGIONAL scope" },
        { status: 400 }
      );
    }

    const targetUrl = resolveTargetUrl({
      scope: dir.scope ?? "REGIONAL",
      targetUrlOverride: dir.targetUrlOverride,
      region: scope === "REGIONAL" ? region ?? dir.region : null,
      country: dir.country ?? country ?? null,
    });

    let variants: string[];
    if (scope === "NATIONAL") {
      const [countryCtx] = country
        ? await db.select().from(countryContext).where(eq(countryContext.country, country))
        : dir.country
          ? await db.select().from(countryContext).where(eq(countryContext.country, dir.country))
          : [null];
      variants = MOCK_NATIONAL; // TODO: call GPT with countryCtx when integrated
    } else {
      const [regionalCtx] = await db
        .select()
        .from(regionalContext)
        .where(eq(regionalContext.region, region!));
      variants = MOCK_REGIONAL; // TODO: call GPT with regionalCtx when integrated
    }

    const [row] = await db
      .insert(submissions)
      .values({
        directoryId,
        region: scope === "REGIONAL" ? region : null,
        generatedVariants: variants,
        status: "DRAFT",
      })
      .returning();

    return NextResponse.json({
      ok: true,
      data: { ...row, scope, targetUrl },
    });
  } catch (err) {
    console.error("DISE submissions generate error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
