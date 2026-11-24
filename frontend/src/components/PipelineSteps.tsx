import { formatSeconds, type PipelineStep, type StepStatus } from "@/lib/pipeline";

/*
 * Adapted from "Steps" by adit-firdaus on 21st.dev (https://21st.dev/@adit-firdaus/components/steps).
 * Kept: an ordered list with per-step status (complete / current / upcoming / error), aria-current on
 * the current step, and a spoken status word that the marker colour carries visually.
 * Changed: vertical only; no clickable mode, sliding thumb or press feedback (a pipeline is watched,
 * not navigated); react-icons replaced by text glyphs; colours from the design tokens (sage done,
 * amber in progress, danger failed); each step shows what system ran it and its measured time.
 */

const STATUS_LABEL: Record<StepStatus, string> = {
  complete: "Completed",
  current: "In progress",
  upcoming: "Not started",
  error: "Failed",
};

const MARKER: Record<StepStatus, string> = {
  complete: "border-sage bg-sage text-bg",
  current: "border-amber bg-s1 text-amber",
  upcoming: "border-line-strong bg-s1 text-subtle",
  error: "border-danger bg-s1 text-danger",
};

export function PipelineSteps({ steps, label = "Processing pipeline" }: { steps: PipelineStep[]; label?: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li
            key={step.key}
            data-status={step.status}
            aria-current={step.status === "current" ? "step" : undefined}
            className="relative grid grid-cols-[28px_1fr_auto] gap-x-3.5 pb-5 last:pb-0"
          >
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute top-7 bottom-0.5 left-[13px] w-0.5 ${step.status === "complete" ? "bg-sage" : "bg-line-strong"}`}
              />
            )}
            <span
              aria-hidden="true"
              className={`tnum relative z-10 grid h-7 w-7 place-items-center rounded-full border-2 text-[13px] font-semibold ${MARKER[step.status]}`}
            >
              {step.status === "complete" ? "✓" : step.status === "error" ? "!" : index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[15px] font-semibold">
                {step.title}
                <span className="sr-only">: {STATUS_LABEL[step.status]}</span>
              </p>
              <p className="text-sm text-muted">{step.what}</p>
              {step.detail && (
                <p className={`tnum mt-1 text-[13px] ${step.status === "error" ? "text-danger" : step.status === "current" ? "text-amber" : "text-muted"}`}>
                  {step.detail}
                </p>
              )}
            </div>
            <span className={`tnum pt-1 text-[13px] whitespace-nowrap ${step.status === "current" ? "text-amber" : "text-muted"}`}>
              {step.seconds === null ? "—" : formatSeconds(step.seconds)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
