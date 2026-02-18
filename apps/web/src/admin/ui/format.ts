import { formatMoney as formatMoneyShared, type CurrencyCode } from "@8fold/shared";

export function formatMoney(cents: number, currency: CurrencyCode): string {
  return formatMoneyShared(cents, currency);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function formatShortId(id: string): string {
  if (!id) return "—";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

