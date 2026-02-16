import { z } from "zod";
import { TradeCategorySchema } from "./trades";

export const ContractorStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type ContractorStatus = z.infer<typeof ContractorStatusSchema>;

const NonEmptyTrimmedString = z.string().trim().min(1);

export const ContractorCreateInputSchema = z.object({
  businessName: NonEmptyTrimmedString,
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  country: z.enum(["CA", "US"]),
  regionCode: z.string().trim().length(2),
  trade: z.enum([
    "JUNK_REMOVAL",
    "YARDWORK_GROUNDSKEEPING",
    "CARPENTRY",
    "DRYWALL",
    "ROOFING",
    "PLUMBING",
    "ELECTRICAL",
    "WELDING"
  ]),

  // v1 controlled categories (multi-select). If omitted, API will derive from `trade` for backward compatibility.
  tradeCategories: TradeCategorySchema.array().min(1).optional(),

  // Admin-gated: must be enabled to receive AUTOMOTIVE jobs.
  automotiveEnabled: z.boolean().optional()
});
export type ContractorCreateInput = z.infer<typeof ContractorCreateInputSchema>;

export const ContractorUpdateInputSchema = ContractorCreateInputSchema.partial();
export type ContractorUpdateInput = z.infer<typeof ContractorUpdateInputSchema>;

export const ContractorListQuerySchema = z.object({
  status: ContractorStatusSchema.optional(),
  q: z.string().trim().optional()
});
export type ContractorListQuery = z.infer<typeof ContractorListQuerySchema>;

