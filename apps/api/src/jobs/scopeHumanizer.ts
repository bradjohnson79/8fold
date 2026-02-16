export type ScopeQuality = {
  score: number; // 0..100
  flags: string[];
};

export type ScopeRewriteInput = {
  id?: string;
  scope: string;
  tradeCategory?: string | null;
  title?: string | null;
};

export type ScopeRewriteResult = {
  scope: string;
  changed: boolean;
  reasons: string[];
  qualityBefore: ScopeQuality;
  qualityAfter: ScopeQuality;
};

const BAD_PATTERNS: Array<{ flag: string; re: RegExp; penalty: number }> = [
  { flag: "we_are_seeking", re: /\bwe\s+are\s+seeking\b/i, penalty: 24 },
  { flag: "this_job_requires", re: /\bthis\s+job\s+requires\b/i, penalty: 22 },
  { flag: "professional", re: /\bprofessional\b/i, penalty: 14 },
  { flag: "service_required", re: /\bservice\s+(required|needed)\b/i, penalty: 18 },
  { flag: "must_be", re: /\bmust\s+be\b/i, penalty: 10 },
  { flag: "ensure_that", re: /\bensure\s+that\b/i, penalty: 10 },
  { flag: "please_provide", re: /\bplease\s+provide\b/i, penalty: 10 },
  { flag: "responsibilities", re: /\bresponsibilities\b/i, penalty: 10 },
  { flag: "qualifications", re: /\bqualifications\b/i, penalty: 10 },
  { flag: "scope_of_work", re: /\bscope\s+of\s+work\b/i, penalty: 10 },
];

const INTRO_LINES = [
  /^we\s+are\s+seeking\s+.+$/i,
  /^this\s+job\s+requires\s+.+$/i,
  /^the\s+ideal\s+candidate\s+.+$/i,
  /^responsibilities\s*:\s*$/i,
  /^requirements\s*:\s*$/i,
  /^qualifications\s*:\s*$/i,
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeNewlines(s: string) {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeSpaces(s: string) {
  return s.replace(/[ \t]+/g, " ").trim();
}

function stripOuterQuotes(s: string) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("“") && t.endsWith("”")) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function splitLines(scope: string): string[] {
  return normalizeNewlines(scope)
    .split("\n")
    .map((l) => normalizeSpaces(l))
    .filter(Boolean);
}

function deDupeLines(lines: string[]): { lines: string[]; removed: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  let removed = 0;
  for (const l of lines) {
    const key = l.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
    if (!key) continue;
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    out.push(l);
  }
  return { lines: out, removed };
}

function shortenSentence(s: string) {
  let t = normalizeSpaces(s);
  t = t
    .replace(/\bwe\s+are\s+seeking\b/gi, "Need")
    .replace(/\bthis\s+job\s+requires\b/gi, "Need")
    .replace(/\bprofessional\b/gi, "")
    .replace(/\bservice\s+(required|needed)\b/gi, "")
    .replace(/\brequirements\b/gi, "")
    .replace(/\bqualifications\b/gi, "")
    .replace(/\bresponsibilities\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Remove trailing corporate punctuation.
  t = t.replace(/\s*[:\-–—]\s*$/, "").trim();
  return t;
}

function toQuickHumanParagraph(lines: string[], maxLines: number) {
  // Prefer short bullet-ish lines over long paragraph.
  const chosen: string[] = [];
  for (const l of lines) {
    const s = shortenSentence(l);
    if (!s) continue;
    chosen.push(s);
    if (chosen.length >= maxLines) break;
  }
  return chosen.join("\n");
}

function scoreRepetition(scope: string): number {
  const s = normalizeSpaces(scope.toLowerCase());
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 20) return 0;
  const starts = splitLines(scope).map((l) => l.split(" ").slice(0, 2).join(" ").toLowerCase());
  const counts = new Map<string, number>();
  for (const st of starts) counts.set(st, (counts.get(st) ?? 0) + 1);
  const worst = Math.max(0, ...Array.from(counts.values()));
  return worst >= 3 ? 10 : worst === 2 ? 5 : 0;
}

export function scopeQualityScore(scope: string): ScopeQuality {
  const raw = stripOuterQuotes(String(scope ?? ""));
  const s = normalizeNewlines(raw).trim();
  const flags: string[] = [];
  let score = 100;

  for (const rule of BAD_PATTERNS) {
    if (rule.re.test(s)) {
      flags.push(rule.flag);
      score -= rule.penalty;
    }
  }

  const lineCount = splitLines(s).length;
  if (s.length > 1200) {
    flags.push("too_long");
    score -= 12;
  } else if (s.length > 800) {
    flags.push("long");
    score -= 6;
  }

  if (lineCount >= 10) {
    flags.push("wall_of_text");
    score -= 8;
  }

  const rep = scoreRepetition(s);
  if (rep) {
    flags.push("repetitive");
    score -= rep;
  }

  return { score: clamp(score, 0, 100), flags };
}

export function rewriteJobScope(input: ScopeRewriteInput): ScopeRewriteResult {
  const before = normalizeNewlines(stripOuterQuotes(input.scope ?? "")).trim();
  const qualityBefore = scopeQualityScore(before);
  const reasons: string[] = [];

  if (!before) {
    return {
      scope: before,
      changed: false,
      reasons: [],
      qualityBefore,
      qualityAfter: qualityBefore,
    };
  }

  let lines = splitLines(before);

  // Remove obvious corporate intro lines.
  const origLen = lines.length;
  lines = lines.filter((l) => !INTRO_LINES.some((re) => re.test(l)));
  if (lines.length !== origLen) reasons.push("remove_intro_templates");

  // If it was a single long paragraph, split into shorter sentences.
  if (lines.length <= 2 && before.length > 240) {
    const parts = before
      .replace(/\n+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((p) => normalizeSpaces(p))
      .filter(Boolean);
    if (parts.length > lines.length) {
      lines = parts;
      reasons.push("split_into_sentences");
    }
  }

  // Deduplicate repeated lines.
  const deduped = deDupeLines(lines);
  lines = deduped.lines;
  if (deduped.removed > 0) reasons.push("dedupe_repeated_lines");

  // Convert to a quick, human paragraph (max 4 lines).
  let out = toQuickHumanParagraph(lines, 4);
  if (out !== before) reasons.push("shorten_and_humanize");

  // Final cleanup: avoid being overly formal; keep it “typed in 30 seconds”.
  out = out
    .replace(/\bplease\s+/gi, "")
    .replace(/\bkindly\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Hard cap to keep it snappy.
  if (out.length > 600) {
    out = out.slice(0, 600).trim();
    reasons.push("cap_length");
  }

  // Guard: never blank the scope.
  if (!out) out = before;

  const qualityAfter = scopeQualityScore(out);
  return {
    scope: out,
    changed: out !== before,
    reasons: out !== before ? reasons : [],
    qualityBefore,
    qualityAfter,
  };
}

