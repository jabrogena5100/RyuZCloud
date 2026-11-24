import type { Pipeline } from "./types";

export type StepStatus = "complete" | "current" | "upcoming" | "error";

export type PipelineStep = {
  key: "uploaded" | "queued" | "transcoding" | "packaging" | "ready";
  title: string;
  /** What system did this step, in plain words. */
  what: string;
  status: StepStatus;
  /** Measured seconds for a finished step, or elapsed seconds for the current one. */
  seconds: number | null;
  /** Live detail for the current step (worker stage, attempt). */
  detail: string | null;
};

const seconds = (from: string | null | undefined, to: string | null | undefined, now: Date): number | null => {
  if (!from) {
    return null;
  }
  const end = to ? new Date(to).getTime() : now.getTime();
  return Math.max(0, (end - new Date(from).getTime()) / 1000);
};

/** Worker stages that come after transcoding (see backend/internal/worker/process.go). */
const PACKAGING_STAGES = new Set(["thumbnail", "uploading", "done"]);

/**
 * Turns the API's pipeline record into the five steps the stepper shows. Every time comes from a
 * stored timestamp; a step without one shows no time rather than a guess.
 */
export function pipelineSteps(p: Pipeline, now: Date = new Date()): PipelineStep[] {
  const job = p.job;
  const ready = p.status === "ready";
  const failed = p.status === "failed";
  const stage = job?.stage ?? "";
  const transcodingDone = ready || PACKAGING_STAGES.has(stage);
  const uploaded = Boolean(p.upload?.completed_at);
  const claimed = Boolean(job?.started_at);

  const steps: PipelineStep[] = [
    {
      key: "uploaded",
      title: "Uploaded",
      what: "Browser to object storage, verified by the API",
      status: uploaded ? "complete" : "upcoming",
      seconds: uploaded ? seconds(p.upload?.created_at, p.upload?.completed_at, now) : null,
      detail: null,
    },
    {
      key: "queued",
      title: "Queued",
      what: "Job committed to PostgreSQL, id sent to the queue",
      status: claimed || ready ? "complete" : "upcoming",
      seconds: claimed ? seconds(job?.created_at, job?.started_at, now) : null,
      detail: null,
    },
    {
      key: "transcoding",
      title: "Transcoding",
      what: "Worker holds a lease on the job and runs FFmpeg per rendition",
      status: transcodingDone ? "complete" : "upcoming",
      seconds: null,
      detail: null,
    },
    {
      key: "packaging",
      title: "Thumbnail and playlist",
      what: "Master playlist written last, so a half-finished video is never playable",
      status: ready ? "complete" : "upcoming",
      seconds: null,
      detail: null,
    },
    {
      key: "ready",
      title: "Ready",
      what: "Playable as adaptive HLS",
      status: ready ? "complete" : "upcoming",
      seconds: ready ? seconds(job?.started_at, job?.finished_at, now) : null,
      detail: ready && job?.started_at ? "processing time, first claim to finish" : null,
    },
  ];

  // The first unfinished step is where the video is now (or where it failed).
  const at = steps.findIndex((step) => step.status !== "complete");
  if (at >= 0) {
    const step = steps[at];
    step.status = failed ? "error" : "current";
    if (step.key === "uploaded") {
      step.seconds = seconds(p.upload?.created_at, null, now);
    } else if (step.key === "queued") {
      step.seconds = seconds(job?.created_at, null, now);
      if (job?.state === "retry") {
        step.detail = `waiting to retry, attempt ${job.attempts} of ${job.max_attempts}`;
      }
    } else if (step.key === "transcoding" || step.key === "packaging") {
      step.seconds = seconds(job?.started_at, failed ? job?.finished_at : null, now);
      step.detail = job ? `${stage || "starting"} · ${job.progress}%` : null;
      if (job && job.attempts > 1) {
        step.detail += ` · attempt ${job.attempts} of ${job.max_attempts}`;
      }
    }
    if (failed) {
      step.seconds = null;
      step.detail = "Processing failed";
    }
  }
  return steps;
}

/** "6.8 s", "1 min 12 s". */
export function formatSeconds(value: number): string {
  if (value < 60) {
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} s`;
  }
  const whole = Math.round(value);
  return `${Math.floor(whole / 60)} min ${whole % 60} s`;
}
