"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge, isInProgress, statusHint } from "@/components/StatusBadge";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import type { Video } from "@/lib/types";

type Row = { video: Video; pendingUploadId: string | null };

/** How often to refresh while any video is still moving through the pipeline. (Page files may not export extras.) */
const POLL_INTERVAL_MS = 3000;

const BUTTON =
  "inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-sm font-[550] hover:bg-s2 disabled:opacity-60";

function Thumbnail({ video }: { video: Video }) {
  return (
    <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-s2 sm:w-40">
      {video.thumbnail_url ? (
        // Plain <img>: served by the API with the owner's session cookie.
        <img src={video.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div aria-hidden="true" className="flex h-full w-full items-center justify-center text-xs text-subtle">
          {video.status === "ready" ? "No thumbnail" : "Processing"}
        </div>
      )}
      {video.duration_seconds !== null && (
        <span className="absolute bottom-1 right-1 tnum rounded bg-black/75 px-1 py-0.5 text-[11px] font-medium text-text">
          {formatDuration(video.duration_seconds)}
        </span>
      )}
    </div>
  );
}

function Progress({ video }: { video: Video }) {
  if (video.status !== "queued" && video.status !== "processing") {
    return null;
  }
  const percent = video.processing_progress ?? 0;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={`Processing progress for ${video.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-40 overflow-hidden rounded-full bg-s2"
      >
        <div className="h-full bg-amber transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      <span className="tnum text-[13px] text-muted">{video.status === "queued" ? "Waiting in queue" : `${percent}%`}</span>
    </div>
  );
}

/** Creator dashboard: every video the signed-in user owns, with its live upload/processing state. */
export default function StudioPage() {
  const { user, status } = useAuth();
  const userId = user?.id;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const channels = await api.myChannels();
      const [pages, pending] = await Promise.all([
        Promise.all(channels.map((channel) => api.channelVideos(channel.handle, { limit: 50 }))),
        api.listUploads({ status: "pending" }),
      ]);
      const pendingByVideo = new Map(pending.items.map((upload) => [upload.video_id, upload.id]));
      const videos = pages
        .flatMap((page) => page.items)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      setRows(videos.map((video) => ({ video, pendingUploadId: pendingByVideo.get(video.id) ?? null })));
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    if (userId) {
      void load();
    }
  }, [userId, load]);

  // Status polling: refresh while anything is uploading, queued or processing, then stop.
  const pipelineActive = rows?.some(({ video }) => isInProgress(video.status)) ?? false;
  useEffect(() => {
    if (!userId || !pipelineActive) {
      return;
    }
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [userId, pipelineActive, load]);

  async function act(videoId: string, action: () => Promise<unknown>) {
    setBusyId(videoId);
    try {
      await action();
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (status === "loading") {
    return <div aria-busy="true" aria-label="Loading" className="wrap mt-10 h-64 rounded-[var(--radius-card)] bg-s1" />;
  }
  if (!user) {
    return (
      <div className="wrap max-w-md py-20 text-center">
        <h1 className="mb-5 text-2xl font-semibold">Sign in to see your videos</h1>
        <Link href="/login" className="inline-flex h-11 items-center rounded-lg bg-sage px-5 font-[550] text-bg hover:bg-sage-hover">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="wrap flex max-w-5xl flex-col gap-6 pt-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-[650] tracking-[-0.03em]">Your videos</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className={BUTTON}>
            Refresh
          </button>
          <Link href="/upload" className="inline-flex h-9 items-center rounded-lg bg-sage px-4 text-sm font-[550] text-bg hover:bg-sage-hover">
            Upload
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-s1 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {rows === null ? (
        !error && <div aria-busy="true" aria-label="Loading" className="h-40 rounded-[var(--radius-card)] bg-s1" />
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-control p-8 text-center text-muted">
          You haven&apos;t uploaded anything yet.{" "}
          <Link href="/upload" className="text-sage underline underline-offset-4 hover:text-sage-hover">
            Upload your first video
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-s1">
          {rows.map(({ video, pendingUploadId }) => (
            <li key={video.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <Thumbnail video={video} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-[550]">
                  {video.status === "ready" ? (
                    <Link href={`/watch/${video.id}`} className="hover:underline">
                      {video.title}
                    </Link>
                  ) : (
                    video.title
                  )}
                </h2>
                <p className="tnum text-[13px] text-muted">
                  {video.channel.name} · {video.visibility} · {formatRelativeTime(video.created_at)}
                </p>
                {video.status === "failed" && video.processing_error ? (
                  <p className="mt-1 text-sm text-danger">{video.processing_error}</p>
                ) : (
                  <p className="mt-1 text-sm text-subtle">{statusHint(video.status)}</p>
                )}
                <Progress video={video} />
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <StatusBadge status={video.status} progress={video.processing_progress} />
                {video.status === "ready" && (
                  <Link href={`/watch/${video.id}`} className={BUTTON}>
                    Watch
                  </Link>
                )}
                {pendingUploadId && (
                  <button
                    type="button"
                    disabled={busyId === video.id}
                    onClick={() => void act(video.id, () => api.cancelUpload(pendingUploadId))}
                    className={BUTTON}
                  >
                    Cancel upload
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === video.id}
                  onClick={() => {
                    if (window.confirm(`Delete “${video.title}”? This also deletes the uploaded file and all generated streams.`)) {
                      void act(video.id, () => api.deleteVideo(video.id));
                    }
                  }}
                  className={BUTTON}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
