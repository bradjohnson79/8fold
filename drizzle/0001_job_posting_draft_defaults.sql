-- Drizzle SQL migrations (source of truth for additive DB patches).
-- NOTE: Prisma migrations are legacy/frozen; new patches must land here.

-- Permissive draft defaults for Job posting flow (Drizzle-first inserts rely on DB defaults).
ALTER TABLE "Job"
ALTER COLUMN "routerEarningsCents" SET DEFAULT 0;

ALTER TABLE "Job"
ALTER COLUMN "brokerFeeCents" SET DEFAULT 0;

ALTER TABLE "Job"
ALTER COLUMN "serviceType" SET DEFAULT 'handyman';

ALTER TABLE "Job"
ALTER COLUMN "currency" SET DEFAULT 'USD'::"CurrencyCode";

