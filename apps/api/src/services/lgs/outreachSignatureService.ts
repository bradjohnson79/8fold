/**
 * LGS Outreach: Appends Brad Johnson signature to email body.
 * Used when enqueueing and when sending.
 */
const SIGNATURE_BLOCK = `
Brad Johnson
Chief Operating Officer
https://8fold.app
info@8fold.app`;

export function appendSignature(body: string): string {
  const trimmed = body.trim();
  if (!trimmed.endsWith("Best,")) {
    return `${trimmed}\n\nBest,${SIGNATURE_BLOCK}`;
  }
  return `${trimmed}${SIGNATURE_BLOCK}`;
}
