import type { VideoStatus } from "@/lib/types";

// Sage means done, amber means the pipeline is working on it, danger means it failed.
const STATUS: Record<VideoStatus, { label: string; className: string; hint: string }> = {
  draft: {
    label: "Draft",
    className: "border-line-strong text-muted",
    hint: "No video file has been uploaded.",
  },
  uploading: {
    label: "Uploading",
    className: "border-amber/45 text-amber",
    hint: "Waiting for the file to finish uploading.",
  },
  queued: {
    label: "Queued",
    className: "border-amber/45 text-amber",
    hint: "Upload verified. Waiting for a free processing worker.",
  },
  processing: {
    label: "Processing",
    className: "border-amber/45 text-amber",
    hint: "Being converted to streaming formats and a thumbnail.",
  },
  ready: {
    label: "Ready",
    className: "border-sage/45 text-sage",
    hint: "Ready to watch.",
  },
  failed: {
    label: "Failed",
    className: "border-danger/45 text-danger",
    hint: "Upload or processing failed. Delete this video and upload it again.",
  },
};

export function statusHint(status: VideoStatus): string {
  return STATUS[status].hint;
}

/** Whether the video is still moving through the pipeline (worth polling for). */
export function isInProgress(status: VideoStatus): boolean {
  return status === "uploading" || status === "queued" || status === "processing";
}

export function StatusBadge({ status, progress }: { status: VideoStatus; progress?: number | null }) {
  const { label, className, hint } = STATUS[status];
  const showPercent = status === "processing" && typeof progress === "number";
  return (
    <span title={hint} className={`tnum inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
      {showPercent ? ` ${progress}%` : ""}
    </span>
  );
}
