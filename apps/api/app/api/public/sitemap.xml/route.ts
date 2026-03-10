import { NextResponse } from "next/server";
import { getOrGenerateSitemap } from "@/src/services/v4/seo/sitemapService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const xml = await getOrGenerateSitemap("index");
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (e) {
    console.error("[public/sitemap.xml]", e);
    return new NextResponse("Failed to generate sitemap", { status: 500 });
  }
}
