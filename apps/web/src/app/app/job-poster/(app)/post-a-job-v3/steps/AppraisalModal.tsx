"use client";

export function AppraisalModal({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-8fold-green" />
        <h3 className="text-center text-base font-semibold text-gray-900">8Fold is analyzing your job...</h3>
        <p className="mt-2 text-center text-sm text-gray-600">Powered by GPT-5 Nano</p>
      </div>
    </div>
  );
}
