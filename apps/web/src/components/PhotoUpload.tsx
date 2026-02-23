"use client";

import React from "react";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function PhotoUpload({
  urls,
  onChange,
  onUploadingChange,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [error, setError] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  async function onFiles(filesLike: FileList | File[] | null) {
    const files = filesLike ? Array.from(filesLike) : [];
    if (files.length === 0) return;
    if (!files || files.length === 0) return;
    setError("");
    if (urls.length >= MAX_FILES) {
      setError(`You can upload up to ${MAX_FILES} photos.`);
      return;
    }

    const invalid = files.find((f) => f.size > MAX_FILE_BYTES);
    if (invalid) {
      setError(`Each file must be 5MB or smaller. "${invalid.name}" is too large.`);
      return;
    }

    const mimeInvalid = files.find((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type));
    if (mimeInvalid) {
      setError(`Unsupported file type for "${mimeInvalid.name}". Use jpg, png, or webp.`);
      return;
    }

    const allowedCount = Math.max(0, MAX_FILES - urls.length);
    const filesToUpload = files.slice(0, allowedCount);
    if (filesToUpload.length === 0) {
      setError(`You can upload up to ${MAX_FILES} photos.`);
      return;
    }

    onUploadingChange?.(true);
    setUploading(true);
    try {
      const next: string[] = [...urls];
      for (const file of filesToUpload) {
        const fd = new FormData();
        fd.append("file", file);
        const resp = await fetch("/api/app/job-poster/upload-photo", { method: "POST", body: fd });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(json?.error ?? "Upload failed");
        if (typeof json?.url !== "string") throw new Error("Upload returned no url");
        next.push(json.url);
      }
      onChange(next.slice(0, MAX_FILES));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  function remove(idx: number) {
    onChange(urls.filter((_, i) => i !== idx));
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-gray-900">Photos (optional)</div>
      <div className="text-sm text-gray-600 mt-1">Upload up to 5 photos (jpg/png/webp, max 5MB each).</div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      <div
        className={`mt-3 rounded-lg border border-dashed p-4 transition ${
          dragging ? "border-8fold-green bg-green-50" : "border-gray-300 bg-white"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) void onFiles(e.dataTransfer?.files ?? null);
        }}
      >
        <div className="text-sm text-gray-700 mb-3">Drag and drop photos here, or choose files.</div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploading || urls.length >= MAX_FILES}
          onChange={(e) => void onFiles(e.target.files)}
        />
        {uploading ? <div className="mt-2 text-sm text-gray-600">Uploading…</div> : null}
      </div>

      {urls.length ? (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {urls.map((u, idx) => (
            <div key={u + idx} className="border border-gray-200 rounded-lg p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="w-full h-24 object-cover rounded" />
              <button
                type="button"
                className="mt-2 w-full text-xs font-semibold border border-gray-300 rounded-md py-1 hover:bg-gray-50"
                onClick={() => remove(idx)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

