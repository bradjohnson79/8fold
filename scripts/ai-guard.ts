import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const sourceRoots = ["apps", "packages", "scripts"];
const skipDirs = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);

const forbiddenPhrases = ["baseline appraisal", "AI unavailable", "default estimate", "fallback"];
const forbiddenEnvIds = ["OPENAI_API_KEY", "GPT_API_KEY"];

const pricingGuardFiles = [
  "apps/web/src/app/app/job-poster/(app)/post-a-job/page.tsx",
  "apps/api/src/pricing/jobPricingAppraisal.ts",
  "apps/api/src/pricing/aiAppraisal.ts",
  "apps/api/app/api/web/job-poster/drafts/[id]/start-appraisal/route.ts",
  "apps/api/app/api/web/job-poster/jobs/create-draft/route.ts",
];

function collectFiles(rootAbs: string, out: string[]) {
  const entries = fs.readdirSync(rootAbs, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(rootAbs, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      collectFiles(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx|js|mjs|cjs|json)$/i.test(entry.name)) continue;
    out.push(abs);
  }
}

function main() {
  const failures: string[] = [];

  for (const rel of pricingGuardFiles) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, "utf8");
    for (const phrase of forbiddenPhrases) {
      if (text.toLowerCase().includes(phrase.toLowerCase())) {
        failures.push(`[forbidden-phrase] "${phrase}" found in ${rel}`);
      }
    }
  }

  const allFiles: string[] = [];
  for (const root of sourceRoots) {
    const abs = path.join(repoRoot, root);
    if (!fs.existsSync(abs)) continue;
    collectFiles(abs, allFiles);
  }

  for (const abs of allFiles) {
    const rel = path.relative(repoRoot, abs);
    if (rel === "scripts/ai-guard.ts") continue;
    const text = fs.readFileSync(abs, "utf8");
    for (const key of forbiddenEnvIds) {
      if (text.includes(key)) {
        failures.push(`[forbidden-env-id] "${key}" found in ${rel}`);
      }
    }
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error("AI guard failed:\n" + failures.join("\n"));
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("AI guard passed");
}

main();
