"use client";

import React, { useEffect } from "react";

export type CertPreviewData = {
  certificationName: string;
  certificateImageUrl: string;
  verified: boolean;
  issuingOrganization?: string | null;
};

type Props = {
  cert: CertPreviewData;
  onClose: () => void;
};

export default function CertificatePreviewModal({ cert, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>

        {/* Image */}
        <div className="flex items-center justify-center rounded-t-2xl bg-slate-50 p-6">
          <img
            src={cert.certificateImageUrl}
            alt={cert.certificationName}
            className="max-h-[60vh] w-auto rounded-xl object-contain shadow"
          />
        </div>

        {/* Info footer */}
        <div className="px-6 py-4 text-center">
          <div className="text-base font-semibold text-slate-900">{cert.certificationName}</div>
          {cert.issuingOrganization ? (
            <div className="mt-0.5 text-sm text-slate-500">{cert.issuingOrganization}</div>
          ) : null}
          {cert.verified ? (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              Verified
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
