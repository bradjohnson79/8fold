export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-gray-600 mt-3">
          This Privacy Policy explains how <span className="font-semibold">8Fold</span> (the “Platform”) collects and
          uses information. 8Fold is a platform operated by <span className="font-semibold">ANOINT Inc.</span>
        </p>

        <div className="mt-10 space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-bold text-gray-900">1) What we collect</h2>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>
                <span className="font-semibold">Account info</span>: name, email, phone, role (Job Poster, Router,
                Contractor), and basic profile details you provide.
              </li>
              <li>
                <span className="font-semibold">Job data</span>: job details, scheduling information, completion status,
                and activity history needed to route and coordinate work.
              </li>
              <li>
                <span className="font-semibold">Payments & escrow</span>: limited details needed to process payments and
                manage escrow (we avoid storing full card numbers).
              </li>
              <li>
                <span className="font-semibold">Usage data</span>: device and browser info, IP address, approximate
                location, and log data used for security, troubleshooting, and reliability.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">2) How we use information</h2>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>Operate the Platform (routing, scheduling, job coordination, and support).</li>
              <li>Fraud prevention, security monitoring, and account protection.</li>
              <li>Payment processing and escrow administration.</li>
              <li>Improve product quality (analytics, performance, and debugging).</li>
              <li>Send transactional notifications (job updates, support responses, and policy updates).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">3) Sharing</h2>
            <p className="mt-3">
              We share information only as needed to run 8Fold. For example, after a Contractor accepts a job and submits
              booking details, the Job Poster may receive the Contractor’s contact details for coordination. We may also
              share information with vendors who help us run the Platform (e.g., hosting, payments, analytics), and when
              required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">4) Data retention</h2>
            <p className="mt-3">
              We keep data for as long as needed to provide the Platform, meet legal obligations, resolve disputes, and
              enforce agreements. Some audit logs may be retained for compliance and marketplace integrity.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">5) Your choices</h2>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>Update your profile information from your dashboard.</li>
              <li>Contact Support for access, deletion, or correction requests (subject to legal limits).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900">6) Contact</h2>
            <p className="mt-3">
              For privacy questions, use the in-app Support flow. If you cannot access your account, visit{" "}
              <a className="text-8fold-green font-semibold hover:underline" href="/support">
                Support
              </a>
              .
            </p>
          </section>

          <p className="text-xs text-gray-500">
            Plain-English summary for baseline use. This policy may be updated as the Platform evolves.
          </p>
        </div>
      </div>
    </div>
  );
}

