"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { pipelineSteps, type PipelineStep } from "@/lib/pipeline";
import type { Pipeline } from "@/lib/types";
import type { UploadStage } from "@/lib/uploadFlow";
import { PipelineSteps } from "./PipelineSteps";

const POLL_MS = 2000;

type LivePipelineProps = {
  /** Set once the upload session exists; the panel then follows the server's record. */
  videoId: string | null;
  /** The browser's own upload leg, before the server has anything to report. */
  uploadStage: UploadStage | null;
  uploadPercent: number;
};

/** Steps shown before the video exists on the server, or while the browser is still sending. */
function localSteps(stage: UploadStage | null, percent: number): PipelineStep[] {
  const empty: PipelineStep[] = pipelineSteps(
    { video_id: "", status: "draft", duration_seconds: null, upload: null, job: null, renditions: [] },
    new Date(),
  ).map((step) => ({ ...step, status: "upcoming", seconds: null, detail: null }));
  if (stage) {
    empty[0] = {
      ...empty[0],
      status: "current",
      detail: stage === "uploading" ? `${percent}% sent` : stage === "finalizing" ? "verifying with HeadObject" : "requesting a signed URL",
    };
  }
  return empty;
}

export function LivePipeline({ videoId, uploadStage, uploadPercent }: LivePipelineProps) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [now, setNow] = useState(() => new Date());
  const done = pipeline?.status === "ready" || pipeline?.status === "failed";

  useEffect(() => {
    if (!videoId || done) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const next = await api.pipeline(videoId);
        if (!cancelled) {
          setPipeline(next);
          setNow(new Date());
        }
      } catch {
        // Keep the last known state; the next poll may succeed.
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [videoId, done]);

  const steps = pipeline && !uploadStage ? pipelineSteps(pipeline, now) : localSteps(uploadStage, uploadPercent);
  const job = pipeline?.job;

  return (
    <section aria-labelledby="pipeline-heading" className="self-start rounded-[var(--radius-card)] border border-line bg-s1 p-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="pipeline-heading" className="text-lg font-semibold tracking-[-0.01em]">
          Processing pipeline
        </h2>
        {job && (
          <span className="tnum text-[13px] text-subtle">
            attempt {Math.max(job.attempts, 1)} of {job.max_attempts}
          </span>
        )}
      </div>
      <div aria-live="polite">
        <PipelineSteps steps={steps} />
      </div>
      {!videoId && !uploadStage && (
        <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
          Choose a file to start. Each step fills in from the server&apos;s own record as it happens.
        </p>
      )}
      {pipeline?.status === "ready" && (
        <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
          {pipeline.renditions.length} renditions ready: {pipeline.renditions.map((r) => r.name).join(", ")}.
        </p>
      )}
    </section>
  );
}
