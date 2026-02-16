import Link from "next/link";

export default function WorkersIndexPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900">Workers</h1>
          <p className="text-xl text-gray-700 mt-6 max-w-3xl mx-auto">
            8Fold is built around three roles working together with clear economics and accountability.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          <RoleCard
            title="Job Posters"
            body="Post once, get clear pricing, and stay protected."
            href="/workers/job-posters"
          />
          <RoleCard
            title="Routers"
            body="Coordinate jobs and earn predictable routing fees."
            href="/workers/routers"
          />
          <RoleCard
            title="Contractors"
            body="Get routed work with transparent pay and protections."
            href="/workers/contractors"
          />
        </div>
      </div>
    </div>
  );
}

function RoleCard(props: { title: string; body: string; href: string }) {
  return (
    <Link href={props.href} className="border border-gray-200 rounded-2xl p-6 hover:bg-gray-50 transition-colors">
      <div className="font-bold text-gray-900 text-lg">{props.title}</div>
      <div className="text-gray-600 mt-2">{props.body}</div>
      <div className="text-8fold-green font-semibold mt-4">Learn more</div>
    </Link>
  );
}

