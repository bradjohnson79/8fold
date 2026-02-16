"use client";

export function TermsCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-4 flex items-start gap-3 text-sm text-gray-700">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I agree to the updated Terms &amp; Conditions for pricing and payments.{" "}
        <a className="text-8fold-green font-semibold" href="/app/job-poster/tos" target="_blank">
          Read terms
        </a>
        .
      </span>
    </label>
  );
}

