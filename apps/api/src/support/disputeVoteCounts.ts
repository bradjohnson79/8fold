/**
 * Pure vote-counting logic for dispute resolution.
 * Used by resolve route and tests.
 */
export type VoteRow = {
  voterType: string;
  voterUserId: string | null;
  status: string;
  vote: string;
  createdAt: Date;
};

export type ComputeResult = {
  counted: string[];
  counts: Map<string, number>;
  top: [string, number] | null;
  second: [string, number] | null;
  humanCount: number;
  isTie: boolean;
  hasMajority: boolean;
};

export function computeDisputeVoteCounts(votes: VoteRow[]): ComputeResult {
  const human = votes.filter((v) => v.voterType === "ADMIN" || v.voterType === "SENIOR_ROUTER");
  const humanDistinct = new Map<string, string>();
  for (const v of human) {
    if (!v.voterUserId) continue;
    if (!humanDistinct.has(v.voterUserId)) humanDistinct.set(v.voterUserId, v.vote);
  }

  const aiActive = votes
    .filter((v) => v.voterType === "AI_ADVISORY" && String(v.status ?? "ACTIVE") === "ACTIVE")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  const counted: string[] = [...humanDistinct.values()];
  if (aiActive?.vote) counted.push(aiActive.vote);

  const counts = new Map<string, number>();
  for (const v of counted) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted[0] ?? null;
  const second = sorted[1] ?? null;

  return {
    counted,
    counts,
    top,
    second,
    humanCount: humanDistinct.size,
    isTie: Boolean(second && top && second[1] === top[1]),
    hasMajority: Boolean(top && top[1] > counted.length / 2),
  };
}
