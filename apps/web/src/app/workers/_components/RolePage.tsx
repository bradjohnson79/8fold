import Link from "next/link";

export type RolePageProps = {
  roleTitle: string;
  valueProp: string;
  whoItsFor: string;
  responsibilities: string[];
  notResponsibleFor: string[];
  paidSummary: string;
  payoutTiming: string[];
  perks: string[];
  whyDifferent: string[];
  ctaLabel: string;
  ctaHref: string;
};

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border border-gray-200 rounded-2xl p-12 bg-gray-50">
      <h2 className="text-3xl font-bold text-gray-900">{props.title}</h2>
      <div className="mt-6 text-gray-700 text-lg leading-relaxed">{props.children}</div>
    </section>
  );
}

export function RolePage(props: RolePageProps) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-500">Workers</div>
          <h1 className="text-5xl font-bold text-gray-900 mt-3">{props.roleTitle}</h1>
          <p className="text-xl text-gray-700 mt-6 max-w-3xl mx-auto">{props.valueProp}</p>
          <p className="text-sm text-gray-500 mt-4 max-w-3xl mx-auto">{props.whoItsFor}</p>
        </div>

        <Panel title="What this role does">
          <ul className="list-disc ml-6 space-y-2">
            {props.responsibilities.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>

          <div className="mt-6">
            <div className="font-semibold text-gray-900">What you do not handle</div>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              {props.notResponsibleFor.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title="How you get paid">
          <p>{props.paidSummary}</p>
          <div className="mt-5">
            <div className="font-semibold text-gray-900">Payout methods & timing</div>
            <ul className="list-disc ml-6 mt-3 space-y-2">
              {props.payoutTiming.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="text-sm text-gray-500 mt-5">
              No income guarantees. Earnings vary by region, job availability, and successful completion.
            </p>
          </div>
        </Panel>

        <Panel title="Perks & protections">
          <ul className="list-disc ml-6 space-y-2">
            {props.perks.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="Why 8Fold is different">
          <ul className="list-disc ml-6 space-y-2">
            {props.whyDifferent.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-6 text-gray-600">
            We don’t name competitors because the point isn’t comparison — it’s clarity, structure, and trust.
          </p>
        </Panel>

        <section className="mt-12 border border-gray-200 rounded-2xl p-12">
          <h2 className="text-3xl font-bold text-gray-900">Ready to get started?</h2>
          <p className="text-gray-700 mt-4 text-lg">
            If this role fits how you work, you can sign up in minutes. Your role is locked after signup.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href={props.ctaHref}
              className="bg-8fold-green text-white hover:bg-8fold-green-dark font-semibold px-6 py-3 rounded-lg text-center"
            >
              {props.ctaLabel}
            </Link>
            <Link
              href="/about-8fold"
              className="bg-white text-8fold-green border border-gray-200 hover:bg-gray-50 font-semibold px-6 py-3 rounded-lg text-center"
            >
              Learn about 8Fold
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

