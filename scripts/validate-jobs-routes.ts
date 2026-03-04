/**
 * Build-time validation: prevent Option B–style route collisions.
 *
 * Only these job routes are allowed:
 *   /jobs
 *   /jobs/[country]/[regionCode]
 *   /jobs/[country]/[regionCode]/[city]
 *
 * Forbidden: [region], [region]/[city], [state], [province], [slug], [location]
 * These cause ambiguous matches (e.g. /jobs/ca/bc) and can hang the site.
 */
import fs from "fs";
import path from "path";

const jobsDir = path.join(process.cwd(), "apps/web/src/app/jobs");
const ALLOWED_TOP_LEVEL = new Set(["page.tsx", "JobsClient.tsx", "[country]"]);
const FORBIDDEN_TOP_LEVEL = new Set([
  "[region]",
  "[state]",
  "[province]",
  "[slug]",
  "[location]",
  "[city]",
]);

function scan(dir: string) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);

  for (const item of items) {
    if (FORBIDDEN_TOP_LEVEL.has(item)) {
      console.error(
        `\n❌ Invalid jobs route detected: apps/web/src/app/jobs/${item}\n` +
          `   Only /jobs/[country]/[regionCode]/[city] is allowed.\n` +
          `   See docs/ROUTING_ARCHITECTURE.md\n`
      );
      process.exit(1);
    }
    if (item.startsWith("[") && !ALLOWED_TOP_LEVEL.has(item)) {
      console.error(
        `\n❌ Invalid jobs route detected: apps/web/src/app/jobs/${item}\n` +
          `   Only [country] is allowed at this level.\n` +
          `   See docs/ROUTING_ARCHITECTURE.md\n`
      );
      process.exit(1);
    }
  }
}

scan(jobsDir);
console.log("✓ Jobs routing structure valid.");
