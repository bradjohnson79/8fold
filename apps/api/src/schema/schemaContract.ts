export type SchemaTableName = "contractor_leads" | "job_poster_leads" | "lead_finder_domains";

export type SchemaColumnSpec = {
  type: string;
  defaultSql?: string;
  nullable?: boolean;
};

const textCol = (opts: { defaultSql?: string; nullable?: boolean } = {}): SchemaColumnSpec => ({
  type: "text",
  nullable: opts.nullable ?? true,
  defaultSql: opts.defaultSql,
});

const boolCol = (defaultSql = "false", nullable = false): SchemaColumnSpec => ({
  type: "boolean",
  nullable,
  defaultSql,
});

const intCol = (defaultSql = "0", nullable = false): SchemaColumnSpec => ({
  type: "integer",
  nullable,
  defaultSql,
});

const tsCol = (nullable = true): SchemaColumnSpec => ({
  type: "timestamptz",
  nullable,
});

const uuidCol = (opts: { defaultSql?: string; nullable?: boolean } = {}): SchemaColumnSpec => ({
  type: "uuid",
  nullable: opts.nullable ?? true,
  defaultSql: opts.defaultSql,
});

const jsonbCol = (opts: { defaultSql?: string; nullable?: boolean } = {}): SchemaColumnSpec => ({
  type: "jsonb",
  nullable: opts.nullable ?? true,
  defaultSql: opts.defaultSql,
});

const floatCol = (defaultSql = "0", nullable = false): SchemaColumnSpec => ({
  type: "double precision",
  nullable,
  defaultSql,
});

export const schemaContractDefinitions = {
  contractor_leads: {
    id: uuidCol({ defaultSql: "gen_random_uuid()", nullable: false }),
    lead_number: intCol("0", true),
    lead_name: textCol(),
    first_name: textCol(),
    last_name: textCol(),
    title: textCol(),
    business_name: textCol(),
    address: textCol(),
    email: textCol(),
    email_type: textCol(),
    trade: textCol(),
    city: textCol(),
    state: textCol(),
    country: textCol(),
    source: textCol(),
    needs_enrichment: boolCol("false"),
    assignment_status: textCol({ defaultSql: "'pending'", nullable: false }),
    outreach_status: textCol({ defaultSql: "'pending'", nullable: false }),
    email_verification_status: textCol({ defaultSql: "'pending'", nullable: false }),
    verification_attempts: intCol("0"),
    email_verification_checked_at: tsCol(),
    email_verification_score: intCol("0", true),
    email_verification_provider: textCol(),
    contact_attempts: intCol("0"),
    response_received: boolCol("false"),
    signed_up: boolCol("false"),
    reply_count: intCol("0"),
    created_at: tsCol(false),
    verification_score: intCol("0", true),
    verification_status: textCol(),
    verification_source: textCol(),
    domain_reputation: textCol(),
    email_bounced: boolCol("false", true),
    website: textCol(),
    archived: boolCol("false"),
    archived_at: tsCol(),
    archive_reason: textCol(),
    processed_reply_ids: jsonbCol({ defaultSql: "'[]'::jsonb", nullable: false }),
    priority_score: intCol("0"),
    lead_score: intCol("0"),
    lead_priority: textCol({ defaultSql: "'medium'" }),
    priority_source: textCol({ defaultSql: "'auto'" }),
    outreach_stage: textCol({ defaultSql: "'not_contacted'" }),
    followup_count: intCol("0"),
    next_followup_at: tsCol(),
    last_contacted_at: tsCol(),
    last_replied_at: tsCol(),
    last_message_type_sent: textCol(),
    score_dirty: boolCol("true"),
  },
  job_poster_leads: {
    id: uuidCol({ defaultSql: "gen_random_uuid()", nullable: false }),
    campaign_id: uuidCol(),
    website: textCol({ nullable: false }),
    company_name: textCol(),
    contact_name: textCol(),
    first_name: textCol(),
    last_name: textCol(),
    title: textCol(),
    email: textCol(),
    phone: textCol(),
    category: textCol({ defaultSql: "'business'", nullable: false }),
    trade: textCol(),
    address: textCol(),
    city: textCol(),
    state: textCol(),
    country: textCol(),
    source: textCol(),
    needs_enrichment: boolCol("false"),
    assignment_status: textCol({ defaultSql: "'pending'", nullable: false }),
    outreach_status: textCol({ defaultSql: "'pending'", nullable: false }),
    status: textCol({ defaultSql: "'new'", nullable: false }),
    contact_attempts: intCol("0"),
    response_received: boolCol("false"),
    signed_up: boolCol("false"),
    reply_count: intCol("0"),
    lead_score: intCol("0"),
    email_bounced: boolCol("false", true),
    bounce_reason: textCol(),
    notes: textCol(),
    archived: boolCol("false"),
    archived_at: tsCol(),
    archive_reason: textCol(),
    processed_reply_ids: jsonbCol({ defaultSql: "'[]'::jsonb", nullable: false }),
    lead_priority: textCol({ defaultSql: "'medium'" }),
    priority_source: textCol({ defaultSql: "'auto'" }),
    score_dirty: boolCol("true"),
    outreach_stage: textCol({ defaultSql: "'not_contacted'" }),
    followup_count: intCol("0"),
    last_contacted_at: tsCol(),
    last_replied_at: tsCol(),
    next_followup_at: tsCol(),
    last_message_type_sent: textCol(),
    created_at: tsCol(false),
    updated_at: tsCol(false),
    email_verification_status: textCol({ defaultSql: "'pending'", nullable: false }),
    verification_attempts: intCol("0"),
    email_verification_checked_at: tsCol(),
    email_verification_score: intCol("0", true),
    email_verification_provider: textCol(),
    priority_score: intCol("0"),
  },
  lead_finder_domains: {
    id: uuidCol({ defaultSql: "gen_random_uuid()", nullable: false }),
    campaign_id: uuidCol({ nullable: false }),
    job_id: uuidCol(),
    domain: textCol(),
    business_name: textCol(),
    campaign_type: textCol({ defaultSql: "'contractor'", nullable: false }),
    trade: textCol(),
    category: textCol(),
    city: textCol(),
    state: textCol(),
    source: textCol(),
    website_url: textCol(),
    formatted_address: textCol(),
    phone: textCol(),
    place_id: textCol(),
    reply_rate: floatCol("0"),
    sent_to_discovery: boolCol("false"),
    discovery_run_id: uuidCol(),
    created_at: tsCol(false),
  },
} satisfies Record<SchemaTableName, Record<string, SchemaColumnSpec>>;

export const schemaContract = {
  contractor_leads: Object.keys(schemaContractDefinitions.contractor_leads),
  job_poster_leads: Object.keys(schemaContractDefinitions.job_poster_leads),
  lead_finder_domains: Object.keys(schemaContractDefinitions.lead_finder_domains),
} satisfies Record<SchemaTableName, string[]>;

export const schemaTables = Object.keys(schemaContract) as SchemaTableName[];

export function getSchemaColumnSpec(table: SchemaTableName, column: string): SchemaColumnSpec {
  const spec = schemaContractDefinitions[table][column as keyof (typeof schemaContractDefinitions)[SchemaTableName]];
  if (!spec) {
    throw new Error(`Missing schema contract definition for ${table}.${column}`);
  }
  return spec;
}
