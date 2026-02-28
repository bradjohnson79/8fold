import { runAdminV4DomainSync } from "./admin-v4-domain-sync-lib";

async function main() {
  const result = await runAdminV4DomainSync({ full: false });
  console.log("[admin:v4:sync] since:", result.since.toISOString());
  console.log("[admin:v4:sync] completedAt:", result.completedAt.toISOString());
  console.log("[admin:v4:sync] counts:", result.counts);
}

main().catch((e) => {
  console.error("[admin:v4:sync] failed", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
