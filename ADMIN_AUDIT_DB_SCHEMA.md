## ADMIN AUDIT — DB Schema Evidence (for 500s)

Generated: `2026-02-12T21:15:53.982Z`

### GET http://127.0.0.1:3003/api/admin/jobs?status=COMPLETED

- Trace ID: `d4beb42a-1a6c-4c9a-b2b8-bcf12087d63d`
- Smoke runner name: `jobs.list.COMPLETED`

- Endpoint: `GET /api/admin/jobs?status=COMPLETED`
- Tables involved: `Job`, `JobAssignment`, `Contractor`
- Enums involved: `JobStatus`

#### Table: `Job`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'PUBLISHED'::\"JobStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "scope",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "region",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "serviceType",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'handyman'::text"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "timeWindow",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routerEarningsCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "brokerFeeCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "publishedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "claimedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "claimedByUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorCompletedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorCompletionSummary",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerApprovedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerRejectedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerRejectReason",
    "data_type": "USER-DEFINED",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerRejectNotes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerFeedback",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routerApprovedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routerApprovalNotes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "completionFlaggedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "completionFlagReason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorActionTokenHash",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerActionTokenHash",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "jobType",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "lat",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "lng",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorPayoutCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "jobPosterUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "tradeCategory",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'HANDYMAN'::\"TradeCategory\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimatedCompletionDate",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimateSetAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimateUpdatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimateUpdateReason",
    "data_type": "USER-DEFINED",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimateUpdateOtherText",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "laborTotalCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "materialsTotalCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "transactionFeeCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "junkHaulingItems",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "priceAdjustmentCents",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "priceMedianCents",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "pricingVersion",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'v1-median-delta'::text"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "escrowLockedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "paymentCapturedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "paymentReleasedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contactedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "guaranteeEligibleAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "country",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'US'::\"CountryCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "regionCode",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "adminRoutedById",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "postedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routingDueAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "firstRoutedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routingStatus",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'UNROUTED'::\"RoutingStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "failsafeRouting",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "city",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "isMock",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "postalCode",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "publicStatus",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'OPEN'::\"PublicJobStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "regionName",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "jobSource",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'REAL'::\"JobSource\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "repeatContractorDiscountCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "pricingIntel",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "pricingIntelGeneratedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "pricingIntelModel",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiAppraisalStatus",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'PENDING'::\"AiAppraisalStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiAppraisedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiConfidence",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiPriceRangeHigh",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiPriceRangeLow",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiReasoning",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiSuggestedTotal",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "supersededByJobId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "currency",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'USD'::\"CurrencyCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "addressFull",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "availability",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "Job_adminRoutedById_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"adminRoutedById\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  },
  {
    "conname": "Job_claimedByUserId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"claimedByUserId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  },
  {
    "conname": "Job_contractorUserId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"contractorUserId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  },
  {
    "conname": "Job_jobPosterUserId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"jobPosterUserId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  },
  {
    "conname": "Job_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  },
  {
    "conname": "Job_supersededByJobId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"supersededByJobId\") REFERENCES \"Job\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "Job_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"Job_pkey\" ON \"8fold_test\".\"Job\" USING btree (id)"
  },
  {
    "indexname": "Job_region_serviceType_idx",
    "indexdef": "CREATE INDEX \"Job_region_serviceType_idx\" ON \"8fold_test\".\"Job\" USING btree (region, \"serviceType\")"
  },
  {
    "indexname": "Job_status_publishedAt_idx",
    "indexdef": "CREATE INDEX \"Job_status_publishedAt_idx\" ON \"8fold_test\".\"Job\" USING btree (status, \"publishedAt\")"
  },
  {
    "indexname": "Job_routingStatus_routingDueAt_idx",
    "indexdef": "CREATE INDEX \"Job_routingStatus_routingDueAt_idx\" ON \"8fold_test\".\"Job\" USING btree (\"routingStatus\", \"routingDueAt\")"
  },
  {
    "indexname": "Job_country_regionCode_routingStatus_idx",
    "indexdef": "CREATE INDEX \"Job_country_regionCode_routingStatus_idx\" ON \"8fold_test\".\"Job\" USING btree (country, \"regionCode\", \"routingStatus\")"
  },
  {
    "indexname": "Job_postedAt_idx",
    "indexdef": "CREATE INDEX \"Job_postedAt_idx\" ON \"8fold_test\".\"Job\" USING btree (\"postedAt\")"
  },
  {
    "indexname": "Job_adminRoutedById_idx",
    "indexdef": "CREATE INDEX \"Job_adminRoutedById_idx\" ON \"8fold_test\".\"Job\" USING btree (\"adminRoutedById\")"
  },
  {
    "indexname": "Job_contractorUserId_idx",
    "indexdef": "CREATE INDEX \"Job_contractorUserId_idx\" ON \"8fold_test\".\"Job\" USING btree (\"contractorUserId\")"
  },
  {
    "indexname": "Job_isMock_publicStatus_idx",
    "indexdef": "CREATE INDEX \"Job_isMock_publicStatus_idx\" ON \"8fold_test\".\"Job\" USING btree (\"isMock\", \"publicStatus\")"
  },
  {
    "indexname": "Job_jobSource_publicStatus_idx",
    "indexdef": "CREATE INDEX \"Job_jobSource_publicStatus_idx\" ON \"8fold_test\".\"Job\" USING btree (\"jobSource\", \"publicStatus\")"
  },
  {
    "indexname": "Job_jobSource_city_regionCode_idx",
    "indexdef": "CREATE INDEX \"Job_jobSource_city_regionCode_idx\" ON \"8fold_test\".\"Job\" USING btree (\"jobSource\", city, \"regionCode\")"
  }
]
```

#### Table: `JobAssignment`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "JobAssignment",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobAssignment",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'ASSIGNED'::\"JobAssignmentStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobAssignment",
    "column_name": "jobId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobAssignment",
    "column_name": "contractorId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobAssignment",
    "column_name": "assignedByAdminUserId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobAssignment",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobAssignment",
    "column_name": "completedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "JobAssignment_assignedByAdminUserId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"assignedByAdminUserId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  },
  {
    "conname": "JobAssignment_contractorId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"contractorId\") REFERENCES \"Contractor\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  },
  {
    "conname": "JobAssignment_jobId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"jobId\") REFERENCES \"Job\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  },
  {
    "conname": "JobAssignment_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "JobAssignment_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"JobAssignment_pkey\" ON \"8fold_test\".\"JobAssignment\" USING btree (id)"
  },
  {
    "indexname": "JobAssignment_jobId_key",
    "indexdef": "CREATE UNIQUE INDEX \"JobAssignment_jobId_key\" ON \"8fold_test\".\"JobAssignment\" USING btree (\"jobId\")"
  }
]
```

#### Table: `Contractor`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'PENDING'::\"ContractorStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "businessName",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "email",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "categories",
    "data_type": "ARRAY",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "regions",
    "data_type": "ARRAY",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "approvedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "lat",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "lng",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "country",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'US'::\"CountryCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "regionCode",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "trade",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "automotiveEnabled",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "contactName",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "tradeCategories",
    "data_type": "ARRAY",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "yearsExperience",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "3"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Contractor",
    "column_name": "stripeAccountId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "Contractor_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "Contractor_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"Contractor_pkey\" ON \"8fold_test\".\"Contractor\" USING btree (id)"
  },
  {
    "indexname": "Contractor_stripeAccountId_key",
    "indexdef": "CREATE UNIQUE INDEX \"Contractor_stripeAccountId_key\" ON \"8fold_test\".\"Contractor\" USING btree (\"stripeAccountId\")"
  }
]
```

#### Enum: `JobStatus`

```sql
SELECT n.nspname AS schema, t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = '8fold_test' AND t.typname = $1
ORDER BY e.enumsortorder;
```

```json
[
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "DRAFT"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "PUBLISHED"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "ASSIGNED"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "IN_PROGRESS"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "CONTRACTOR_COMPLETED"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "CUSTOMER_APPROVED"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "CUSTOMER_REJECTED"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "COMPLETION_FLAGGED"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "COMPLETED_APPROVED"
  },
  {
    "schema": "8fold_test",
    "enum_name": "JobStatus",
    "value": "OPEN_FOR_ROUTING"
  }
]
```

### GET http://127.0.0.1:3003/api/admin/routing-activity

- Trace ID: `474b2242-3b6d-4860-a450-ff77b326d549`
- Smoke runner name: `routing-activity`

- Endpoint: `GET /api/admin/routing-activity`
- Tables involved: `Job`, `JobDispatch`, `RouterProfile`, `User`

#### Table: `Job`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'PUBLISHED'::\"JobStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "scope",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "region",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "serviceType",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'handyman'::text"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "timeWindow",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routerEarningsCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "brokerFeeCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "publishedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "claimedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "claimedByUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorCompletedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorCompletionSummary",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerApprovedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerRejectedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerRejectReason",
    "data_type": "USER-DEFINED",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerRejectNotes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerFeedback",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routerApprovedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routerApprovalNotes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "completionFlaggedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "completionFlagReason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorActionTokenHash",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "customerActionTokenHash",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "jobType",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "lat",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "lng",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorPayoutCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "jobPosterUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "tradeCategory",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'HANDYMAN'::\"TradeCategory\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimatedCompletionDate",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimateSetAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimateUpdatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimateUpdateReason",
    "data_type": "USER-DEFINED",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "estimateUpdateOtherText",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "laborTotalCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "materialsTotalCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "transactionFeeCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "junkHaulingItems",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "priceAdjustmentCents",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "priceMedianCents",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "pricingVersion",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'v1-median-delta'::text"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "escrowLockedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "paymentCapturedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "paymentReleasedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contactedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "guaranteeEligibleAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "country",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'US'::\"CountryCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "regionCode",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "adminRoutedById",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "postedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routingDueAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "firstRoutedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "routingStatus",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'UNROUTED'::\"RoutingStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "failsafeRouting",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "contractorUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "city",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "isMock",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "postalCode",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "publicStatus",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'OPEN'::\"PublicJobStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "regionName",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "jobSource",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'REAL'::\"JobSource\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "repeatContractorDiscountCents",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "0"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "pricingIntel",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "pricingIntelGeneratedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "pricingIntelModel",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiAppraisalStatus",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'PENDING'::\"AiAppraisalStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiAppraisedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiConfidence",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiPriceRangeHigh",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiPriceRangeLow",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiReasoning",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "aiSuggestedTotal",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "supersededByJobId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "currency",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'USD'::\"CurrencyCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "addressFull",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "Job",
    "column_name": "availability",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "Job_adminRoutedById_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"adminRoutedById\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  },
  {
    "conname": "Job_claimedByUserId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"claimedByUserId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  },
  {
    "conname": "Job_contractorUserId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"contractorUserId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  },
  {
    "conname": "Job_jobPosterUserId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"jobPosterUserId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  },
  {
    "conname": "Job_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  },
  {
    "conname": "Job_supersededByJobId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"supersededByJobId\") REFERENCES \"Job\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "Job_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"Job_pkey\" ON \"8fold_test\".\"Job\" USING btree (id)"
  },
  {
    "indexname": "Job_region_serviceType_idx",
    "indexdef": "CREATE INDEX \"Job_region_serviceType_idx\" ON \"8fold_test\".\"Job\" USING btree (region, \"serviceType\")"
  },
  {
    "indexname": "Job_status_publishedAt_idx",
    "indexdef": "CREATE INDEX \"Job_status_publishedAt_idx\" ON \"8fold_test\".\"Job\" USING btree (status, \"publishedAt\")"
  },
  {
    "indexname": "Job_routingStatus_routingDueAt_idx",
    "indexdef": "CREATE INDEX \"Job_routingStatus_routingDueAt_idx\" ON \"8fold_test\".\"Job\" USING btree (\"routingStatus\", \"routingDueAt\")"
  },
  {
    "indexname": "Job_country_regionCode_routingStatus_idx",
    "indexdef": "CREATE INDEX \"Job_country_regionCode_routingStatus_idx\" ON \"8fold_test\".\"Job\" USING btree (country, \"regionCode\", \"routingStatus\")"
  },
  {
    "indexname": "Job_postedAt_idx",
    "indexdef": "CREATE INDEX \"Job_postedAt_idx\" ON \"8fold_test\".\"Job\" USING btree (\"postedAt\")"
  },
  {
    "indexname": "Job_adminRoutedById_idx",
    "indexdef": "CREATE INDEX \"Job_adminRoutedById_idx\" ON \"8fold_test\".\"Job\" USING btree (\"adminRoutedById\")"
  },
  {
    "indexname": "Job_contractorUserId_idx",
    "indexdef": "CREATE INDEX \"Job_contractorUserId_idx\" ON \"8fold_test\".\"Job\" USING btree (\"contractorUserId\")"
  },
  {
    "indexname": "Job_isMock_publicStatus_idx",
    "indexdef": "CREATE INDEX \"Job_isMock_publicStatus_idx\" ON \"8fold_test\".\"Job\" USING btree (\"isMock\", \"publicStatus\")"
  },
  {
    "indexname": "Job_jobSource_publicStatus_idx",
    "indexdef": "CREATE INDEX \"Job_jobSource_publicStatus_idx\" ON \"8fold_test\".\"Job\" USING btree (\"jobSource\", \"publicStatus\")"
  },
  {
    "indexname": "Job_jobSource_city_regionCode_idx",
    "indexdef": "CREATE INDEX \"Job_jobSource_city_regionCode_idx\" ON \"8fold_test\".\"Job\" USING btree (\"jobSource\", city, \"regionCode\")"
  }
]
```

#### Table: `JobDispatch`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "updatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'PENDING'::\"JobDispatchStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "expiresAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "respondedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "tokenHash",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "jobId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "contractorId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobDispatch",
    "column_name": "routerUserId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "JobDispatch_contractorId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"contractorId\") REFERENCES \"Contractor\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  },
  {
    "conname": "JobDispatch_jobId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"jobId\") REFERENCES \"Job\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  },
  {
    "conname": "JobDispatch_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  },
  {
    "conname": "JobDispatch_routerUserId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"routerUserId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "JobDispatch_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"JobDispatch_pkey\" ON \"8fold_test\".\"JobDispatch\" USING btree (id)"
  },
  {
    "indexname": "JobDispatch_tokenHash_key",
    "indexdef": "CREATE UNIQUE INDEX \"JobDispatch_tokenHash_key\" ON \"8fold_test\".\"JobDispatch\" USING btree (\"tokenHash\")"
  },
  {
    "indexname": "JobDispatch_jobId_status_createdAt_idx",
    "indexdef": "CREATE INDEX \"JobDispatch_jobId_status_createdAt_idx\" ON \"8fold_test\".\"JobDispatch\" USING btree (\"jobId\", status, \"createdAt\")"
  },
  {
    "indexname": "JobDispatch_contractorId_status_createdAt_idx",
    "indexdef": "CREATE INDEX \"JobDispatch_contractorId_status_createdAt_idx\" ON \"8fold_test\".\"JobDispatch\" USING btree (\"contractorId\", status, \"createdAt\")"
  },
  {
    "indexname": "JobDispatch_routerUserId_status_createdAt_idx",
    "indexdef": "CREATE INDEX \"JobDispatch_routerUserId_status_createdAt_idx\" ON \"8fold_test\".\"JobDispatch\" USING btree (\"routerUserId\", status, \"createdAt\")"
  }
]
```

#### Table: `RouterProfile`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "updatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "userId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "state",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "lat",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "lng",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'INCOMPLETE'::\"RouterOnboardingStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "notifyViaEmail",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "true"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "notifyViaSms",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "stripeAccountId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "addressPrivate",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "payoutMethod",
    "data_type": "USER-DEFINED",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "payoutStatus",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'UNSET'::\"RolePayoutStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "RouterProfile",
    "column_name": "paypalEmail",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "RouterProfile_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  },
  {
    "conname": "RouterProfile_userId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"userId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "RouterProfile_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"RouterProfile_pkey\" ON \"8fold_test\".\"RouterProfile\" USING btree (id)"
  },
  {
    "indexname": "RouterProfile_userId_key",
    "indexdef": "CREATE UNIQUE INDEX \"RouterProfile_userId_key\" ON \"8fold_test\".\"RouterProfile\" USING btree (\"userId\")"
  },
  {
    "indexname": "RouterProfile_stripeAccountId_key",
    "indexdef": "CREATE UNIQUE INDEX \"RouterProfile_stripeAccountId_key\" ON \"8fold_test\".\"RouterProfile\" USING btree (\"stripeAccountId\")"
  }
]
```

#### Table: `User`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "authUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "role",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'USER'::\"UserRole\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "country",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'US'::\"CountryCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "email",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'ACTIVE'::\"UserStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "updatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "accountStatus",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'ACTIVE'::text"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "suspendedUntil",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "archivedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "deletionReason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "User_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "User_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"User_pkey\" ON \"8fold_test\".\"User\" USING btree (id)"
  },
  {
    "indexname": "User_authUserId_key",
    "indexdef": "CREATE UNIQUE INDEX \"User_authUserId_key\" ON \"8fold_test\".\"User\" USING btree (\"authUserId\")"
  },
  {
    "indexname": "User_email_key",
    "indexdef": "CREATE UNIQUE INDEX \"User_email_key\" ON \"8fold_test\".\"User\" USING btree (email)"
  },
  {
    "indexname": "User_role_idx",
    "indexdef": "CREATE INDEX \"User_role_idx\" ON \"8fold_test\".\"User\" USING btree (role)"
  },
  {
    "indexname": "User_status_idx",
    "indexdef": "CREATE INDEX \"User_status_idx\" ON \"8fold_test\".\"User\" USING btree (status)"
  }
]
```

### GET http://127.0.0.1:3003/api/admin/support/tickets?take=5

- Trace ID: `57b0200d-a157-4ac0-b764-2a6cf3d3de4e`
- Smoke runner name: `support.tickets.backend`

- Endpoint: `GET /api/admin/support/tickets`
- Tables involved: `support_tickets`, `support_messages`

#### Table: `support_tickets`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "updatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "type",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'OPEN'::\"SupportTicketStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "category",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "priority",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'NORMAL'::\"SupportTicketPriority\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "createdById",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "assignedToId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "roleContext",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_tickets",
    "column_name": "subject",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "support_tickets_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  },
  {
    "conname": "support_tickets_createdById_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"createdById\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  },
  {
    "conname": "support_tickets_assignedToId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"assignedToId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE SET NULL"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "support_tickets_pkey",
    "indexdef": "CREATE UNIQUE INDEX support_tickets_pkey ON \"8fold_test\".support_tickets USING btree (id)"
  },
  {
    "indexname": "support_tickets_status_priority_createdAt_idx",
    "indexdef": "CREATE INDEX \"support_tickets_status_priority_createdAt_idx\" ON \"8fold_test\".support_tickets USING btree (status, priority, \"createdAt\")"
  },
  {
    "indexname": "support_tickets_createdById_createdAt_idx",
    "indexdef": "CREATE INDEX \"support_tickets_createdById_createdAt_idx\" ON \"8fold_test\".support_tickets USING btree (\"createdById\", \"createdAt\")"
  },
  {
    "indexname": "support_tickets_assignedToId_updatedAt_idx",
    "indexdef": "CREATE INDEX \"support_tickets_assignedToId_updatedAt_idx\" ON \"8fold_test\".support_tickets USING btree (\"assignedToId\", \"updatedAt\")"
  }
]
```

#### Table: `support_messages`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "support_messages",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_messages",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_messages",
    "column_name": "ticketId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_messages",
    "column_name": "authorId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "support_messages",
    "column_name": "message",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "support_messages_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  },
  {
    "conname": "support_messages_ticketId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"ticketId\") REFERENCES support_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  },
  {
    "conname": "support_messages_authorId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"authorId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "support_messages_pkey",
    "indexdef": "CREATE UNIQUE INDEX support_messages_pkey ON \"8fold_test\".support_messages USING btree (id)"
  },
  {
    "indexname": "support_messages_ticketId_createdAt_idx",
    "indexdef": "CREATE INDEX \"support_messages_ticketId_createdAt_idx\" ON \"8fold_test\".support_messages USING btree (\"ticketId\", \"createdAt\")"
  },
  {
    "indexname": "support_messages_authorId_createdAt_idx",
    "indexdef": "CREATE INDEX \"support_messages_authorId_createdAt_idx\" ON \"8fold_test\".support_messages USING btree (\"authorId\", \"createdAt\")"
  }
]
```

### GET http://127.0.0.1:3003/api/admin/users

- Trace ID: `651d950c-55e9-4b14-ae99-71172be2d702`
- Smoke runner name: `users.all`

- Endpoint: `GET /api/admin/users`
- Tables involved: `User`, `ContractorAccount`, `Router`, `JobPosterProfile`
- Enums involved: `TradeCategory`

#### Table: `User`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "authUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "role",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'USER'::\"UserRole\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "country",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'US'::\"CountryCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "email",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'ACTIVE'::\"UserStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "updatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "accountStatus",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'ACTIVE'::text"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "suspendedUntil",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "archivedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "deletionReason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "User_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "User_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"User_pkey\" ON \"8fold_test\".\"User\" USING btree (id)"
  },
  {
    "indexname": "User_authUserId_key",
    "indexdef": "CREATE UNIQUE INDEX \"User_authUserId_key\" ON \"8fold_test\".\"User\" USING btree (\"authUserId\")"
  },
  {
    "indexname": "User_email_key",
    "indexdef": "CREATE UNIQUE INDEX \"User_email_key\" ON \"8fold_test\".\"User\" USING btree (email)"
  },
  {
    "indexname": "User_role_idx",
    "indexdef": "CREATE INDEX \"User_role_idx\" ON \"8fold_test\".\"User\" USING btree (role)"
  },
  {
    "indexname": "User_status_idx",
    "indexdef": "CREATE INDEX \"User_status_idx\" ON \"8fold_test\".\"User\" USING btree (status)"
  }
]
```

#### Table: `ContractorAccount`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[]
```

#### Table: `Router`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[]
```

#### Table: `JobPosterProfile`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "updatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "userId",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "email",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "address",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "city",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "stateProvince",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "country",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'US'::\"CountryCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "lat",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "lng",
    "data_type": "double precision",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "defaultJobLocation",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "payoutMethod",
    "data_type": "USER-DEFINED",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "payoutStatus",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'UNSET'::\"RolePayoutStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "stripeAccountId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "JobPosterProfile",
    "column_name": "paypalEmail",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "JobPosterProfile_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  },
  {
    "conname": "JobPosterProfile_userId_fkey",
    "contype": "f",
    "def": "FOREIGN KEY (\"userId\") REFERENCES \"User\"(id) ON UPDATE CASCADE ON DELETE RESTRICT"
  },
  {
    "conname": "jobposterprofile_userid_unique",
    "contype": "u",
    "def": "UNIQUE (\"userId\")"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "JobPosterProfile_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"JobPosterProfile_pkey\" ON \"8fold_test\".\"JobPosterProfile\" USING btree (id)"
  },
  {
    "indexname": "JobPosterProfile_userId_key",
    "indexdef": "CREATE UNIQUE INDEX \"JobPosterProfile_userId_key\" ON \"8fold_test\".\"JobPosterProfile\" USING btree (\"userId\")"
  },
  {
    "indexname": "JobPosterProfile_userId_idx",
    "indexdef": "CREATE INDEX \"JobPosterProfile_userId_idx\" ON \"8fold_test\".\"JobPosterProfile\" USING btree (\"userId\")"
  },
  {
    "indexname": "JobPosterProfile_stripeAccountId_key",
    "indexdef": "CREATE UNIQUE INDEX \"JobPosterProfile_stripeAccountId_key\" ON \"8fold_test\".\"JobPosterProfile\" USING btree (\"stripeAccountId\") WHERE (\"stripeAccountId\" IS NOT NULL)"
  },
  {
    "indexname": "jobposterprofile_userid_unique",
    "indexdef": "CREATE UNIQUE INDEX jobposterprofile_userid_unique ON \"8fold_test\".\"JobPosterProfile\" USING btree (\"userId\")"
  }
]
```

#### Enum: `TradeCategory`

```sql
SELECT n.nspname AS schema, t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = '8fold_test' AND t.typname = $1
ORDER BY e.enumsortorder;
```

```json
[
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "PLUMBING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "ELECTRICAL"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "HVAC"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "APPLIANCE"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "HANDYMAN"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "PAINTING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "CARPENTRY"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "DRYWALL"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "ROOFING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "JANITORIAL_CLEANING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "LANDSCAPING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "FENCING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "SNOW_REMOVAL"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "JUNK_REMOVAL"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "MOVING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "AUTOMOTIVE"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "FURNITURE_ASSEMBLY"
  }
]
```

### GET http://127.0.0.1:3003/api/admin/users/contractors

- Trace ID: `9902164c-f0ea-4d9f-96b1-0c4cccbd1225`
- Smoke runner name: `users.contractors`

- Endpoint: `GET /api/admin/users/contractors`
- Tables involved: `ContractorAccount`, `User`
- Enums involved: `TradeCategory`

#### Table: `ContractorAccount`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[]
```

#### Table: `User`

**Columns**

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '8fold_test' AND table_name = $1
ORDER BY ordinal_position;
```

```json
[
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "id",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "authUserId",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "role",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'USER'::\"UserRole\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "createdAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "country",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'US'::\"CountryCode\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "email",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "status",
    "data_type": "USER-DEFINED",
    "is_nullable": "NO",
    "column_default": "'ACTIVE'::\"UserStatus\""
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "updatedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "NO",
    "column_default": "CURRENT_TIMESTAMP"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "accountStatus",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'ACTIVE'::text"
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "suspendedUntil",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "archivedAt",
    "data_type": "timestamp without time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_schema": "8fold_test",
    "table_name": "User",
    "column_name": "deletionReason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

**Constraints**

```sql
SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='8fold_test' AND t.relname=$1;
```

```json
[
  {
    "conname": "User_pkey",
    "contype": "p",
    "def": "PRIMARY KEY (id)"
  }
]
```

**Indexes**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='8fold_test' AND tablename=$1;
```

```json
[
  {
    "indexname": "User_pkey",
    "indexdef": "CREATE UNIQUE INDEX \"User_pkey\" ON \"8fold_test\".\"User\" USING btree (id)"
  },
  {
    "indexname": "User_authUserId_key",
    "indexdef": "CREATE UNIQUE INDEX \"User_authUserId_key\" ON \"8fold_test\".\"User\" USING btree (\"authUserId\")"
  },
  {
    "indexname": "User_email_key",
    "indexdef": "CREATE UNIQUE INDEX \"User_email_key\" ON \"8fold_test\".\"User\" USING btree (email)"
  },
  {
    "indexname": "User_role_idx",
    "indexdef": "CREATE INDEX \"User_role_idx\" ON \"8fold_test\".\"User\" USING btree (role)"
  },
  {
    "indexname": "User_status_idx",
    "indexdef": "CREATE INDEX \"User_status_idx\" ON \"8fold_test\".\"User\" USING btree (status)"
  }
]
```

#### Enum: `TradeCategory`

```sql
SELECT n.nspname AS schema, t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = '8fold_test' AND t.typname = $1
ORDER BY e.enumsortorder;
```

```json
[
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "PLUMBING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "ELECTRICAL"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "HVAC"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "APPLIANCE"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "HANDYMAN"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "PAINTING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "CARPENTRY"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "DRYWALL"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "ROOFING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "JANITORIAL_CLEANING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "LANDSCAPING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "FENCING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "SNOW_REMOVAL"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "JUNK_REMOVAL"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "MOVING"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "AUTOMOTIVE"
  },
  {
    "schema": "8fold_test",
    "enum_name": "TradeCategory",
    "value": "FURNITURE_ASSEMBLY"
  }
]
```
