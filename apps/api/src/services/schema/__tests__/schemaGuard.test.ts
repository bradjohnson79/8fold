import { describe, expect, it, vi } from "vitest";
import { generateMigrationPatch, inspectSchema, validateSchema, type Queryable } from "../schemaGuard";

type MockColumn = {
  column_name: string;
  data_type?: string;
  is_nullable?: string;
};

function cols(names: string[], overrides: Record<string, Partial<MockColumn>> = {}): MockColumn[] {
  return names.map((column_name) => ({
    column_name,
    data_type: overrides[column_name]?.data_type ?? "text",
    is_nullable: overrides[column_name]?.is_nullable ?? "YES",
  }));
}

function makeQueryable(tableColumns: Record<string, MockColumn[]>): Queryable {
  return {
    query: vi.fn(async (_text: string, values?: unknown[]) => {
      const table = String(values?.[1] ?? "");
      return {
        rows: tableColumns[table] ?? [],
      };
    }),
  };
}

describe("schemaGuard", () => {
  it("reports missing contractor and job columns", async () => {
    const queryable = makeQueryable({
      contractor_leads: cols(["id", "lead_number", "email"], {
        id: { data_type: "uuid", is_nullable: "NO" },
        lead_number: { data_type: "integer", is_nullable: "NO" },
        email: { data_type: "text", is_nullable: "YES" },
      }),
      job_poster_leads: cols(["id", "website", "email"], {
        id: { data_type: "uuid", is_nullable: "NO" },
        website: { data_type: "text", is_nullable: "YES" },
        email: { data_type: "text", is_nullable: "YES" },
      }),
      lead_finder_domains: cols(["id", "campaign_id", "domain"], {
        id: { data_type: "uuid", is_nullable: "NO" },
        campaign_id: { data_type: "uuid", is_nullable: "NO" },
        domain: { data_type: "text", is_nullable: "YES" },
      }),
    });

    const report = await inspectSchema(queryable, "directory_engine");

    expect(report.status).toBe("error");
    expect(report.missingColumns).toContain("contractor_leads.needs_enrichment");
    expect(report.missingColumns).toContain("job_poster_leads.assignment_status");
    expect(report.missingColumns).toContain("lead_finder_domains.reply_rate");
  });

  it("generates safe ALTER statements for missing columns", async () => {
    const queryable = makeQueryable({
      contractor_leads: cols(["id", "lead_number", "lead_name"], {
        id: { data_type: "uuid", is_nullable: "NO" },
        lead_number: { data_type: "integer", is_nullable: "NO" },
        lead_name: { data_type: "text", is_nullable: "YES" },
      }),
      job_poster_leads: cols(["id", "campaign_id", "website"], {
        id: { data_type: "uuid", is_nullable: "NO" },
        campaign_id: { data_type: "uuid", is_nullable: "YES" },
        website: { data_type: "text", is_nullable: "YES" },
      }),
      lead_finder_domains: cols(["id", "campaign_id", "domain"], {
        id: { data_type: "uuid", is_nullable: "NO" },
        campaign_id: { data_type: "uuid", is_nullable: "NO" },
        domain: { data_type: "text", is_nullable: "YES" },
      }),
    });

    const report = await inspectSchema(queryable, "directory_engine");
    const patch = generateMigrationPatch(report);

    expect(patch).toContain("ALTER TABLE IF EXISTS directory_engine.contractor_leads");
    expect(patch).toContain("ADD COLUMN IF NOT EXISTS needs_enrichment boolean DEFAULT false NOT NULL");
    expect(patch).toContain("ALTER TABLE IF EXISTS directory_engine.job_poster_leads");
    expect(patch).toContain("ADD COLUMN IF NOT EXISTS assignment_status text DEFAULT 'pending' NOT NULL");
    expect(patch).toContain("ALTER TABLE IF EXISTS directory_engine.lead_finder_domains");
    expect(patch).toContain("ADD COLUMN IF NOT EXISTS reply_rate double precision DEFAULT 0 NOT NULL");
  });

  it("throws in fail-fast mode when schema drifts", async () => {
    const queryable = makeQueryable({
      contractor_leads: cols(["id"], {
        id: { data_type: "uuid", is_nullable: "NO" },
      }),
      job_poster_leads: cols(["id"], {
        id: { data_type: "uuid", is_nullable: "NO" },
      }),
      lead_finder_domains: cols(["id"], {
        id: { data_type: "uuid", is_nullable: "NO" },
      }),
    });

    await expect(
      validateSchema(queryable, {
        schema: "directory_engine",
        failOnMismatch: true,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      })
    ).rejects.toThrow("Schema mismatch detected");
  });

  it("reports nullability drift for import-critical columns", async () => {
    const queryable = makeQueryable({
      contractor_leads: cols(["id", "email"], {
        id: { data_type: "uuid", is_nullable: "NO" },
        email: { data_type: "text", is_nullable: "NO" },
      }),
      job_poster_leads: cols(["id"], {
        id: { data_type: "uuid", is_nullable: "NO" },
      }),
      lead_finder_domains: cols(["id", "campaign_id", "reply_rate"], {
        id: { data_type: "uuid", is_nullable: "NO" },
        campaign_id: { data_type: "uuid", is_nullable: "NO" },
        reply_rate: { data_type: "double precision", is_nullable: "NO" },
      }),
    });

    const report = await inspectSchema(queryable, "directory_engine");

    expect(report.status).toBe("error");
    expect(report.mismatchedColumns).toContain("contractor_leads.email");
    expect(report.tables[0]?.nullabilityMismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: "email", expected: "YES", actual: "NO" }),
      ])
    );
  });
});
