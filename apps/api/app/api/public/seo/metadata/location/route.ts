/**
 * Public API for location page SEO metadata.
 * Used by web app generateMetadata.
 */
import { NextResponse } from "next/server";
import { generateLocationMetadata } from "@/src/services/v4/seo/metadataService";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") ?? "US";
    const region = url.searchParams.get("region") ?? "";
    const city = url.searchParams.get("city") ?? "";
    const service = url.searchParams.get("service") ?? null;

    if (!city || !region) {
      return NextResponse.json({ error: "city and region required" }, { status: 400 });
    }

    const metadata = await generateLocationMetadata({
      country,
      region,
      city,
      service,
    });
    return NextResponse.json({ data: metadata });
  } catch (e) {
    console.error("[seo/metadata/location GET]", e);
    return NextResponse.json({ error: "Failed to generate metadata" }, { status: 500 });
  }
}
