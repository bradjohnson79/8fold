"use client";

import React, { useState } from "react";
import CertificatePreviewModal, { type CertPreviewData } from "@/components/modals/CertificatePreviewModal";

export type CertThumbnailInput = {
  certificationName: string;
  certificateImageUrl: string | null;
  verified: boolean;
  issuingOrganization?: string | null;
};

type Props = {
  certifications: CertThumbnailInput[];
};

export default function CertificationThumbnails({ certifications }: Props) {
  const [preview, setPreview] = useState<CertPreviewData | null>(null);

  // Only render thumbnails for certs that have an uploaded image
  const withImages = certifications
    .filter((c): c is CertThumbnailInput & { certificateImageUrl: string } => Boolean(c.certificateImageUrl))
    .slice(0, 3);

  if (withImages.length === 0) return null;

  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        {withImages.map((cert, i) => (
          <button
            key={i}
            type="button"
            title={cert.certificationName}
            onClick={() =>
              setPreview({
                certificationName: cert.certificationName,
                certificateImageUrl: cert.certificateImageUrl,
                verified: cert.verified,
                issuingOrganization: cert.issuingOrganization ?? null,
              })
            }
            className="relative flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg"
          >
            <img
              src={cert.certificateImageUrl}
              alt={cert.certificationName}
              className="h-11 w-11 rounded-lg border border-slate-200 object-cover shadow-sm transition-transform duration-150 hover:scale-110"
            />
            {cert.verified && (
              <span
                aria-label="Verified"
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </button>
        ))}
      </div>

      {preview ? (
        <CertificatePreviewModal cert={preview} onClose={() => setPreview(null)} />
      ) : null}
    </>
  );
}
