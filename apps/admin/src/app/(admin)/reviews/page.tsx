"use client";

import { useEffect, useState } from "react";

type ReviewRow = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  posterName: string;
  rating: number;
  comment: string;
  createdAt: string | null;
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const resp = await fetch(`/api/admin/v4/reviews?page=${page}&pageSize=${pageSize}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = await resp.json().catch(() => null);
        if (!alive) return;
        if (!resp.ok || !json) {
          setError("Failed to load reviews");
          return;
        }
        setReviews(json.reviews ?? json.data?.reviews ?? []);
        setTotal(json.total ?? json.data?.total ?? 0);
      } catch {
        if (alive) setError("Failed to load reviews");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [page]);

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < rating ? "text-amber-400" : "text-slate-300"}>&#9733;</span>
    ));
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900">Reviews</h1>
        <div className="mt-4 animate-pulse rounded-xl border bg-slate-50 p-8 text-center text-sm text-slate-500">
          Loading reviews...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900">Reviews</h1>
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">Reviews</h1>
      <p className="mt-1 text-sm text-slate-500">{total} total review{total !== 1 ? "s" : ""}</p>

      {reviews.length === 0 ? (
        <div className="mt-4 rounded-xl border bg-slate-50 p-8 text-center text-sm text-slate-500">
          No reviews yet.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Job Poster</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Comment</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reviews.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.posterName}</td>
                  <td className="px-4 py-3 text-slate-700">{r.jobTitle ?? r.jobId.slice(0, 8)}</td>
                  <td className="px-4 py-3">{renderStars(r.rating)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600">{r.comment || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <button
            type="button"
            disabled={page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
