"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dropzone } from "@/components/Dropzone";
import { LivePipeline } from "@/components/LivePipeline";
import { INPUT as BASE_INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatBytes } from "@/lib/format";
import type { Channel, UploadLimits, VideoVisibility } from "@/lib/types";
import {
  contentTypeFor,
  describeUploadError,
  titleFromFilename,
  UploadAbortedError,
  validateFile,
} from "@/lib/upload";
import { runUpload, type UploadStage } from "@/lib/uploadFlow";

const INPUT = `${BASE_INPUT} py-2.5 text-[15px]`;
const LABEL = "text-sm text-muted";

const STAGE_LABEL: Record<UploadStage, string> = {
  starting: "Preparing upload…",
  uploading: "Uploading to storage…",
  finalizing: "Verifying upload…",
};

const VISIBILITY_HELP: Record<VideoVisibility, string> = {
  private: "Only you can see this video.",
  unlisted: "Anyone with the link can watch, once processing is available.",
  public: "Listed on the home feed once processing is available.",
};

function Alert({ children, tone }: { children: string; tone: "error" | "info" }) {
  const colors = tone === "error" ? "border-danger/40 text-danger" : "border-line text-muted";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg border bg-s1 px-3 py-2 text-sm ${colors}`}>
      {children}
    </p>
  );
}

function CreateChannelForm({ onCreated }: { onCreated: (channel: Channel) => void }) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      onCreated(await api.createChannel({ handle: handle.trim().toLowerCase(), name: name.trim() }));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-s1 p-6">
      <div>
        <h2 className="text-lg font-semibold">Create your channel</h2>
        <p className="text-sm text-muted">Videos are uploaded to a channel. You only need to do this once.</p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="channel-name" className={LABEL}>Channel name</label>
        <input id="channel-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="channel-handle" className={LABEL}>Handle</label>
        <input
          id="channel-handle"
          required
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9][A-Za-z0-9_\-]{2,29}"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className={INPUT}
        />
        <p className="text-sm text-subtle">3-30 letters, numbers, underscores or hyphens. It can&apos;t be changed later.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" disabled={submitting} className={`self-start ${PRIMARY_BUTTON}`}>
        {submitting ? "Creating…" : "Create channel"}
      </button>
    </form>
  );
}

export default function UploadPage() {
  const { user, status } = useAuth();
  const userId = user?.id;

  const [limits, setLimits] = useState<UploadLimits | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [channelId, setChannelId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<VideoVisibility>("private");

  const [stage, setStage] = useState<UploadStage | null>(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [completedTitle, setCompletedTitle] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load what the form needs once we know who is signed in.
  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    Promise.all([api.uploadLimits(), api.myChannels()])
      .then(([nextLimits, nextChannels]) => {
        if (cancelled) {
          return;
        }
        setLimits(nextLimits);
        setChannels(nextChannels);
        setChannelId((current) => current || nextChannels[0]?.id || "");
      })
      .catch((err: unknown) => !cancelled && setLoadError(describeError(err)));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Closing the tab mid-upload loses the upload; ask first.
  const uploading = stage !== null;
  useEffect(() => {
    if (!uploading) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  function handleFile(selected: File) {
    setNotice(null);
    const problem = limits ? validateFile(selected, limits) : null;
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setError(null);
    setFile(selected);
    setTitle((current) => current || titleFromFilename(selected.name));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !limits || !channelId) {
      return;
    }
    const problem = validateFile(file, limits);
    if (problem) {
      setError(problem);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setNotice(null);
    setProgress({ loaded: 0, total: file.size });
    setStage("starting");
    try {
      const result = await runUpload(
        { channelId, title: title.trim(), description, visibility, file, contentType: contentTypeFor(file) },
        {
          signal: controller.signal,
          onStage: setStage,
          onProgress: (loaded, total) => setProgress({ loaded, total }),
        },
      );
      setCompletedTitle(title.trim());
      setVideoId(result?.session?.video?.id ?? null);
    } catch (err) {
      if (err instanceof UploadAbortedError) {
        setNotice("Upload cancelled. Nothing was saved.");
      } else {
        setError(describeUploadError(err));
      }
    } finally {
      abortRef.current = null;
      setStage(null);
    }
  }

  function resetForm() {
    setCompletedTitle(null);
    setVideoId(null);
    setFile(null);
    setTitle("");
    setDescription("");
    setError(null);
    setNotice(null);
  }

  if (status === "loading") {
    return <div aria-busy="true" aria-label="Loading" className="wrap mt-10 h-64 rounded-[var(--radius-card)] bg-s1" />;
  }

  if (!user) {
    return (
      <div className="wrap max-w-md py-20 text-center">
        <h1 className="mb-2 text-2xl font-semibold">Sign in to upload</h1>
        <p className="mb-6 text-muted">You need an account to upload videos. It takes a few seconds, and any email works.</p>
        <Link href="/login" className={PRIMARY_BUTTON}>
          Sign in
        </Link>
      </div>
    );
  }

  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;

  return (
    <div className="wrap grid gap-8 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6">
      <div>
        <p className="eyebrow">Upload</p>
        <h1 className="mt-2.5 text-[clamp(30px,4vw,44px)] leading-[1.05] font-[650] tracking-[-0.03em]">Send a clip straight to storage</h1>
        <p className="mt-2 max-w-[52ch] text-muted">
          Your browser uploads the file directly to object storage with a short-lived signed URL. The API never touches the
          bytes; a worker picks the job up and builds the HLS renditions.
        </p>
      </div>

      {loadError && <Alert tone="error">{loadError}</Alert>}

      {completedTitle !== null ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-sage/45 bg-s1 p-6">
          <h2 className="text-lg font-semibold">Upload complete</h2>
          <p className="text-sm">
            “{completedTitle}” was uploaded and verified. It&apos;s now <strong>queued for processing</strong>: it will be
            converted to streaming formats and get a thumbnail, then become watchable. You can follow its progress in your
            videos.
          </p>
          <div className="flex gap-3">
            <Link href="/studio" className={PRIMARY_BUTTON}>
              View your videos
            </Link>
            <button type="button" onClick={resetForm} className={SECONDARY_BUTTON}>
              Upload another
            </button>
          </div>
        </div>
      ) : channels === null || limits === null ? (
        !loadError && <div aria-busy="true" aria-label="Loading" className="h-64 rounded-[var(--radius-card)] bg-s1" />
      ) : channels.length === 0 ? (
        <CreateChannelForm
          onCreated={(channel) => {
            setChannels([channel]);
            setChannelId(channel.id);
          }}
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Dropzone
            file={file}
            disabled={uploading}
            accept={[...limits.allowed_extensions, ...limits.allowed_content_types].join(",")}
            onFile={handleFile}
          />
          <p className="tnum -mt-3 text-sm text-subtle">
            {limits.allowed_extensions.join(", ")} · up to {formatBytes(limits.max_bytes)}
          </p>

          {channels.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="channel" className={LABEL}>Channel</label>
              <select id="channel" value={channelId} disabled={uploading} onChange={(e) => setChannelId(e.target.value)} className={INPUT}>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name} (@{channel.handle})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="title" className={LABEL}>Title</label>
            <input id="title" required maxLength={100} value={title} disabled={uploading} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="description" className={LABEL}>Description</label>
            <textarea
              id="description"
              rows={4}
              maxLength={5000}
              value={description}
              disabled={uploading}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="visibility" className={LABEL}>Visibility</label>
            <select
              id="visibility"
              value={visibility}
              disabled={uploading}
              onChange={(e) => setVisibility(e.target.value as VideoVisibility)}
              className={INPUT}
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
            <p className="text-sm text-subtle">{VISIBILITY_HELP[visibility]}</p>
          </div>

          {stage && (
            <div className="flex flex-col gap-2">
              <div className="tnum flex justify-between text-sm text-muted">
                <span>{STAGE_LABEL[stage]}</span>
                <span>
                  {stage === "uploading" ? `${percent}% · ${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}` : ""}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stage === "uploading" ? percent : stage === "finalizing" ? 100 : 0}
                className="h-1.5 overflow-hidden rounded-full bg-s2"
              >
                <div
                  className="h-full bg-sage transition-[width] duration-200"
                  style={{ width: `${stage === "uploading" ? percent : stage === "finalizing" ? 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="info">{notice}</Alert>}

          <div className="flex gap-3">
            <button type="submit" disabled={!file || !title.trim() || uploading} className={PRIMARY_BUTTON}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
            {stage === "uploading" && (
              <button type="button" onClick={() => abortRef.current?.abort()} className={SECONDARY_BUTTON}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      </div>
      {channels !== null && channels.length > 0 && (
        <LivePipeline videoId={videoId} uploadStage={stage} uploadPercent={percent} />
      )}
    </div>
  );
}
