import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { assertNotProductionSeed } from "./_seedGuard";

// Manual-only, deterministic seed. No cron, no auto-growth.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_ENV_PATH = path.join(SCRIPT_DIR, "..", ".env.local");
dotenv.config({ path: API_ENV_PATH });

const MOCK_SEED_BATCH = "north_america_v1";

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  if (!fs.existsSync(API_ENV_PATH)) throw new Error("DATABASE_URL not set and apps/api/.env.local not found");
  const txt = fs.readFileSync(API_ENV_PATH, "utf8");
  const m = txt.match(/^DATABASE_URL\\s*=\\s*(.+)$/m);
  if (!m) throw new Error("DATABASE_URL missing in apps/api/.env.local");
  process.env.DATABASE_URL = m[1].trim();
}

function sha1Hex(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function uuidFromSeed(seed: string): string {
  // Deterministic UUID-ish value derived from SHA1.
  // We format as UUIDv5-like, but we don't strictly enforce version bits.
  const h = sha1Hex(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 80);
}

function intFromSeed(seed: string, mod: number): number {
  const h = sha1Hex(seed);
  const n = parseInt(h.slice(0, 8), 16);
  return mod > 0 ? n % mod : n;
}

function pick<T>(arr: T[], seed: string): T {
  if (arr.length === 0) throw new Error("pick() called with empty array");
  return arr[intFromSeed(seed, arr.length)] as T;
}

function randomRecentDate(seed: string, now = new Date()): Date {
  // Deterministic within last 90 days.
  const daysAgo = intFromSeed(seed, 90); // 0-89
  const minutes = intFromSeed(`${seed}:m`, 24 * 60);
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000 - minutes * 60 * 1000);
  return d;
}

function moneyForCategory(tradeCategory: string, seed: string): number {
  // Returns laborTotalCents.
  const s = tradeCategory.toUpperCase();
  const base =
    s === "ROOFING"
      ? 85000
      : s === "PLUMBING"
        ? 42000
        : s === "ELECTRICAL"
          ? 38000
          : s === "MOVING"
            ? 65000
            : s === "LANDSCAPING"
              ? 32000
              : s === "JUNK_REMOVAL"
                ? 28000
                : s === "DRYWALL"
                  ? 30000
                  : s === "CARPENTRY"
                    ? 36000
                    : s === "JANITORIAL_CLEANING"
                      ? 18000
                      : s === "FURNITURE_ASSEMBLY"
                        ? 22000
                        : 25000;
  const variance = 0.6 + intFromSeed(`${seed}:v`, 70) / 100; // 0.6 - 1.29
  const cents = Math.max(12000, Math.round(base * variance));
  // Round to nearest $5 for nicer cards.
  return Math.round(cents / 500) * 500;
}

function titleForCategory(tradeCategory: string, city: string, seed: string): { title: string; scope: string } {
  const s = tradeCategory.toUpperCase();
  const accents = [
    "this week",
    "asap",
    "before weekend",
    "two-hour window",
    "simple, no surprises",
    "small job",
    "quick turnaround",
  ];
  const accent = pick(accents, `${seed}:accent`);

  if (s === "PLUMBING") {
    const titles = ["Fix leaking faucet", "Unclog kitchen sink", "Replace toilet fill valve", "Install new showerhead"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Basic residential plumbing task. Access to shutoff available. No emergency flooding." };
  }
  if (s === "ELECTRICAL") {
    const titles = ["Replace 2 light switches", "Install ceiling light fixture", "Outlet not working", "Add dimmer switch"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Small electrical scope. Breaker panel accessible. No panel work required." };
  }
  if (s === "ROOFING") {
    const titles = ["Minor roof leak check", "Replace 6 shingles", "Seal flashing around vent", "Gutter downspout repair"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Small exterior repair. Ladder access available. Weather-dependent." };
  }
  if (s === "CARPENTRY") {
    const titles = ["Repair fence gate latch", "Hang interior door", "Replace baseboard section", "Patch deck board"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Light carpentry scope. Bring standard hand tools. Materials not included unless specified." };
  }
  if (s === "DRYWALL") {
    const titles = ["Patch 2 drywall holes", "Repair corner bead", "Fix nail pops", "Small ceiling patch"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Drywall patch + basic sand/finish. Paint touch-up not required unless noted." };
  }
  if (s === "LANDSCAPING") {
    const titles = ["Spring yard cleanup", "Trim hedges (front yard)", "Weed + mulch refresh", "Small sod patch"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Light yardwork. Green bin access available. No tree climbing." };
  }
  if (s === "JUNK_REMOVAL") {
    const titles = ["Remove old sofa + boxes", "Garage junk haul", "Dispose of broken furniture", "Appliance haul-away"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Haul-away. Access is ground-floor or driveway. Disposal fees included in price." };
  }
  if (s === "MOVING") {
    const titles = ["Load U-Haul (2 hours)", "Move 1-bedroom items", "Help move heavy dresser", "Unload small storage unit"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Moving help only. Customer provides vehicle. Stairs may be involved." };
  }
  if (s === "JANITORIAL_CLEANING") {
    const titles = ["Deep clean (2 bed / 1 bath)", "Move-out cleaning", "Office cleanup (small)", "Kitchen + bathroom clean"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Standard cleaning. No hazardous materials. Bring basic supplies." };
  }
  if (s === "FURNITURE_ASSEMBLY") {
    const titles = ["Assemble IKEA dresser", "Assemble bed frame", "Mount shelves (2)", "Assemble desk + chair"];
    const title = `${city}: ${pick(titles, seed)} (${accent})`;
    return { title, scope: "Furniture assembly. Hardware provided. Basic wall mounting only." };
  }

  const title = `${city}: Home service job (${accent})`;
  return { title, scope: "General home service scope. Details provided after routing." };
}

function coordsFor(country: "US" | "CA", seed: string): { lat: number; lng: number } {
  // Deterministic pseudo-coordinates within broad country bounding boxes.
  if (country === "US") {
    const lat = 25 + (intFromSeed(`${seed}:lat`, 24000) / 1000); // 25 - 49
    const lng = -124 + (intFromSeed(`${seed}:lng`, 57000) / 1000); // -124 - -67
    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  }
  const lat = 43 + (intFromSeed(`${seed}:lat`, 17000) / 1000); // 43 - 60
  const lng = -140 + (intFromSeed(`${seed}:lng`, 88000) / 1000); // -140 - -52
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

function addressFor(seed: string): { postalCode: string; addressFull: string } {
  const nums = 100 + intFromSeed(`${seed}:n`, 9900);
  const streets = ["Main St", "Oak Ave", "Pine St", "Maple Dr", "2nd St", "Park Blvd", "Cedar Ln", "Hillcrest Rd"];
  const street = pick(streets, `${seed}:street`);
  const addressFull = `${nums} ${street}`;
  // Not meant to be real mail; just stable.
  const postalCode = String(10000 + intFromSeed(`${seed}:pc`, 89999));
  return { postalCode, addressFull };
}

async function main() {
  assertNotProductionSeed("seed-mock-jobs.ts");
  ensureDatabaseUrl();

  const argv = process.argv.slice(2);
  const shouldReset = argv.includes("--reset");

  const { assertDevelopmentMocksEnabled } = await import("../src/config/developmentMocks");
  assertDevelopmentMocksEnabled("seed:mock-jobs");

  const { sql } = await import("drizzle-orm");
  const { db } = await import("../db/drizzle");
  const { jobs } = await import("../db/schema/job");
  const { jobPhotos } = await import("../db/schema/jobPhoto");
  const { getRegionDatasets } = await import("../src/locations/datasets");

  const US_STATE_CODES_50 = new Set([
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
    "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  ]);

  const CA_PROVINCE_CODES_10 = new Set([
    "AB","BC","MB","NB","NL","NS","ON","PE","QC","SK",
  ]);

  // Safety: require mockSeedBatch column to exist (migration must be applied).
  const colCheck = await db.execute(
    sql`select 1 as ok
        from information_schema.columns
        where table_schema = '8fold_test'
          and table_name = 'Job'
          and column_name = 'mockSeedBatch'
        limit 1`,
  );
  const colOk = Array.isArray((colCheck as any)?.rows) ? (colCheck as any).rows.length > 0 : false;
  if (!colOk) {
    throw new Error(
      `Missing Job.mockSeedBatch column. Apply migration drizzle/0037_mock_jobs_north_america_v1.sql, then rerun.`,
    );
  }

  if (shouldReset) {
    // Delete photos first (FK-safe), then jobs. Only touches this batch.
    await db.execute(
      sql`delete from "8fold_test"."JobPhoto"
          where "jobId" in (
            select id from "8fold_test"."Job"
            where "isMock" = true and "mockSeedBatch" = ${MOCK_SEED_BATCH}
          )`,
    );
    await db.execute(
      sql`delete from "8fold_test"."Job"
          where "isMock" = true and "mockSeedBatch" = ${MOCK_SEED_BATCH}`,
    );
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, reset: true, batch: MOCK_SEED_BATCH }, null, 2));
    return;
  }

  // Load available local job images (served by apps/web).
  const webJobsImagesRoot = path.join(SCRIPT_DIR, "..", "..", "web", "public", "images", "jobs");
  const imageCategoryFolders = [
    "carpentry",
    "drywall",
    "electrical",
    "furniture_assembly",
    "janitorial",
    "junk_removal",
    "landscaping",
    "moving",
    "plumbing",
    "roofing",
  ];
  const tradeToFolder: Record<string, string> = {
    CARPENTRY: "carpentry",
    DRYWALL: "drywall",
    ELECTRICAL: "electrical",
    FURNITURE_ASSEMBLY: "furniture_assembly",
    JANITORIAL_CLEANING: "janitorial",
    JUNK_REMOVAL: "junk_removal",
    LANDSCAPING: "landscaping",
    MOVING: "moving",
    PLUMBING: "plumbing",
    ROOFING: "roofing",
  };

  const folderFiles: Record<string, string[]> = {};
  for (const folder of imageCategoryFolders) {
    const dir = path.join(webJobsImagesRoot, folder);
    const files = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith(".png") || f.toLowerCase().endsWith(".jpg") || f.toLowerCase().endsWith(".jpeg"))
          .sort()
      : [];
    folderFiles[folder] = files;
  }

  const datasets = getRegionDatasets();
  const regions: Array<{ country: "US" | "CA"; regionCode: string; regionName: string; cities: string[] }> = [];
  for (const d of datasets) {
    for (const r of d.regions) {
      const country = d.country as "US" | "CA";
      const rc = String(r.regionCode ?? "").trim().toUpperCase();
      if (!rc) continue;
      if (country === "US" && !US_STATE_CODES_50.has(rc)) continue;
      if (country === "CA" && !CA_PROVINCE_CODES_10.has(rc)) continue;
      regions.push({ country, regionCode: rc, regionName: r.regionName, cities: r.cities ?? [] });
    }
  }

  const now = new Date();
  const jobsToInsert: any[] = [];
  const photosToInsert: any[] = [];

  for (const r of regions) {
    const regionCode = String(r.regionCode).trim().toUpperCase();
    const country = r.country;
    const currency = country === "CA" ? "CAD" : "USD";
    const paymentCurrency = country === "CA" ? "cad" : "usd";

    const cities = (r.cities ?? []).filter(Boolean);
    const baseCities = cities.length >= 6 ? cities.slice(0, 6) : [...cities];
    while (baseCities.length < 6) baseCities.push(`${r.regionName} City ${baseCities.length + 1}`);

    for (const city of baseCities) {
      const count = 15 + intFromSeed(`${MOCK_SEED_BATCH}:${country}:${regionCode}:${city}:count`, 16); // 15-30
      for (let i = 0; i < count; i++) {
        const seed = `${MOCK_SEED_BATCH}:${country}:${regionCode}:${city}:${i}`;
        const id = uuidFromSeed(`job:${seed}`);

        // 80% of jobs use categories that have local images.
        const withImage = intFromSeed(`${seed}:img`, 100) < 80;
        const imageCategory = pick(Object.keys(tradeToFolder), `${seed}:imgcat`);
        const tradeCategory = withImage ? imageCategory : pick([...Object.keys(tradeToFolder), "HANDYMAN", "PAINTING", "HVAC"], `${seed}:cat`);

        const { title, scope } = titleForCategory(tradeCategory, city, seed);
        const laborTotalCents = moneyForCategory(tradeCategory, seed);

        // Splits: router 15%, contractor 75%, platform remainder.
        const routerEarningsCents = Math.round(laborTotalCents * 0.15);
        const contractorPayoutCents = Math.round(laborTotalCents * 0.75);
        const brokerFeeCents = Math.max(0, laborTotalCents - routerEarningsCents - contractorPayoutCents);

        const createdAt = randomRecentDate(seed, now);
        const publishedAt = createdAt;
        const postedAt = createdAt;

        const { lat, lng } = coordsFor(country, seed);
        const { postalCode, addressFull } = addressFor(seed);

        const regionSlug = `${slugify(city)}-${regionCode.toLowerCase()}`;
        const jobType = intFromSeed(`${seed}:type`, 100) < 12 ? "regional" : "urban";

        jobsToInsert.push({
          id,
          mockSeedBatch: MOCK_SEED_BATCH,
          isMock: true,
          jobSource: "MOCK",
          archived: false,

          status: "ASSIGNED",
          routingStatus: "ROUTED_BY_ROUTER",

          title,
          scope,
          region: regionSlug,
          country,
          currency,
          paymentCurrency,
          regionCode,
          regionName: r.regionName,
          city,
          postalCode,
          addressFull,
          tradeCategory,
          serviceType: String(tradeCategory).toLowerCase().replace(/_/g, " "),
          jobType,
          lat,
          lng,

          laborTotalCents,
          materialsTotalCents: 0,
          transactionFeeCents: 0,
          routerEarningsCents,
          contractorPayoutCents,
          brokerFeeCents,
          amountCents: laborTotalCents,

          publicStatus: "IN_PROGRESS",
          createdAt,
          publishedAt,
          postedAt,
          updatedAt: createdAt,
          routedAt: createdAt,
          firstRoutedAt: createdAt,
        });

        if (withImage) {
          const folder = tradeToFolder[String(tradeCategory).toUpperCase()] ?? null;
          const files = folder ? folderFiles[folder] ?? [] : [];
          if (folder && files.length) {
            const f = pick(files, `${seed}:file`);
            const url = `/images/jobs/${folder}/${f}`;
            photosToInsert.push({
              id: uuidFromSeed(`photo:${seed}`),
              jobId: id,
              kind: "CUSTOMER_SCOPE",
              actor: "CUSTOMER",
              url,
              metadata: { mockSeedBatch: MOCK_SEED_BATCH, country, regionCode, city, tradeCategory } as any,
              createdAt,
            });
          }
        }
      }
    }
  }

  // Insert in batches (idempotent via deterministic ids + onConflictDoNothing).
  const BATCH = 500;
  let insertedJobs = 0;
  for (let i = 0; i < jobsToInsert.length; i += BATCH) {
    const batch = jobsToInsert.slice(i, i + BATCH);
    const res = await db.insert(jobs).values(batch as any).onConflictDoNothing();
    insertedJobs += Number((res as any)?.rowCount ?? 0);
  }

  let insertedPhotos = 0;
  for (let i = 0; i < photosToInsert.length; i += BATCH) {
    const batch = photosToInsert.slice(i, i + BATCH);
    const res = await db.insert(jobPhotos).values(batch as any).onConflictDoNothing();
    insertedPhotos += Number((res as any)?.rowCount ?? 0);
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        batch: MOCK_SEED_BATCH,
        plannedJobs: jobsToInsert.length,
        plannedPhotos: photosToInsert.length,
        insertedJobs,
        insertedPhotos,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

