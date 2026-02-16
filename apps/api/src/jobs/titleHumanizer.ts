type TradeCategory =
  | "PLUMBING"
  | "ELECTRICAL"
  | "HVAC"
  | "APPLIANCE"
  | "HANDYMAN"
  | "PAINTING"
  | "CARPENTRY"
  | "DRYWALL"
  | "ROOFING"
  | "JANITORIAL_CLEANING"
  | "LANDSCAPING"
  | "FENCING"
  | "SNOW_REMOVAL"
  | "JUNK_REMOVAL"
  | "MOVING"
  | "FURNITURE_ASSEMBLY"
  | "AUTOMOTIVE"
  | string;

export type TitleQuality = {
  score: number; // 0..100
  flags: string[];
};

export type RewriteInput = {
  id?: string;
  title: string;
  scope?: string | null;
  tradeCategory?: TradeCategory | null;
  junkHaulingItems?: unknown;
};

export type RewriteResult = {
  title: string;
  changed: boolean;
  reasons: string[];
  qualityBefore: TitleQuality;
  qualityAfter: TitleQuality;
  suggestedFrom?: "junk_items" | "scope_snippet" | "template_rewrite";
};

const CORPORATE_FLAGS: Array<{ flag: string; re: RegExp; penalty: number }> = [
  { flag: "professional", re: /\bprofessional\b/i, penalty: 18 },
  { flag: "service_required", re: /\bservice\s+(required|needed)\b/i, penalty: 22 },
  { flag: "seeking", re: /\bseeking\b/i, penalty: 14 },
  { flag: "experienced", re: /\bexperienced\b/i, penalty: 16 },
  { flag: "contractor_needed", re: /\bcontractor\s+needed\b/i, penalty: 18 },
  { flag: "residential", re: /\bresidential\b/i, penalty: 8 },
  { flag: "commercial", re: /\bcommercial\b/i, penalty: 8 },
  { flag: "installation_needed", re: /\binstallation\s+needed\b/i, penalty: 10 },
  { flag: "required", re: /\brequired\b/i, penalty: 8 },
  { flag: "needed", re: /\bneeded\b/i, penalty: 6 },
];

const TEMPLATE_STARTERS: Array<{ re: RegExp; replace: (m: RegExpMatchArray) => string; reason: string }> = [
  {
    re: /^looking\s+for\s+(an?\s+)?experienced\s+contractor\s+needed\s+for\s+(.+)$/i,
    replace: (m) => `Need help with ${m[2]}`.trim(),
    reason: "rewrite_looking_for_experienced_contractor",
  },
  {
    re: /^experienced\s+contractor\s+needed\s+for\s+(.+)$/i,
    replace: (m) => `Need help with ${m[1]}`.trim(),
    reason: "rewrite_experienced_contractor_needed",
  },
  {
    re: /^(residential|commercial)\s+(.+)\s+service\s+(required|needed)$/i,
    replace: (m) => `Need help with ${m[2]}`.trim(),
    reason: "rewrite_residential_commercial_service_required",
  },
];

const TRADE_PHRASES: Record<string, string> = {
  PLUMBING: "plumbing",
  ELECTRICAL: "electrical work",
  HVAC: "HVAC repair",
  APPLIANCE: "appliance repair",
  HANDYMAN: "handyman help",
  PAINTING: "painting",
  CARPENTRY: "carpentry work",
  DRYWALL: "drywall repair",
  ROOFING: "roof repair",
  JANITORIAL_CLEANING: "cleaning help",
  LANDSCAPING: "yard work",
  FENCING: "fence repair",
  SNOW_REMOVAL: "snow removal",
  JUNK_REMOVAL: "junk removal",
  MOVING: "moving help",
  FURNITURE_ASSEMBLY: "furniture assembly",
  AUTOMOTIVE: "auto repair",
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function stripOuterQuotes(s: string) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("“") && t.endsWith("”")) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function titleCaseFirst(s: string) {
  const t = s.trim();
  if (!t) return t;
  return t[0]!.toUpperCase() + t.slice(1);
}

function shorten(s: string, maxLen: number) {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
}

function firstSentence(scope: string, maxLen = 90): string | null {
  const raw = normalizeSpaces(scope.replace(/\r/g, "\n"));
  if (!raw) return null;
  const split = raw.split(/\n|\. |\.$/)[0] ?? raw;
  const s = normalizeSpaces(split);
  if (!s) return null;
  return shorten(s, maxLen);
}

function looksHumanSnippet(s: string): boolean {
  const t = s.toLowerCase();
  if (t.length < 18) return false;
  // Human-ish verbs and pronouns, slightly imperfect phrasing allowed.
  return /\b(need|looking|help|can someone|could someone|please|want)\b/.test(t);
}

function pluralize(word: string, qty: number) {
  const w = normalizeSpaces(word);
  if (qty === 1) return w;
  if (!w) return w;
  if (w.endsWith("s")) return w;
  return `${w}s`;
}

function formatItem(it: any): string | null {
  const item = typeof it?.item === "string" ? it.item.trim() : typeof it?.description === "string" ? it.description.trim() : "";
  if (!item) return null;
  const qRaw = it?.quantity;
  const qty = typeof qRaw === "number" && Number.isFinite(qRaw) ? Math.max(1, Math.floor(qRaw)) : 1;
  if (qty === 1) return item;
  return `${qty} ${pluralize(item, qty)}`;
}

function extractJunkItems(junkHaulingItems: unknown, max = 4): string[] {
  if (!Array.isArray(junkHaulingItems)) return [];
  const out: string[] = [];
  for (const it of junkHaulingItems) {
    const s = formatItem(it);
    if (!s) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function titleQualityScore(title: string): TitleQuality {
  const t = normalizeSpaces(stripOuterQuotes(title));
  const flags: string[] = [];
  let score = 100;

  for (const rule of CORPORATE_FLAGS) {
    if (rule.re.test(t)) {
      flags.push(rule.flag);
      score -= rule.penalty;
    }
  }

  if (t.length > 80) {
    flags.push("too_long");
    score -= 8;
  }
  if (/^[A-Z\s0-9]+$/.test(t) && t.length >= 10) {
    flags.push("shouty");
    score -= 8;
  }
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){4,}/.test(t)) {
    flags.push("titlecase_template");
    score -= 6;
  }

  return { score: clamp(score, 0, 100), flags };
}

export function rewriteJobTitle(input: RewriteInput): RewriteResult {
  const before = normalizeSpaces(stripOuterQuotes(input.title));
  const qualityBefore = titleQualityScore(before);
  const reasons: string[] = [];

  // 1) Best-case deterministic: junk hauling items → specific, human title.
  const trade = (input.tradeCategory ?? "").toString().toUpperCase();
  if (trade === "JUNK_REMOVAL") {
    const items = extractJunkItems(input.junkHaulingItems, 4);
    if (items.length > 0) {
      let human = "";
      if (items.length === 1) human = `Need ${items[0]} removed`;
      else if (items.length === 2) human = `Need ${items[0]} & ${items[1]} removed`;
      else {
        const head = items.slice(0, items.length - 1).join(", ");
        const tail = items[items.length - 1];
        human = `Need ${head} & ${tail} removed`;
      }
      human = titleCaseFirst(human);
      const after = shorten(human, 90);
      const qualityAfter = titleQualityScore(after);
      return {
        title: after,
        changed: after !== before,
        reasons: after !== before ? ["rewrite_from_junk_items"] : [],
        qualityBefore,
        qualityAfter,
        suggestedFrom: "junk_items",
      };
    }
  }

  // 2) Rewrite obvious template starters.
  let t = before;
  for (const rule of TEMPLATE_STARTERS) {
    const m = t.match(rule.re);
    if (m) {
      t = rule.replace(m);
      reasons.push(rule.reason);
      break;
    }
  }

  // 3) Strip filler words/phrases (deterministic).
  const origT = t;
  t = normalizeSpaces(t)
    .replace(/^\b(professional|experienced)\b\s+/i, "")
    .replace(/^\b(residential|commercial)\b\s+/i, "")
    .replace(/\bservice\s+(required|needed)\b/gi, "")
    .replace(/\b(required)\b/gi, "")
    .replace(/\bneeded\b/gi, "")
    .replace(/\s+for\s+carpentry$/i, " for carpentry")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t !== origT) reasons.push("strip_corporate_filler");

  // 4) Normalize common constructions.
  const origT2 = t;
  t = t
    .replace(/\binstallation\s+needed\b/i, "installation")
    .replace(/\bservice\b/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t !== origT2) reasons.push("normalize_construction");

  // 5) If still generic, try a scope snippet.
  const scopeSnippet = input.scope ? firstSentence(String(input.scope), 90) : null;
  if (scopeSnippet && looksHumanSnippet(scopeSnippet) && (qualityBefore.flags.length > 0 || t.length < 18)) {
    const after = titleCaseFirst(scopeSnippet.replace(/[.。]\s*$/, ""));
    const qualityAfter = titleQualityScore(after);
    return {
      title: after,
      changed: after !== before,
      reasons: after !== before ? [...reasons, "use_scope_snippet"] : [],
      qualityBefore,
      qualityAfter,
      suggestedFrom: "scope_snippet",
    };
  }

  // 6) Ensure human-ish prefix if we stripped too much.
  let out = t;
  if (!out || out.length < 8) {
    const phrase = TRADE_PHRASES[trade] ?? "help";
    out = `Need help with ${phrase}`;
    reasons.push("fallback_trade_phrase");
  } else if (!/^(need|looking|help|want)\b/i.test(out)) {
    // If it reads like a noun phrase, add a natural prefix.
    if (out.length < 55) {
      out = `Need help with ${out}`;
      reasons.push("add_need_help_prefix");
    }
  }

  out = normalizeSpaces(out).replace(/\s+:\s+/g, ": ").replace(/\s+,\s+/g, ", ").replace(/\s+&\s+/g, " & ");
  out = out.replace(/[.。]\s*$/, "");
  out = titleCaseFirst(out);
  out = shorten(out, 90);

  const qualityAfter = titleQualityScore(out);
  return {
    title: out,
    changed: out !== before,
    reasons: out !== before ? reasons : [],
    qualityBefore,
    qualityAfter,
    suggestedFrom: reasons.length ? "template_rewrite" : undefined,
  };
}

