"use client";

import React from "react";

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

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    onUploadingChange?.(true);
    setUploading(true);
    try {
      const next: string[] = [...urls];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const resp = await fetch("/api/app/job-poster/upload-photo", { method: "POST", body: fd });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(json?.error ?? "Upload failed");
        if (typeof json?.url !== "string") throw new Error("Upload returned no url");
        next.push(json.url);
      }
      onChange(next.slice(0, 5));
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
      <div className="text-sm text-gray-600 mt-1">Upload up to 5 photos (jpg/png/webp).</div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      <div className="mt-3">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploading}
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

