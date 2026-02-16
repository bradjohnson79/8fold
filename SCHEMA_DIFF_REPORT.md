## Live DB ↔ Drizzle Schema Diff (critical tables)

- Generated: `2026-02-11T23:35:58.243Z`

This is a **best-effort structural diff** (columns, basic nullability/default/type signals).

### User (`8fold_test.User`)

- Drizzle columns: **14**
- DB columns: **14**

- **Type warnings**
  - role: DB enum (UserRole) vs Drizzle string
  - country: DB enum (CountryCode) vs Drizzle string
  - status: DB enum (UserStatus) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `id` | text | `text` | NO |  |
| `authUserId` | text | `text` | YES |  |
| `role` | USER-DEFINED | `UserRole` | NO | `'USER'::"UserRole"` |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `country` | USER-DEFINED | `CountryCode` | NO | `'US'::"CountryCode"` |
| `email` | text | `text` | YES |  |
| `name` | text | `text` | YES |  |
| `phone` | text | `text` | YES |  |
| `status` | USER-DEFINED | `UserStatus` | NO | `'ACTIVE'::"UserStatus"` |
| `updatedAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `accountStatus` | text | `text` | NO | `'ACTIVE'::text` |
| `suspendedUntil` | timestamp without time zone | `timestamp` | YES |  |
| `archivedAt` | timestamp without time zone | `timestamp` | YES |  |
| `deletionReason` | text | `text` | YES |  |

### Job (`8fold_test.Job`)

- Drizzle columns: **81**
- DB columns: **81**

- **Type warnings**
  - status: DB enum (JobStatus) vs Drizzle string
  - customerRejectReason: DB enum (CustomerRejectReason) vs Drizzle string
  - jobType: DB enum (JobType) vs Drizzle string
  - tradeCategory: DB enum (TradeCategory) vs Drizzle string
  - estimateUpdateReason: DB enum (EcdUpdateReason) vs Drizzle string
  - country: DB enum (CountryCode) vs Drizzle string
  - routingStatus: DB enum (RoutingStatus) vs Drizzle string
  - publicStatus: DB enum (PublicJobStatus) vs Drizzle string
  - jobSource: DB enum (JobSource) vs Drizzle string
  - aiAppraisalStatus: DB enum (AiAppraisalStatus) vs Drizzle string
  - currency: DB enum (CurrencyCode) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `id` | text | `text` | NO |  |
| `status` | USER-DEFINED | `JobStatus` | NO | `'PUBLISHED'::"JobStatus"` |
| `title` | text | `text` | NO |  |
| `scope` | text | `text` | NO |  |
| `region` | text | `text` | NO |  |
| `serviceType` | text | `text` | NO | `'handyman'::text` |
| `timeWindow` | text | `text` | YES |  |
| `routerEarningsCents` | integer | `int4` | NO | `0` |
| `brokerFeeCents` | integer | `int4` | NO | `0` |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `publishedAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `claimedAt` | timestamp without time zone | `timestamp` | YES |  |
| `claimedByUserId` | text | `text` | YES |  |
| `routedAt` | timestamp without time zone | `timestamp` | YES |  |
| `contractorCompletedAt` | timestamp without time zone | `timestamp` | YES |  |
| `contractorCompletionSummary` | text | `text` | YES |  |
| `customerApprovedAt` | timestamp without time zone | `timestamp` | YES |  |
| `customerRejectedAt` | timestamp without time zone | `timestamp` | YES |  |
| `customerRejectReason` | USER-DEFINED | `CustomerRejectReason` | YES |  |
| `customerRejectNotes` | text | `text` | YES |  |
| `customerFeedback` | text | `text` | YES |  |
| `routerApprovedAt` | timestamp without time zone | `timestamp` | YES |  |
| `routerApprovalNotes` | text | `text` | YES |  |
| `completionFlaggedAt` | timestamp without time zone | `timestamp` | YES |  |
| `completionFlagReason` | text | `text` | YES |  |
| `contractorActionTokenHash` | text | `text` | YES |  |
| `customerActionTokenHash` | text | `text` | YES |  |
| `jobType` | USER-DEFINED | `JobType` | NO |  |
| `lat` | double precision | `float8` | YES |  |
| `lng` | double precision | `float8` | YES |  |
| `contractorPayoutCents` | integer | `int4` | NO | `0` |
| `jobPosterUserId` | text | `text` | YES |  |
| `tradeCategory` | USER-DEFINED | `TradeCategory` | NO | `'HANDYMAN'::"TradeCategory"` |
| `estimatedCompletionDate` | timestamp without time zone | `timestamp` | YES |  |
| `estimateSetAt` | timestamp without time zone | `timestamp` | YES |  |
| `estimateUpdatedAt` | timestamp without time zone | `timestamp` | YES |  |
| `estimateUpdateReason` | USER-DEFINED | `EcdUpdateReason` | YES |  |
| `estimateUpdateOtherText` | text | `text` | YES |  |
| `laborTotalCents` | integer | `int4` | NO | `0` |
| `materialsTotalCents` | integer | `int4` | NO | `0` |
| … | … | … | … | … |

### JobPosterProfile (`8fold_test.JobPosterProfile`)

- Drizzle columns: **18**
- DB columns: **18**

- **Type warnings**
  - country: DB enum (CountryCode) vs Drizzle string
  - payoutMethod: DB enum (RolePayoutMethod) vs Drizzle string
  - payoutStatus: DB enum (RolePayoutStatus) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `id` | text | `text` | NO |  |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp without time zone | `timestamp` | NO |  |
| `userId` | text | `text` | NO |  |
| `name` | text | `text` | NO |  |
| `email` | text | `text` | NO |  |
| `phone` | text | `text` | YES |  |
| `address` | text | `text` | YES |  |
| `city` | text | `text` | NO |  |
| `stateProvince` | text | `text` | NO |  |
| `country` | USER-DEFINED | `CountryCode` | NO | `'US'::"CountryCode"` |
| `lat` | double precision | `float8` | YES |  |
| `lng` | double precision | `float8` | YES |  |
| `defaultJobLocation` | text | `text` | YES |  |
| `payoutMethod` | USER-DEFINED | `RolePayoutMethod` | YES |  |
| `payoutStatus` | USER-DEFINED | `RolePayoutStatus` | NO | `'UNSET'::"RolePayoutStatus"` |
| `stripeAccountId` | text | `text` | YES |  |
| `paypalEmail` | text | `text` | YES |  |

### RouterProfile (`8fold_test.RouterProfile`)

- Drizzle columns: **17**
- DB columns: **17**

- **Type warnings**
  - status: DB enum (RouterOnboardingStatus) vs Drizzle string
  - payoutMethod: DB enum (RolePayoutMethod) vs Drizzle string
  - payoutStatus: DB enum (RolePayoutStatus) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `id` | text | `text` | NO |  |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp without time zone | `timestamp` | NO |  |
| `userId` | text | `text` | NO |  |
| `name` | text | `text` | YES |  |
| `state` | text | `text` | YES |  |
| `lat` | double precision | `float8` | YES |  |
| `lng` | double precision | `float8` | YES |  |
| `status` | USER-DEFINED | `RouterOnboardingStatus` | NO | `'INCOMPLETE'::"RouterOnboardingStatus"` |
| `notifyViaEmail` | boolean | `bool` | NO | `true` |
| `notifyViaSms` | boolean | `bool` | NO | `false` |
| `phone` | text | `text` | YES |  |
| `stripeAccountId` | text | `text` | YES |  |
| `addressPrivate` | text | `text` | YES |  |
| `payoutMethod` | USER-DEFINED | `RolePayoutMethod` | YES |  |
| `payoutStatus` | USER-DEFINED | `RolePayoutStatus` | NO | `'UNSET'::"RolePayoutStatus"` |
| `paypalEmail` | text | `text` | YES |  |

### routers (`8fold_test.routers`)

- Drizzle columns: **17**
- DB columns: **17**

- **Type warnings**
  - homeCountry: DB enum (CountryCode) vs Drizzle string
  - status: DB enum (RouterStatus) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `userId` | text | `text` | NO |  |
| `homeCountry` | USER-DEFINED | `CountryCode` | NO | `'US'::"CountryCode"` |
| `homeRegionCode` | text | `text` | NO |  |
| `homeCity` | text | `text` | YES |  |
| `isSeniorRouter` | boolean | `bool` | NO | `false` |
| `dailyRouteLimit` | integer | `int4` | NO | `10` |
| `routesCompleted` | integer | `int4` | NO | `0` |
| `routesFailed` | integer | `int4` | NO | `0` |
| `rating` | double precision | `float8` | YES |  |
| `status` | USER-DEFINED | `RouterStatus` | NO | `'ACTIVE'::"RouterStatus"` |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `createdByAdmin` | boolean | `bool` | NO | `false` |
| `isActive` | boolean | `bool` | NO | `true` |
| `isMock` | boolean | `bool` | NO | `false` |
| `isTest` | boolean | `bool` | NO | `false` |
| `termsAccepted` | boolean | `bool` | NO | `false` |
| `profileComplete` | boolean | `bool` | NO | `false` |

### contractor_accounts (`8fold_test.contractor_accounts`)

- Drizzle columns: **32**
- DB columns: **32**

- **Type warnings**
  - tradeCategory: DB enum (TradeCategory) vs Drizzle string
  - country: DB enum (CountryCode) vs Drizzle string
  - payoutMethod: DB enum (RolePayoutMethod) vs Drizzle string
  - payoutStatus: DB enum (RolePayoutStatus) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `userId` | text | `text` | NO |  |
| `tradeCategory` | USER-DEFINED | `TradeCategory` | NO |  |
| `serviceRadiusKm` | integer | `int4` | NO | `25` |
| `country` | USER-DEFINED | `CountryCode` | NO | `'US'::"CountryCode"` |
| `regionCode` | text | `text` | NO |  |
| `city` | text | `text` | YES |  |
| `isApproved` | boolean | `bool` | NO | `false` |
| `jobsCompleted` | integer | `int4` | NO | `0` |
| `rating` | double precision | `float8` | YES |  |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `createdByAdmin` | boolean | `bool` | NO | `false` |
| `isActive` | boolean | `bool` | NO | `true` |
| `isMock` | boolean | `bool` | NO | `false` |
| `isTest` | boolean | `bool` | NO | `false` |
| `payoutMethod` | USER-DEFINED | `RolePayoutMethod` | YES |  |
| `payoutStatus` | USER-DEFINED | `RolePayoutStatus` | NO | `'UNSET'::"RolePayoutStatus"` |
| `stripeAccountId` | text | `text` | YES |  |
| `paypalEmail` | text | `text` | YES |  |
| `status` | text | `text` | YES |  |
| `wizardCompleted` | boolean | `bool` | NO | `false` |
| `firstName` | text | `text` | YES |  |
| `lastName` | text | `text` | YES |  |
| `businessName` | text | `text` | YES |  |
| `businessNumber` | text | `text` | YES |  |
| `addressMode` | text | `text` | YES |  |
| `addressSearchDisplayName` | text | `text` | YES |  |
| `address1` | text | `text` | YES |  |
| `address2` | text | `text` | YES |  |
| `apt` | text | `text` | YES |  |
| `postalCode` | text | `text` | YES |  |
| `tradeStartYear` | integer | `int4` | YES |  |
| `tradeStartMonth` | integer | `int4` | YES |  |

### Contractor (`8fold_test.Contractor`)

- Drizzle columns: **18**
- DB columns: **19**

- **DB columns missing in Drizzle**
  - `stripeAccountId`

- **Type warnings**
  - status: DB enum (ContractorStatus) vs Drizzle string
  - country: DB enum (CountryCode) vs Drizzle string
  - trade: DB enum (ContractorTrade) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `id` | text | `text` | NO |  |
| `status` | USER-DEFINED | `ContractorStatus` | NO | `'PENDING'::"ContractorStatus"` |
| `businessName` | text | `text` | NO |  |
| `phone` | text | `text` | YES |  |
| `email` | text | `text` | YES |  |
| `categories` | ARRAY | `_text` | YES |  |
| `regions` | ARRAY | `_text` | YES |  |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `approvedAt` | timestamp without time zone | `timestamp` | YES |  |
| `lat` | double precision | `float8` | YES |  |
| `lng` | double precision | `float8` | YES |  |
| `country` | USER-DEFINED | `CountryCode` | NO | `'US'::"CountryCode"` |
| `regionCode` | text | `text` | NO |  |
| `trade` | USER-DEFINED | `ContractorTrade` | NO |  |
| `automotiveEnabled` | boolean | `bool` | NO | `false` |
| `contactName` | text | `text` | YES |  |
| `tradeCategories` | ARRAY | `_TradeCategory` | YES |  |
| `yearsExperience` | integer | `int4` | NO | `3` |
| `stripeAccountId` | text | `text` | YES |  |

### JobDispatch (`8fold_test.JobDispatch`)

- Drizzle columns: **10**
- DB columns: **10**

- **Type warnings**
  - status: DB enum (JobDispatchStatus) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `id` | text | `text` | NO |  |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp without time zone | `timestamp` | NO |  |
| `status` | USER-DEFINED | `JobDispatchStatus` | NO | `'PENDING'::"JobDispatchStatus"` |
| `expiresAt` | timestamp without time zone | `timestamp` | NO |  |
| `respondedAt` | timestamp without time zone | `timestamp` | YES |  |
| `tokenHash` | text | `text` | NO |  |
| `jobId` | text | `text` | NO |  |
| `contractorId` | text | `text` | NO |  |
| `routerUserId` | text | `text` | NO |  |

### JobPayment (`8fold_test.JobPayment`)

- Drizzle columns: **15**
- DB columns: **15**

- ✅ No column-level diffs detected by this script.

### conversations (`8fold_test.conversations`)

- Drizzle columns: **6**
- DB columns: **6**

- ✅ No column-level diffs detected by this script.

### messages (`8fold_test.messages`)

- Drizzle columns: **6**
- DB columns: **6**

- ✅ No column-level diffs detected by this script.

### support_tickets (`8fold_test.support_tickets`)

- Drizzle columns: **11**
- DB columns: **11**

- **Type warnings**
  - type: DB enum (SupportTicketType) vs Drizzle string
  - status: DB enum (SupportTicketStatus) vs Drizzle string
  - category: DB enum (SupportTicketCategory) vs Drizzle string
  - priority: DB enum (SupportTicketPriority) vs Drizzle string
  - roleContext: DB enum (SupportRoleContext) vs Drizzle string

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `id` | text | `text` | NO |  |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp without time zone | `timestamp` | NO |  |
| `type` | USER-DEFINED | `SupportTicketType` | NO |  |
| `status` | USER-DEFINED | `SupportTicketStatus` | NO | `'OPEN'::"SupportTicketStatus"` |
| `category` | USER-DEFINED | `SupportTicketCategory` | NO |  |
| `priority` | USER-DEFINED | `SupportTicketPriority` | NO | `'NORMAL'::"SupportTicketPriority"` |
| `createdById` | text | `text` | NO |  |
| `assignedToId` | text | `text` | YES |  |
| `roleContext` | USER-DEFINED | `SupportRoleContext` | NO |  |
| `subject` | text | `text` | NO |  |

### support_messages (`8fold_test.support_messages`)

- Drizzle columns: **5**
- DB columns: **5**

- ✅ No column-level diffs detected by this script.

### support_attachments (`8fold_test.support_attachments`)

- Drizzle columns: **9**
- DB columns: **9**

- **DB columns missing in Drizzle**
  - `originalName`
  - `mimeType`

- **Drizzle columns missing in DB**
  - `fileName`
  - `contentType`

- **DB column details (subset)**

| column | data_type | udt | nullable | default |
|---|---|---|---|---|
| `id` | text | `text` | NO |  |
| `createdAt` | timestamp without time zone | `timestamp` | NO | `CURRENT_TIMESTAMP` |
| `ticketId` | text | `text` | NO |  |
| `uploadedById` | text | `text` | NO |  |
| `originalName` | text | `text` | NO |  |
| `mimeType` | text | `text` | NO |  |
| `sizeBytes` | integer | `int4` | NO |  |
| `storageKey` | text | `text` | NO |  |
| `sha256` | text | `text` | YES |  |

### notification_deliveries (`8fold_test.notification_deliveries`)

- Drizzle columns: **8**
- DB columns: **8**

- ✅ No column-level diffs detected by this script.
