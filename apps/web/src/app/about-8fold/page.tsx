export default function About8FoldPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-4xl font-bold text-gray-900">About 8Fold</h1>

        <p className="text-gray-600 mt-4 text-lg">
          8Fold is a modern coordination platform built to fix what local service marketplaces got wrong.
          We don’t auction jobs. We don’t race contractors to the bottom. And we don’t leave people guessing
          who gets paid, when, or why.
        </p>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">Our mission</h2>
          <p className="text-gray-600 mt-3">
            Make local service work predictable, transparent, and worth participating in. Local jobs shouldn’t
            feel chaotic or adversarial — they should feel organized, priced fairly, and protected by systems
            that work.
          </p>
          <ul className="mt-4 list-disc list-inside text-gray-700 space-y-2">
            <li>Show earnings upfront so everyone knows the split.</li>
            <li>Lock pricing logic before work begins to prevent surprises.</li>
            <li>Protect all sides with escrow, receipts, and clear admin oversight.</li>
            <li>Reward coordination and reliability, not chaos.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">What makes 8Fold different</h2>

          <div className="mt-6 grid gap-6">
            <div className="border border-gray-200 rounded-2xl p-6">
              <div className="font-semibold text-gray-900">Transparent economics</div>
              <div className="mt-2 text-gray-700">
                Every job clearly shows the split up front:
              </div>
              <div className="mt-3 flex gap-4 text-sm text-gray-800">
                <div className="px-3 py-2 bg-gray-50 rounded-md font-semibold">Contractor: 75%</div>
                <div className="px-3 py-2 bg-gray-50 rounded-md font-semibold">Router: 15%</div>
                <div className="px-3 py-2 bg-gray-50 rounded-md font-semibold">8Fold: 10%</div>
              </div>
              <div className="mt-3 text-gray-600 text-sm">
                No hidden fees. No shifting percentages. Payout math is deterministic and consistent.
              </div>
            </div>

            <div className="border border-gray-200 rounded-2xl p-6">
              <div className="font-semibold text-gray-900">Smart pricing — without guesswork</div>
              <div className="mt-2 text-gray-700">
                We use AI-assisted appraisal (GPT-5 nano) to establish a fair, market-aware baseline before a job posts.
                Job Posters may make small adjustments within a safe range, but the baseline is intelligent, grounded,
                and realistic — reducing inflated jobs and improving acceptance.
              </div>
            </div>

            <div className="border border-gray-200 rounded-2xl p-6">
              <div className="font-semibold text-gray-900">Routers coordinate, not negotiate</div>
              <div className="mt-2 text-gray-700">
                Routers claim available jobs, route them to vetted contractors, and coordinate completion.
                They earn predictable coordination fees and focus on reliability and follow-through — not price
                negotiation or bidding wars.
              </div>
            </div>

            <div className="border border-gray-200 rounded-2xl p-6">
              <div className="font-semibold text-gray-900">Contractors keep what they earn</div>
              <div className="mt-2 text-gray-700">
                Contractors receive <strong>75% of labor</strong> and keep <strong>100% of tips</strong>. Parts &amp;
                materials are handled separately through escrow and verified receipts — protecting Job Posters and
                ensuring transparent reimbursement to contractors.
              </div>
            </div>

            <div className="border border-gray-200 rounded-2xl p-6">
              <div className="font-semibold text-gray-900">Admin oversight when it matters</div>
              <div className="mt-2 text-gray-700">
                Admins step in when jobs stall, act as routers when needed, resolve disputes, and ensure accountability.
                This is not hands-off; it’s targeted oversight that preserves trust across the platform.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">Built for real communities</h2>
          <p className="text-gray-700 mt-3">
            8Fold focuses on local reliability, repeat business, and fair incentives. When a platform respects everyone’s
            role — Job Posters, Routers, and Contractors — the community wins.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">The bigger picture</h2>
          <p className="text-gray-700 mt-3">
            We believe the future of local work is not gig chaos or lowest-bid wins. It’s structured coordination,
            powered by smart tools, clear economics, and enforceable protections. That’s what 8Fold brings to the table.
          </p>
        </section>
      </div>
    </div>
  );
}


