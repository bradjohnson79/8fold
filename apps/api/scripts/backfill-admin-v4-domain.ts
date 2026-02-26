import { runAdminV4DomainSync } from "./admin-v4-domain-sync-lib";

async function main() {
  const result = await runAdminV4DomainSync({ full: true });
  console.log("[admin:v4:backfill] since:", result.since.toISOString());
  console.log("[admin:v4:backfill] completedAt:", result.completedAt.toISOString());
  console.log("[admin:v4:backfill] counts:", result.counts);
}

main().catch((e) => {
  console.error("[admin:v4:backfill] failed", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
