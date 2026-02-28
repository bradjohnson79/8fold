"use client";

import Link from "next/link";
import { stepHref, stepLabel, type CompletionRole, type MissingStep } from "@/lib/accountIncomplete";

export function AccountIncompleteModal({
  role,
  missing,
  open,
  onClose,
}: {
  role: CompletionRole;
  missing: MissingStep[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const uniqueMissing = Array.from(new Set(missing));
  const primaryHref = stepHref(role, uniqueMissing[0] ?? "PROFILE");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" aria-modal="true" role="dialog">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-xl font-semibold text-slate-900">Complete Your Setup</h3>
        <p className="mt-2 text-sm text-slate-600">
          You&apos;re almost ready. Please complete the remaining steps before continuing.
        </p>

        <ul className="mt-4 space-y-2">
          {uniqueMissing.map((step) => (
            <li key={step}>
              <Link
                href={stepHref(role, step)}
                className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {stepLabel(step)}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <Link
            href={primaryHref}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Complete Now
          </Link>
        </div>
      </div>
    </div>
  );
}

