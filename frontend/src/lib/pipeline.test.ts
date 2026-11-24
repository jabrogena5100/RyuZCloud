import { describe, expect, it } from "vitest";
import { formatSeconds, pipelineSteps } from "./pipeline";
import type { Pipeline } from "./types";

const NOW = new Date("2026-11-24T10:01:00Z");

function pipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    video_id: "v1",
    status: "processing",
    duration_seconds: 120,
    upload: { size_bytes: 1000, content_type: "video/mp4", created_at: "2026-11-24T10:00:00Z", completed_at: "2026-11-24T10:00:06.8Z" },
    job: {
      state: "processing",
      stage: "transcoding 720p",
      progress: 52,
      attempts: 1,
      max_attempts: 4,
      created_at: "2026-11-24T10:00:07Z",
      started_at: "2026-11-24T10:00:07.4Z",
      finished_at: null,
    },
    renditions: [],
    ...overrides,
  };
}

const statuses = (p: Pipeline) => pipelineSteps(p, NOW).map((s) => s.status);

describe("pipelineSteps", () => {
  it("marks the transcoding step current while the worker transcodes", () => {
    const steps = pipelineSteps(pipeline(), NOW);
    expect(steps.map((s) => s.status)).toEqual(["complete", "complete", "current", "upcoming", "upcoming"]);
    expect(steps[0].seconds).toBeCloseTo(6.8);
    expect(steps[1].seconds).toBeCloseTo(0.4);
    expect(steps[2].detail).toBe("transcoding 720p · 52%");
    expect(steps[2].seconds).toBeCloseTo(52.6); // elapsed since the claim
  });

  it("shows a pending upload as the current step", () => {
    const p = pipeline({
      status: "uploading",
      upload: { size_bytes: 1, content_type: "video/mp4", created_at: "2026-11-24T10:00:30Z", completed_at: null },
      job: null,
    });
    expect(statuses(p)).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("waits in the queue until a worker claims the job, and says when it is retrying", () => {
    const job = { ...pipeline().job!, started_at: null, stage: "queued", state: "queued" as const, progress: 0 };
    expect(statuses(pipeline({ status: "queued", job }))).toEqual(["complete", "current", "upcoming", "upcoming", "upcoming"]);
    const retry = pipelineSteps(pipeline({ status: "queued", job: { ...job, state: "retry", attempts: 2 } }), NOW);
    expect(retry[1].detail).toBe("waiting to retry, attempt 2 of 4");
  });

  it("moves to packaging after the renditions are done", () => {
    const p = pipeline({ job: { ...pipeline().job!, stage: "thumbnail", progress: 78 } });
    expect(statuses(p)).toEqual(["complete", "complete", "complete", "current", "upcoming"]);
  });

  it("completes every step and reports the measured processing time", () => {
    const steps = pipelineSteps(
      pipeline({ status: "ready", job: { ...pipeline().job!, state: "succeeded", stage: "done", progress: 100, finished_at: "2026-11-24T10:00:48.4Z" } }),
      NOW,
    );
    expect(steps.every((s) => s.status === "complete")).toBe(true);
    expect(steps[4].seconds).toBeCloseTo(41);
  });

  it("marks the step that failed and shows no time for it", () => {
    const steps = pipelineSteps(pipeline({ status: "failed", job: { ...pipeline().job!, state: "failed", stage: "failed" } }), NOW);
    expect(steps[2].status).toBe("error");
    expect(steps[2].seconds).toBeNull();
    expect(steps[2].detail).toBe("Processing failed");
  });

  it("mentions the attempt number after a crash recovery", () => {
    const steps = pipelineSteps(pipeline({ job: { ...pipeline().job!, attempts: 2 } }), NOW);
    expect(steps[2].detail).toBe("transcoding 720p · 52% · attempt 2 of 4");
  });
});

describe("formatSeconds", () => {
  it.each([
    [6.84, "6.8 s"],
    [41.2, "41 s"],
    [72, "1 min 12 s"],
  ])("%s -> %s", (input, expected) => expect(formatSeconds(input)).toBe(expected));
});
