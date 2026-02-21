import type { PMStatus } from "@8fold/shared";

export const pmBadgeClassByStatus: Record<PMStatus, string> = {
  DRAFT: "bg-gray-100 border-gray-200 text-gray-700",
  SUBMITTED: "bg-yellow-50 border-yellow-200 text-yellow-800",
  AMENDMENT_REQUESTED: "bg-amber-50 border-amber-200 text-amber-800",
  APPROVED: "bg-blue-50 border-blue-200 text-blue-800",
  PAYMENT_PENDING: "bg-indigo-50 border-indigo-200 text-indigo-800",
  FUNDED: "bg-purple-50 border-purple-200 text-purple-800",
  RECEIPTS_SUBMITTED: "bg-orange-50 border-orange-200 text-orange-800",
  VERIFIED: "bg-teal-50 border-teal-200 text-teal-800",
  RELEASED: "bg-green-50 border-green-200 text-green-800",
  CLOSED: "bg-slate-700 border-slate-700 text-white",
  REJECTED: "bg-red-50 border-red-200 text-red-800",
};

export function formatMoney(amount: number, currency = "USD"): string {
  return `${String(currency).toUpperCase() === "CAD" ? "C$" : "$"}${amount.toFixed(2)}`;
}
