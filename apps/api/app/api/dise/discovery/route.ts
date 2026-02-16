import { NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { directories } from "@/db/schema/directoryEngine";

type DiscoveryInput = {
  region?: string;
  country?: string;
  category?: string;
};

// Stub: returns mock data when GPT_API_KEY is missing
// Classification: province/state in name or region → REGIONAL; country-wide → NATIONAL
const MOCK_DISCOVERY = [
  {
    name: "Example Directory (Mock)",
    homepageUrl: "https://example.com",
    submissionUrl: "https://example.com/submit",
    contactEmail: "submit@example.com",
    free: true,
    category: "GENERAL",
    authorityScore: 50,
    scope: "REGIONAL" as const,
  },
  {
    name: "National Trade Directory (Mock)",
    homepageUrl: "https://national.example.com",
    submissionUrl: "https://national.example.com/submit",
    contactEmail: "submit@national.example.com",
    free: true,
    category: "TRADE",
    authorityScore: 70,
    scope: "NATIONAL" as const,
  },
];

function classifyScope(region?: string | null, country?: string | null): "REGIONAL" | "NATIONAL" {
  if (region) return "REGIONAL";
  if (country && !region) return "NATIONAL";
  return "REGIONAL";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as DiscoveryInput;
    const { region, country, category } = body;

    const hasKey = !!process.env.GPT_API_KEY;
    const results = hasKey
      ? MOCK_DISCOVERY // TODO: call GPT when integrated
      : MOCK_DISCOVERY;

    const inserted = await db
      .insert(directories)
      .values(
        results.map((r) => {
          const scope = r.scope ?? classifyScope(region ?? null, country ?? null);
          return {
            name: r.name,
            homepageUrl: r.homepageUrl ?? null,
            submissionUrl: r.submissionUrl ?? null,
            contactEmail: r.contactEmail ?? null,
            region: region ?? null,
            country: country ?? null,
            category: r.category ?? category ?? null,
            scope,
            free: r.free ?? null,
            requiresApproval: null,
            authorityScore: r.authorityScore ?? null,
            status: "NEW",
          };
        })
      )
      .returning();

    return NextResponse.json({
      ok: true,
      data: { count: inserted.length, directories: inserted },
    });
  } catch (err) {
    console.error("DISE discovery error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
