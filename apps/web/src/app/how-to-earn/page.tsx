import Link from "next/link";

export default function HowToEarnPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        {/* 1️⃣ Hero Section */}
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900">
            Earn Real Money by Coordinating Local Jobs
          </h1>
          <p className="text-xl text-gray-700 mt-6 max-w-3xl mx-auto">
            8Fold lets you earn coordination fees by routing real jobs to vetted contractors —
            without tools, trucks, or liability.
          </p>
          <p className="text-sm text-gray-500 mt-4">
            No income guarantees. Earnings depend on job availability, speed, and successful completion.
          </p>
        </div>

        {/* 2️⃣ What Is 8Fold */}
        <section className="mt-24 bg-gray-50 border border-gray-200 rounded-2xl p-12">
          <h2 className="text-3xl font-bold text-gray-900">A Better Way to Get Jobs Done</h2>
          <div className="mt-6 text-gray-700 space-y-4 text-lg leading-relaxed">
            <p>
              8Fold is not a bidding marketplace and not a gig free-for-all.
            </p>
            <p className="font-semibold">
              It&apos;s a coordination platform built around three roles working together:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              <RoleCard
                title="Job Posters"
                description="Get reliable, vetted contractors with protected payments"
              />
              <RoleCard
                title="Contractors"
                description="Get ready-to-go jobs without chasing leads"
              />
              <RoleCard
                title="Routers"
                description="Earn money by coordinating and placing the right contractor on the right job"
              />
            </div>
            <p className="mt-6 font-semibold text-center">
              When a job is completed successfully, everyone benefits.
            </p>
          </div>
        </section>

        {/* 3️⃣ How Routers Earn */}
        <section className="mt-24">
          <h2 className="text-3xl font-bold text-gray-900 text-center">How Routers Earn</h2>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-8">
            <StepCard
              number={1}
              title="Claim a Job"
              content={
                <>
                  <p>Browse available jobs in your state or province.</p>
                  <p>Jobs are first-come, first-served — one router per job.</p>
                  <p className="mt-3 font-semibold text-gray-900">
                    If a job sits unclaimed for 24 hours, admin steps in. Speed matters.
                  </p>
                </>
              }
            />
            <StepCard
              number={2}
              title="Route the Job"
              content={
                <>
                  <p>Send the job to a vetted local contractor.</p>
                  <ul className="list-disc ml-6 mt-3 space-y-1">
                    <li>No bidding wars</li>
                    <li>No negotiation</li>
                    <li>No pricing games</li>
                  </ul>
                  <p className="mt-3 font-semibold text-gray-900">
                    Your role is coordination, not sales.
                  </p>
                </>
              }
            />
            <StepCard
              number={3}
              title="Track Progress"
              content={
                <>
                  <p>Once booked:</p>
                  <ul className="list-disc ml-6 mt-3 space-y-1">
                    <li>Job progress updates automatically</li>
                    <li>Parts & Materials (if needed) are handled through escrow</li>
                    <li>You stay informed without micromanaging</li>
                  </ul>
                </>
              }
            />
            <StepCard
              number={4}
              title="Get Paid"
              content={
                <>
                  <p>After the job is completed and approved:</p>
                  <ul className="list-disc ml-6 mt-3 space-y-1">
                    <li>Your routing fee is credited</li>
                    <li>Payouts are handled through Stripe direct deposit</li>
                    <li>Full visibility into payout status</li>
                  </ul>
                  <p className="mt-3 text-sm text-gray-600">
                    8Fold uses Stripe for secure escrow and payouts.
                  </p>
                </>
              }
            />
          </div>
        </section>

        {/* 4️⃣ What You Can Earn */}
        <section className="mt-24 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-12">
          <h2 className="text-3xl font-bold text-gray-900 text-center">What You Can Earn</h2>
          <p className="text-center text-gray-700 mt-4 text-lg">
            Routing fees vary based on job size and complexity.
          </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <EarningsCard range="$50 – $100" category="Small jobs" />
            <EarningsCard range="$100 – $250" category="Medium jobs" highlight />
            <EarningsCard range="$250+" category="Larger jobs" />
          </div>
          <p className="text-center text-gray-700 mt-8 font-semibold">
            The more reliable and responsive you are, the more opportunities you unlock.
          </p>
        </section>

        {/* 5️⃣ How 8Fold Compares */}
        <section className="mt-24">
          <h2 className="text-3xl font-bold text-gray-900 text-center">
            How 8Fold Does It Differently
          </h2>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
            <ComparisonCard
              title="What most platforms do"
              items={[
                "Flood contractors with leads",
                "Push bidding wars",
                "Take large hidden cuts",
                "Absorb tips into platform revenue",
                "Leave users exposed when things go wrong",
              ]}
              footer="Everyone competes. Nobody feels protected."
              tone="danger"
            />
            <ComparisonCard
              title="What 8Fold does"
              items={[
                "No bidding wars",
                "Transparent pricing",
                "Clear coordination roles",
                "Protected payments and escrow",
                "Real incentives for reliability",
              ]}
              footer="8Fold isn't about extracting value — it's about distributing it fairly."
              tone="success"
            />
          </div>
        </section>

        {/* 6️⃣ Where the Money Goes */}
        <section className="mt-24 bg-gray-50 border border-gray-200 rounded-2xl p-12">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">
            Where the Money Goes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <MoneyFlowCard
              role="Contractors"
              items={[
                "Keep 100% of tips",
                "No tip skimming",
                "Paid after verified completion",
                "Parts & Materials reimbursed through escrow (with receipts)",
              ]}
            />
            <MoneyFlowCard
              role="Routers"
              items={[
                "Earn coordination fees per completed job",
                "Eligible for performance and volume bonuses",
                "No liability for job execution",
              ]}
            />
            <MoneyFlowCard
              role="Job Posters"
              items={[
                "Protected payments",
                "Materials handled through escrow",
                "Refunds or credits when materials come in under budget",
                "Credits for repeat jobs in the same category",
              ]}
            />
          </div>
          <p className="text-center text-gray-900 font-bold text-xl mt-10">
            Nothing is hidden. Everyone knows the rules.
          </p>
        </section>

        {/* 7️⃣ Bonuses & Incentives */}
        <section className="mt-24">
          <h2 className="text-3xl font-bold text-gray-900 text-center">
            Bonuses That Reward Good Behavior
          </h2>
          <p className="text-center text-gray-700 mt-4 text-lg">
            8Fold bonuses are designed to reinforce trust:
          </p>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <BonusCard
              recipient="Contractors"
              benefit="Earn bonuses for reliability and repeat success"
            />
            <BonusCard
              recipient="Routers"
              benefit="Earn bonuses for fast, clean routing"
            />
            <BonusCard
              recipient="Job Posters"
              benefit="Earn credits for repeat work in the same category"
            />
          </div>
          <p className="text-center text-gray-900 font-semibold text-lg mt-8">
            Bonuses aren&apos;t gimmicks — they align incentives.
          </p>
        </section>

        {/* 8️⃣ Built-In Protection */}
        <section className="mt-24 bg-blue-50 border border-blue-200 rounded-2xl p-12">
          <h2 className="text-3xl font-bold text-gray-900 text-center">Built for Trust</h2>
          <p className="text-center text-gray-700 mt-4 text-lg">8Fold includes:</p>
          <ul className="mt-8 space-y-4 text-gray-700 text-lg max-w-2xl mx-auto">
            <ProtectionItem text="Escrow for Parts & Materials" />
            <ProtectionItem text="AI-assisted receipt verification" />
            <ProtectionItem text="No contractor overbilling passed to posters" />
            <ProtectionItem text="Contractors responsible for overages" />
            <ProtectionItem text="Admin oversight when jobs stall or need help" />
          </ul>
          <p className="text-center text-gray-900 font-bold text-xl mt-10">
            Most platforms leave people hanging.<br />
            8Fold doesn&apos;t.
          </p>
        </section>

        {/* 9️⃣ Closing Statement */}
        <section className="mt-24 text-center">
          <h2 className="text-4xl font-bold text-gray-900">Community Over Chaos</h2>
          <p className="text-xl text-gray-700 mt-6 max-w-2xl mx-auto">
            8Fold is built for people who want:
          </p>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            <ValuePill text="Real work" />
            <ValuePill text="Real outcomes" />
            <ValuePill text="Clear rules" />
            <ValuePill text="Fair pay" />
          </div>
          <p className="text-2xl text-gray-900 font-semibold mt-10">
            No games. No smoke. Just coordination done right.
          </p>
        </section>

        {/* 🔘 Call to Action */}
        <section className="mt-24 bg-gradient-to-r from-8fold-green to-emerald-600 rounded-2xl p-14 text-center text-white">
          <h2 className="text-3xl font-bold">Ready to start routing jobs in your area?</h2>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sign-up"
              className="bg-8fold-green text-white hover:bg-8fold-green-dark font-bold px-8 py-4 rounded-lg text-lg transition-colors"
            >
              Sign Up
            </Link>
            <Link
              href="/sign-up"
              className="bg-white text-8fold-green hover:bg-gray-50 border border-white/40 font-bold px-8 py-4 rounded-lg text-lg transition-colors"
            >
              Sign Up
            </Link>
            <Link
              href="/sign-up"
              className="bg-white text-8fold-green hover:bg-gray-50 border border-white/40 font-bold px-8 py-4 rounded-lg text-lg transition-colors"
            >
              Sign Up
            </Link>
          </div>
        </section>

        {/* 10️⃣ Footer Disclaimer */}
        <div className="mt-16 border-t border-gray-200 pt-8 text-center text-sm text-gray-500">
          Earnings vary based on job availability, region, and performance.<br />
          8Fold does not guarantee income or job volume.
        </div>
      </div>
    </div>
  );
}

// Helper Components

function RoleCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
      <div className="font-bold text-gray-900 text-lg">{title}</div>
      <div className="text-gray-600 mt-3">{description}</div>
    </div>
  );
}

function StepCard({ number, title, content }: { number: number; title: string; content: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-2xl p-8 bg-white shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-8fold-green text-white rounded-full flex items-center justify-center font-bold text-xl">
          {number}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <div className="text-gray-700 mt-3 space-y-2">{content}</div>
        </div>
      </div>
    </div>
  );
}

function EarningsCard({ range, category, highlight }: { range: string; category: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl p-6 text-center ${
        highlight ? "bg-8fold-green text-white" : "bg-white border border-green-200 text-gray-900"
      }`}
    >
      <div className="text-3xl font-bold">{range}</div>
      <div className={`mt-2 ${highlight ? "text-green-100" : "text-gray-600"}`}>{category}</div>
    </div>
  );
}

function ComparisonCard({
  title,
  items,
  footer,
  tone,
}: {
  title: string;
  items: string[];
  footer: string;
  tone: "danger" | "success";
}) {
  const borderColor = tone === "danger" ? "border-red-200" : "border-green-200";
  const bgColor = tone === "danger" ? "bg-red-50" : "bg-green-50";
  const iconColor = tone === "danger" ? "text-red-600" : "text-green-600";

  return (
    <div className={`border ${borderColor} ${bgColor} rounded-2xl p-8`}>
      <h3 className="text-xl font-bold text-gray-900">{title}</h3>
      <ul className="mt-6 space-y-3">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <span className={`${iconColor} text-xl flex-shrink-0`}>
              {tone === "danger" ? "✗" : "✓"}
            </span>
            <span className="text-gray-700">{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-gray-900 font-semibold italic">{footer}</p>
    </div>
  );
}

function MoneyFlowCard({ role, items }: { role: string; items: string[] }) {
  return (
    <div className="bg-white border border-gray-300 rounded-xl p-6">
      <div className="font-bold text-gray-900 text-xl mb-4">{role}</div>
      <ul className="space-y-2 text-gray-700">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="text-8fold-green mt-1 flex-shrink-0">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BonusCard({ recipient, benefit }: { recipient: string; benefit: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 text-center shadow-sm hover:shadow-md transition-shadow">
      <div className="font-bold text-gray-900 text-lg">{recipient}</div>
      <div className="text-gray-600 mt-3">{benefit}</div>
    </div>
  );
}

function ProtectionItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="text-blue-600 text-xl flex-shrink-0">✓</span>
      <span>{text}</span>
    </li>
  );
}function ValuePill({ text }: { text: string }) {
  return (
    <div className="bg-gray-100 border border-gray-300 rounded-full px-6 py-3 font-semibold text-gray-900">
      {text}
    </div>
  );
}