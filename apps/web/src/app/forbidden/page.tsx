export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="border border-gray-200 rounded-2xl p-10 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900">Access denied</h1>
          <p className="text-gray-600 mt-3">
            This area is restricted to a different role. If you believe this is a mistake, log out and
            sign in with the correct account.
          </p>
          <div className="mt-8 flex gap-3">
            <a
              href="/jobs"
              className="bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-3 rounded-lg"
            >
              Back to jobs
            </a>
            <a
              href="/login"
              className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-5 py-3 rounded-lg"
            >
              Log in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

