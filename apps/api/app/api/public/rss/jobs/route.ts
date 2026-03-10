import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { getCanonicalBase } from "@/src/services/v4/seo/canonicalUrlService";
import { getSeoSettings } from "@/src/services/v4/seo/seoSettingsService";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  try {
    const [base, settings, rows] = await Promise.all([
      getCanonicalBase(),
      getSeoSettings(),
      db
        .select({
          id: jobs.id,
          title: jobs.title,
          city: jobs.city,
          region_code: jobs.region_code,
          trade_category: jobs.trade_category,
          created_at: jobs.created_at,
        })
        .from(jobs)
        .where(sql`${jobs.archived} = false AND ${jobs.status} = 'OPEN_FOR_ROUTING'`)
        .orderBy(desc(jobs.created_at))
        .limit(50),
    ]);

    const siteTitle = settings?.siteTitle ?? "8Fold";
    const now = new Date().toUTCString();

    const items = rows
      .map((j) => {
        const title = escapeXml(j.title ?? "Job Listing");
        const link = `${base}/jobs/${j.id}`;
        const description = escapeXml(
          `${j.trade_category ?? "Handyman"} job${j.city ? ` in ${j.city}` : ""}. Apply through 8Fold.`,
        );
        const pubDate = j.created_at instanceof Date ? j.created_at.toUTCString() : now;

        return [
          "    <item>",
          `      <title>${title}</title>`,
          `      <link>${link}</link>`,
          `      <guid isPermaLink="true">${link}</guid>`,
          `      <description>${description}</description>`,
          `      <pubDate>${pubDate}</pubDate>`,
          "    </item>",
        ].join("\n");
      })
      .join("\n");

    const rss = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      "  <channel>",
      `    <title>${escapeXml(siteTitle)} — Jobs Feed</title>`,
      `    <link>${base}/jobs</link>`,
      `    <description>Latest job listings on ${escapeXml(siteTitle)}</description>`,
      `    <lastBuildDate>${now}</lastBuildDate>`,
      `    <atom:link href="${base}/api/public/rss/jobs" rel="self" type="application/rss+xml"/>`,
      items,
      "  </channel>",
      "</rss>",
    ].join("\n");

    return new NextResponse(rss, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=1800, s-maxage=1800",
      },
    });
  } catch (e) {
    console.error("[public/rss/jobs]", e);
    return new NextResponse("Failed to generate RSS feed", { status: 500 });
  }
}
