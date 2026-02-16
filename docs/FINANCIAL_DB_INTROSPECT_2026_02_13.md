## FINANCIAL DB INTROSPECT (2026_02_13)

- **schema**: `8fold_test`
- **generatedAt**: `2026-02-13T20:36:00.352Z`

### Table: `8fold_test.Escrow`

#### Columns

| column | data_type | udt_name | nullable | default |
|---|---|---|---|---|
| id | uuid | uuid | NO | gen_random_uuid() |
| jobId | text | text | NO |  |
| kind | USER-DEFINED | EscrowKind | NO |  |
| amountCents | integer | int4 | NO |  |
| currency | USER-DEFINED | CurrencyCode | NO |  |
| status | USER-DEFINED | EscrowStatus | NO | 'PENDING'::"EscrowStatus" |
| stripeCheckoutSessionId | text | text | YES |  |
| stripePaymentIntentId | text | text | YES |  |
| webhookProcessedAt | timestamp without time zone | timestamp | YES |  |
| createdAt | timestamp without time zone | timestamp | NO | CURRENT_TIMESTAMP |
| updatedAt | timestamp without time zone | timestamp | NO | CURRENT_TIMESTAMP |

#### Constraints (PK/FK/UNIQUE/CHECK)

| name | type | definition |
|---|---|---|
| Escrow_amountCents_positive | c | CHECK (("amountCents" > 0)) |
| Escrow_jobId_fkey | f | FOREIGN KEY ("jobId") REFERENCES "Job"(id) |
| Escrow_pkey | p | PRIMARY KEY (id) |
| Escrow_stripeCheckoutSessionId_key | u | UNIQUE ("stripeCheckoutSessionId") |
| Escrow_stripePaymentIntentId_key | u | UNIQUE ("stripePaymentIntentId") |

#### Indexes

- `Escrow_jobId_idx`
  - `CREATE INDEX "Escrow_jobId_idx" ON "8fold_test"."Escrow" USING btree ("jobId")`
- `Escrow_pkey`
  - `CREATE UNIQUE INDEX "Escrow_pkey" ON "8fold_test"."Escrow" USING btree (id)`
- `Escrow_status_idx`
  - `CREATE INDEX "Escrow_status_idx" ON "8fold_test"."Escrow" USING btree (status)`
- `Escrow_stripeCheckoutSessionId_idx`
  - `CREATE INDEX "Escrow_stripeCheckoutSessionId_idx" ON "8fold_test"."Escrow" USING btree ("stripeCheckoutSessionId")`
- `Escrow_stripeCheckoutSessionId_key`
  - `CREATE UNIQUE INDEX "Escrow_stripeCheckoutSessionId_key" ON "8fold_test"."Escrow" USING btree ("stripeCheckoutSessionId")`
- `Escrow_stripePaymentIntentId_idx`
  - `CREATE INDEX "Escrow_stripePaymentIntentId_idx" ON "8fold_test"."Escrow" USING btree ("stripePaymentIntentId")`
- `Escrow_stripePaymentIntentId_key`
  - `CREATE UNIQUE INDEX "Escrow_stripePaymentIntentId_key" ON "8fold_test"."Escrow" USING btree ("stripePaymentIntentId")`

### Table: `8fold_test.PartsMaterialRequest`

#### Columns

| column | data_type | udt_name | nullable | default |
|---|---|---|---|---|
| id | uuid | uuid | NO | gen_random_uuid() |
| jobId | text | text | NO |  |
| contractorId | text | text | NO |  |
| amountCents | integer | int4 | NO |  |
| description | text | text | NO |  |
| status | USER-DEFINED | PartsMaterialStatus | NO |  |
| escrowId | uuid | uuid | YES |  |
| createdAt | timestamp without time zone | timestamp | NO | CURRENT_TIMESTAMP |
| updatedAt | timestamp without time zone | timestamp | NO | CURRENT_TIMESTAMP |
| paymentStatus | USER-DEFINED | PaymentStatus | NO | 'UNPAID'::"PaymentStatus" |
| currency | text | text | NO | 'cad'::text |
| stripePaymentIntentId | text | text | YES |  |
| fundedAt | timestamp without time zone | timestamp | YES |  |
| releaseStatus | USER-DEFINED | PartsMaterialReleaseStatus | NO | 'NOT_READY'::"PartsMaterialReleaseStatus" |
| contractorTransferId | text | text | YES |  |

#### Constraints (PK/FK/UNIQUE/CHECK)

| name | type | definition |
|---|---|---|
| PartsMaterialRequest_amountCents_positive | c | CHECK (("amountCents" > 0)) |
| PartsMaterialRequest_contractorId_fkey | f | FOREIGN KEY ("contractorId") REFERENCES "Contractor"(id) |
| PartsMaterialRequest_escrowId_fkey | f | FOREIGN KEY ("escrowId") REFERENCES "Escrow"(id) |
| PartsMaterialRequest_jobId_fkey | f | FOREIGN KEY ("jobId") REFERENCES "Job"(id) |
| PartsMaterialRequest_pkey | p | PRIMARY KEY (id) |

#### Indexes

- `PartsMaterialRequest_contractorId_idx`
  - `CREATE INDEX "PartsMaterialRequest_contractorId_idx" ON "8fold_test"."PartsMaterialRequest" USING btree ("contractorId")`
- `PartsMaterialRequest_jobId_idx`
  - `CREATE INDEX "PartsMaterialRequest_jobId_idx" ON "8fold_test"."PartsMaterialRequest" USING btree ("jobId")`
- `PartsMaterialRequest_paymentStatus_idx`
  - `CREATE INDEX "PartsMaterialRequest_paymentStatus_idx" ON "8fold_test"."PartsMaterialRequest" USING btree ("paymentStatus")`
- `PartsMaterialRequest_pkey`
  - `CREATE UNIQUE INDEX "PartsMaterialRequest_pkey" ON "8fold_test"."PartsMaterialRequest" USING btree (id)`
- `PartsMaterialRequest_releaseStatus_idx`
  - `CREATE INDEX "PartsMaterialRequest_releaseStatus_idx" ON "8fold_test"."PartsMaterialRequest" USING btree ("releaseStatus")`
- `PartsMaterialRequest_status_idx`
  - `CREATE INDEX "PartsMaterialRequest_status_idx" ON "8fold_test"."PartsMaterialRequest" USING btree (status)`
- `PartsMaterialRequest_stripePaymentIntentId_idx`
  - `CREATE INDEX "PartsMaterialRequest_stripePaymentIntentId_idx" ON "8fold_test"."PartsMaterialRequest" USING btree ("stripePaymentIntentId")`

### Table: `8fold_test.LedgerEntry`

#### Columns

| column | data_type | udt_name | nullable | default |
|---|---|---|---|---|
| id | uuid | uuid | NO | gen_random_uuid() |
| createdAt | timestamp without time zone | timestamp | NO | CURRENT_TIMESTAMP |
| userId | text | text | NO |  |
| jobId | text | text | YES |  |
| escrowId | uuid | uuid | YES |  |
| type | USER-DEFINED | LedgerEntryType | NO |  |
| direction | USER-DEFINED | LedgerDirection | NO |  |
| bucket | USER-DEFINED | LedgerBucket | NO |  |
| amountCents | integer | int4 | NO |  |
| currency | USER-DEFINED | CurrencyCode | NO | 'USD'::"CurrencyCode" |
| stripeRef | text | text | YES |  |
| memo | text | text | YES |  |

#### Constraints (PK/FK/UNIQUE/CHECK)

| name | type | definition |
|---|---|---|
| LedgerEntry_amountCents_positive | c | CHECK (("amountCents" > 0)) |
| LedgerEntry_escrowId_fkey | f | FOREIGN KEY ("escrowId") REFERENCES "Escrow"(id) |
| LedgerEntry_jobId_fkey1 | f | FOREIGN KEY ("jobId") REFERENCES "Job"(id) |
| LedgerEntry_pkey1 | p | PRIMARY KEY (id) |

#### Indexes

- `LedgerEntry_escrowId_idx`
  - `CREATE INDEX "LedgerEntry_escrowId_idx" ON "8fold_test"."LedgerEntry" USING btree ("escrowId")`
- `LedgerEntry_escrow_fund_once`
  - `CREATE UNIQUE INDEX "LedgerEntry_escrow_fund_once" ON "8fold_test"."LedgerEntry" USING btree ("escrowId") WHERE (("escrowId" IS NOT NULL) AND (type = ANY (ARRAY['ESCROW_FUND'::"LedgerEntryType", 'PNM_FUND'::"LedgerEntryType"])) AND (direction = 'CREDIT'::"LedgerDirection"))`
- `LedgerEntry_jobId_idx`
  - `CREATE INDEX "LedgerEntry_jobId_idx" ON "8fold_test"."LedgerEntry" USING btree ("jobId")`
- `LedgerEntry_pkey1`
  - `CREATE UNIQUE INDEX "LedgerEntry_pkey1" ON "8fold_test"."LedgerEntry" USING btree (id)`
- `LedgerEntry_stripeRef_idx`
  - `CREATE INDEX "LedgerEntry_stripeRef_idx" ON "8fold_test"."LedgerEntry" USING btree ("stripeRef")`
- `LedgerEntry_type_idx`
  - `CREATE INDEX "LedgerEntry_type_idx" ON "8fold_test"."LedgerEntry" USING btree (type)`

### Enums

- **EscrowKind**: `JOB_ESCROW`, `PARTS_MATERIALS`
- **EscrowStatus**: `PENDING`, `FUNDED`, `RELEASED`, `REFUNDED`, `FAILED`
- **PartsMaterialStatus**: `REQUESTED`, `APPROVED`, `PAID`, `REJECTED`, `CANCELLED`
- **LedgerEntryType**: `ROUTER_EARNING`, `BROKER_FEE`, `PAYOUT`, `ADJUSTMENT`, `ESCROW_FUND`, `PNM_FUND`, `ESCROW_RELEASE`, `ESCROW_REFUND`, `PLATFORM_FEE`, `ROUTER_EARN`, `CONTRACTOR_EARN`
- **LedgerDirection**: `CREDIT`, `DEBIT`
