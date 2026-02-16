"use client";

type Step = {
  ok: boolean;
  reason?: string;
  missingFields?: string[];
  currentVersion?: string;
  acceptedCurrent?: boolean;
  acceptedVersion?: string | null;
};

export function OnboardingProgressBar({
  title,
  steps,
}: {
  title: string;
  steps: { tos: Step; profile: Step; verified: Step };
}) {
  const items: Array<{ key: "tos" | "profile" | "verified"; label: string; step: Step }> = [
    { key: "tos", label: "TOS", step: steps.tos },
    { key: "profile", label: "Profile", step: steps.profile },
    { key: "verified", label: "Verified", step: steps.verified },
  ];
  const done = items.filter((i) => i.step.ok).length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <div className="border border-gray-200 rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-sm text-gray-600">{pct}% complete</div>
      </div>
      <div className="mt-3 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className="h-2 bg-8fold-green" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((it) => (
          <span
            key={it.key}
            className={[
              "text-xs font-semibold px-2.5 py-1 rounded-full border",
              it.step.ok ? "bg-green-50 text-8fold-green border-green-100" : "bg-amber-50 text-amber-800 border-amber-200",
            ].join(" ")}
          >
            {it.step.ok ? "✔" : "•"} {it.label}
          </span>
        ))}
      </div>
      {!steps.profile.ok && steps.profile.missingFields?.length ? (
        <div className="mt-3 text-sm text-gray-700">
          Missing:{" "}
          <span className="font-medium">{steps.profile.missingFields.join(", ")}</span>
        </div>
      ) : null}
    </div>
  );
}

