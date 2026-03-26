import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";

export type LgsSchemaCapabilities = {
  jobPosterProcessingStatus: boolean;
  extendedDiscoveryDomainCache: boolean;
};

let cachedCapabilities: LgsSchemaCapabilities | null = null;

export async function getLgsSchemaCapabilities(): Promise<LgsSchemaCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  try {
    const result = await db.execute(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'directory_engine'
        and (
          (table_name = 'job_poster_leads' and column_name = 'processing_status')
          or (
            table_name = 'discovery_domain_cache'
            and column_name in ('reachable', 'last_status_code', 'last_content_type', 'last_response_time_ms')
          )
        )
    `);

    const rows = (((result as unknown) as { rows?: Array<{ table_name: string; column_name: string }> }).rows ?? []) as Array<{
      table_name: string;
      column_name: string;
    }>;
    const columnSet = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));

    cachedCapabilities = {
      jobPosterProcessingStatus: columnSet.has("job_poster_leads.processing_status"),
      extendedDiscoveryDomainCache:
        columnSet.has("discovery_domain_cache.reachable") &&
        columnSet.has("discovery_domain_cache.last_status_code") &&
        columnSet.has("discovery_domain_cache.last_content_type") &&
        columnSet.has("discovery_domain_cache.last_response_time_ms"),
    };
  } catch (error) {
    console.warn("[LGS] Falling back to legacy schema capabilities", {
      error: error instanceof Error ? error.message : String(error),
    });
    cachedCapabilities = {
      jobPosterProcessingStatus: false,
      extendedDiscoveryDomainCache: false,
    };
  }

  return cachedCapabilities;
}

export function deriveLegacyJobPosterProcessingStatus(args: {
  email: string | null | undefined;
  needsEnrichment: boolean | null | undefined;
}): "new" | "enriching" | "processed" {
  if (args.needsEnrichment) return "enriching";
  if (args.email && args.email.trim()) return "processed";
  return "new";
}
