"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { formatBytes } from "@/lib/format";

/*
 * Adapted from "UploadThing Dropzone" by elements- on 21st.dev
 * (https://21st.dev/@elements-/components/uploadthing-dropzone).
 * Kept: the drag-over highlight, drop and file-picker paths into one handler, the cloud icon, and
 * a quiet "type, size" line under the file name.
 * Changed: one file at a time and validation left to the caller (the API's limits); the real
 * upload progress is shown by the page from XHR events instead of a simulated timer; the
 * uploaded-files list, copy/open/remove buttons and blob URLs are removed (the file goes straight
 * to object storage, not to this page); the picker is a visible, keyboard-reachable label; colours
 * follow the design tokens (the dashed outline uses the 3:1 control colour).
 */

type DropzoneProps = {
  file: File | null;
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
};

export function Dropzone({ file, accept, disabled = false, onFile }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); // required for the drop event to fire
    if (!disabled) {
      setDragging(true);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped && !disabled) {
      onFile(dropped);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) {
      onFile(selected);
    }
    event.target.value = ""; // allow choosing the same file again after an error
  }

  return (
    <div
      data-testid="dropzone"
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center gap-2 rounded-[var(--radius-card)] border-[1.5px] border-dashed px-6 py-9 text-center transition-colors duration-150 ${
        dragging ? "border-sage bg-s2" : "border-control bg-s1"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-10 w-10 transition-colors duration-150 ${dragging ? "text-sage" : "text-muted"}`}
      >
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M12 12v9" />
        <path d="m16 16-4-4-4 4" />
      </svg>
      {file ? (
        <>
          <p className="max-w-full font-[550] break-all">{file.name}</p>
          <p className="tnum text-sm text-muted">
            <span>{formatBytes(file.size)}</span> · <span>{file.type || "unknown type"}</span>
          </p>
        </>
      ) : (
        <p className="text-muted">{dragging ? "Drop the file to choose it" : "Drag and drop a video file here, or"}</p>
      )}
      <label
        className={`mt-1 inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-sm font-[550] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sage ${
          disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-s2"
        }`}
      >
        {file ? "Choose a different file" : "Select video file"}
        <input type="file" accept={accept} disabled={disabled} onChange={handleChange} className="sr-only" />
      </label>
    </div>
  );
}
