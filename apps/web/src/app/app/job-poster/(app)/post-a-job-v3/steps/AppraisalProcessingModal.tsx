"use client";

type Props = {
  open: boolean;
  error?: string;
};

export function AppraisalProcessingModal({ open, error }: Props) {
  if (!open && !error) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        {!error ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-8fold-green animate-spin" />
            <h3 className="text-base font-semibold text-gray-900">Analyzing your job</h3>
            <p className="text-sm text-gray-600">8Fold is analyzing your job using GPT-5 Nano...</p>
          </div>
        ) : (
          <div className="text-center">
            <h3 className="text-base font-semibold text-red-700">Appraisal failed</h3>
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
