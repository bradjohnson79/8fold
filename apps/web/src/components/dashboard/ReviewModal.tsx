"use client";

import React from "react";

type Props = {
  jobId: string;
  jobTitle?: string;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => Promise<boolean>;
  submitting?: boolean;
};

/** 5-star rating + comment review modal. */
export function ReviewModal({ jobId, jobTitle, onClose, onSubmit, submitting = false }: Props) {
  const [rating, setRating] = React.useState(5);
  const [comment, setComment] = React.useState("");

  async function handleSubmit() {
    const ok = await onSubmit(rating, comment);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Leave a Review</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            Close
          </button>
        </div>
        {jobTitle && (
          <p className="mt-1 text-sm text-slate-600">{jobTitle}</p>
        )}
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Rating</label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`text-2xl transition ${star <= rating ? "text-amber-400" : "text-slate-300"}`}
                >
                  &#9733;
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Comment</label>
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="How was your experience?"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !comment.trim()}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
