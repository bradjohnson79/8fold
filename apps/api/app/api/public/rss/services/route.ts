import { NextResponse } from "next/server";
import { getCanonicalBase } from "@/src/services/v4/seo/canonicalUrlService";
import { getSeoSettings } from "@/src/services/v4/seo/seoSettingsService";

export const dynamic = "force-dynamic";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const SERVICES = [
  { slug: "plumbing", label: "Plumbing" },
  { slug: "electrical", label: "Electrical" },
  { slug: "hvac", label: "HVAC" },
  { slug: "appliance-repair", label: "Appliance Repair" },
  { slug: "handyman", label: "Handyman" },
  { slug: "painting", label: "Painting" },
  { slug: "carpentry", label: "Carpentry" },
  { slug: "drywall", label: "Drywall" },
  { slug: "roofing", label: "Roofing" },
  { slug: "cleaning", label: "Janitorial & Cleaning" },
  { slug: "landscaping", label: "Landscaping" },
  { slug: "fencing", label: "Fencing" },
  { slug: "snow-removal", label: "Snow Removal" },
  { slug: "junk-removal", label: "Junk Removal" },
  { slug: "moving", label: "Moving" },
  { slug: "furniture-assembly", label: "Furniture Assembly" },
];

export async function GET() {
  try {
    const [base, settings] = await Promise.all([getCanonicalBase(), getSeoSettings()]);

    const siteTitle = settings?.siteTitle ?? "8Fold";
    const now = new Date().toUTCString();

    const items = SERVICES.map((s) => {
      const link = `${base}/services/${s.slug}`;
      return [
        "    <item>",
        `      <title>${escapeXml(s.label)} Services | ${escapeXml(siteTitle)}</title>`,
        `      <link>${link}</link>`,
        `      <guid isPermaLink="true">${link}</guid>`,
        `      <description>Hire local ${escapeXml(s.label.toLowerCase())} contractors through ${escapeXml(siteTitle)}.</description>`,
        `      <pubDate>${now}</pubDate>`,
        "    </item>",
      ].join("\n");
    }).join("\n");

    const rss = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      "  <channel>",
      `    <title>${escapeXml(siteTitle)} — Services Feed</title>`,
      `    <link>${base}/services</link>`,
      `    <description>Home services available on ${escapeXml(siteTitle)}</description>`,
      `    <lastBuildDate>${now}</lastBuildDate>`,
      `    <atom:link href="${base}/api/public/rss/services" rel="self" type="application/rss+xml"/>`,
      items,
      "  </channel>",
      "</rss>",
    ].join("\n");

    return new NextResponse(rss, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e) {
    console.error("[public/rss/services]", e);
    return new NextResponse("Failed to generate services RSS feed", { status: 500 });
  }
}
