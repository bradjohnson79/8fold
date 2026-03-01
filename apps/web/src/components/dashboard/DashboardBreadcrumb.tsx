"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

function titleCase(input: string): string {
  return input
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveLabel(pathname: string, items: NavItem[]): string {
  let best: NavItem | null = null;
  for (const item of items) {
    const exact = pathname === item.href;
    const nested = pathname.startsWith(item.href + "/");
    if (!exact && !nested) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  if (best) return best.label;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 2) return "Overview";
  return titleCase(segments[segments.length - 1] ?? "");
}

export function DashboardBreadcrumb({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/dashboard/")) return null;
  const label = resolveLabel(pathname, items);
  const role = pathname.split("/").filter(Boolean)[1] ?? "";
  const overviewHref = role ? `/dashboard/${role}` : "/dashboard";

  return (
    <nav aria-label="Breadcrumb" className="mt-4 text-sm text-slate-600">
      <Link href={overviewHref} className="font-medium text-slate-700 hover:underline">Dashboard</Link>
      <span className="mx-2 text-slate-400">&gt;</span>
      <span className="text-slate-900">{label}</span>
    </nav>
  );
}
