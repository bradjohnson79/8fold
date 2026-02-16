export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900">Terms &amp; Conditions</h1>
        <p className="text-gray-600 mt-3">
          These Terms describe how you can use <span className="font-semibold">8Fold</span> (the “Platform”). 8Fold is a
          platform operated by <span className="font-semibold">ANOINT Inc.</span>
        </p>

        <div className="mt-10 space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-bold text-gray-900">1) Roles on 8Fold</h2>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>
                <span className="font-semibold">Job Posters</span> create jobs and approve completion before payment is
                released.
              </li>
              <li>
                <span className="font-semibold">Routers</span> route jobs to qualified contractors and earn routing
                incentives when eligible.
              </li>
              <li>
                <span className="font-semibold">Contractors</span> opt in to jobs by accepting routed offers or repeat
                requests. They are not “assigned” jobs.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">2) Platform rules (high level)</h2>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>No off-platform payment requests or attempts to bypass escrow.</li>
              <li>No harassment, fraud, or unsafe conduct.</li>
              <li>Follow applicable laws, licensing, and safety standards for your trade and region.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">3) Scheduling &amp; booking</h2>
            <p className="mt-3">
              When a Contractor accepts a job, they must provide booking details within the required window (typically
              within 5 business days). Repeated failures to book, no-shows, or poor reliability may impact account
              standing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">4) Payments, escrow, and disputes</h2>
            <p className="mt-3">
              8Fold uses escrow to hold funds for labor and approved materials when applicable. Payment release may be
              held during disputes, chargebacks, or policy reviews. Disputes and escalations are handled through Support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">5) Account standing &amp; enforcement</h2>
            <p className="mt-3">
              We may issue warnings, temporarily limit access, or suspend accounts to protect marketplace integrity and
              users. Standing is system-controlled based on reliability, disputes, and policy compliance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">6) Contact</h2>
            <p className="mt-3">
              For questions or help, use the in-app Support flow when available, or visit{" "}
              <a className="text-8fold-green font-semibold hover:underline" href="/support">
                Support
              </a>
              .
            </p>
          </section>

          <p className="text-xs text-gray-500">
            Plain-English baseline terms for early rollout. These Terms may be updated as the Platform evolves.
          </p>
        </div>
      </div>
    </div>
  );
}

