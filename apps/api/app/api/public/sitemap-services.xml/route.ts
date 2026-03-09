import { NextResponse } from "next/server";
import { getOrGenerateSitemap } from "@/src/services/v4/seo/sitemapService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const xml = await getOrGenerateSitemap("services");
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e) {
    console.error("[public/sitemap-services.xml]", e);
    return new NextResponse("Failed to generate services sitemap", { status: 500 });
  }
}
