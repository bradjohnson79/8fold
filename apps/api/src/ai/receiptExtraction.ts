export type ReceiptExtractionFile = {
  originalName: string;
  mimeType: string;
  base64: string;
};

export type ReceiptExtractionInput = {
  files: ReceiptExtractionFile[];
};

export type ReceiptExtractionTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type ExtractedReceipt = {
  merchantName: string | null;
  purchaseDate: string | null;
};

export type ReceiptExtractionResult = {
  /**
   * Identifier for the extraction approach/model.
   * We keep this stable so DB rows are explainable during audits.
   */
  model: string;
  totals: ReceiptExtractionTotals;
  receipts: ExtractedReceipt[];
  /**
   * Raw extraction output for debugging/audit (JSON-serializable).
   */
  raw: unknown;
};

/**
 * Receipt totals extraction.
 *
 * This is intentionally conservative: if no extractor is configured, we return
 * deterministic zero totals and preserve basic metadata in `raw`.
 *
 * The materials receipts flow stores the raw payload and allows humans/admin
 * review; accurate extraction can be introduced later without breaking the API
 * contract.
 */
export async function extractReceiptTotals(
  input: ReceiptExtractionInput
): Promise<ReceiptExtractionResult> {
  const files = input.files ?? [];

  // Placeholder implementation: no OCR/AI configured yet in this repo state.
  // Returning zeros keeps the flow operational and deterministic.
  return {
    model: "stub:receipt-extraction:v1",
    totals: {
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
    },
    receipts: [
      {
        merchantName: null,
        purchaseDate: null,
      },
    ],
    raw: {
      kind: "stub",
      fileCount: files.length,
      files: files.map((f) => ({
        originalName: f.originalName,
        mimeType: f.mimeType,
        // Do not persist base64 in raw output (too large / sensitive).
        sizeBytesApprox: Math.floor((f.base64?.length ?? 0) * 0.75),
      })),
    },
  };
}
