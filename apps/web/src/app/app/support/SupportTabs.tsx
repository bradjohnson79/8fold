"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function supportBase(pathname: string): string {
  const idx = pathname.indexOf("/support");
  if (idx < 0) return "/app/support";
  return pathname.slice(0, idx) + "/support";
}

export function SupportTabs({ showDisputes }: { showDisputes: boolean }) {
  const path = usePathname();
  const base = supportBase(path);
  const onTickets = path.includes("/support/tickets") || path.includes("/support/history") || path === base;
  const onDisputes = path.includes("/support/disputes") || path.includes("/support/dispute");

  const tabClass = (active: boolean) =>
    active
      ? "inline-flex items-center px-3 py-2 rounded-lg bg-gray-900 text-white font-semibold text-sm"
      : "inline-flex items-center px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-900 font-semibold text-sm hover:bg-gray-50";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link href={`${base}/tickets`} className={tabClass(onTickets)}>
        Tickets
      </Link>
      {showDisputes ? (
        <Link href={`${base}/disputes`} className={tabClass(onDisputes)}>
          Disputes
        </Link>
      ) : null}
    </div>
  );
}

