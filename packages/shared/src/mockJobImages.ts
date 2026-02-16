import { TradeCategorySchema, type TradeCategory } from "./trades";

function folderForTrade(trade: TradeCategory): string {
  if (trade === "DRYWALL") return "drywall";
  if (trade === "ELECTRICAL") return "electrical";
  if (trade === "PLUMBING") return "plumbing";
  if (trade === "ROOFING") return "roofing";
  if (trade === "LANDSCAPING") return "landscaping";
  if (trade === "JUNK_REMOVAL") return "junk_removal";
  if (trade === "MOVING") return "moving";
  if (trade === "JANITORIAL_CLEANING") return "janitorial";

  // Fallback to a "closest match" folder we actually have assets for.
  return "carpentry";
}

function buildFolderImages(folder: string): string[] {
  // apps/web/public/images/jobs/<folder>/<folder><1..10>.png
  return Array.from({ length: 10 }, (_, i) => `/images/jobs/${folder}/${folder}${i + 1}.png`);
}

export const MOCK_JOB_IMAGES: Record<TradeCategory, string[]> = Object.fromEntries(
  TradeCategorySchema.options.map((t) => [t, buildFolderImages(folderForTrade(t))])
) as Record<TradeCategory, string[]>;

function shuffle<T>(arr: T[], rng: () => number): T[] {
  // Fisher–Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
  return arr;
}

/**
 * Random-ish mock image picker with a simple anti-repetition guard.
 *
 * - Uses a per {city + trade} "shuffle bag" so images rotate evenly before repeating.
 * - If it would repeat the last-used image for that {city + trade}, it re-rolls once.
 * - Uses Math.random by default; does not seed globally.
 */
export function createMockJobImagePicker(opts?: { rng?: () => number }) {
  const rng = opts?.rng ?? Math.random;
  const bagByKey = new Map<string, string[]>();
  const lastByKey = new Map<string, string>();

  return function pick(args: { tradeCategory: TradeCategory; city?: string | null }): string {
    const cityKey = String(args.city ?? "").trim().toLowerCase();
    const key = `${cityKey}|${args.tradeCategory}`;
    const pool = MOCK_JOB_IMAGES[args.tradeCategory] ?? [];
    if (pool.length === 0) return "/images/jobs/carpentry/carpentry1.png";

    let bag = bagByKey.get(key);
    if (!bag || bag.length === 0) {
      bag = shuffle([...pool], rng);
      bagByKey.set(key, bag);
    }

    let selected = bag.pop()!;
    const last = lastByKey.get(key);
    if (last && selected === last) {
      // Re-roll once (or swap with next).
      if (bag.length === 0) {
        bag = shuffle([...pool], rng);
        bagByKey.set(key, bag);
      }
      const alt = bag.pop();
      if (alt && alt !== selected) {
        bag.unshift(selected); // keep it in circulation
        selected = alt;
      } else if (pool.length > 1) {
        // deterministic fallback if bag was unlucky
        selected = pool.find((p) => p !== last) ?? selected;
      }
    }

    lastByKey.set(key, selected);
    return selected;
  };
}

