import Link from "next/link";

export default function SupportLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900">Support</h1>
        <p className="text-gray-600 mt-3">
          8Fold support is handled inside the Platform so we can attach the right account and job context.
        </p>

        <div className="mt-8 space-y-4">
          <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="font-bold text-gray-900">Already have an account?</div>
            <p className="text-gray-600 mt-2">
              Log in and use the in-app Support center to create or view tickets.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/login?next=/app/support"
                className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-4 py-2 rounded-lg"
              >
                Log in to Support
              </Link>
            </div>
          </div>

          <div className="border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="font-bold text-gray-900">New here?</div>
            <p className="text-gray-600 mt-2">
              Create your account to get started. Role selection happens inside onboarding.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/sign-up" className="border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg font-semibold text-gray-900">
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

