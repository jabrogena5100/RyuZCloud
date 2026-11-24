// Mirrors the backend response schemas (see docs/api.md).

export type User = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
};

export type ChannelSummary = {
  id: string;
  handle: string;
  name: string;
};

export type Channel = {
  id: string;
  owner_id: string;
  handle: string;
  name: string;
  description: string;
  created_at: string;
};

/** draft = pending upload; queued = verified and waiting for a worker; processing = being transcoded. */
export type VideoStatus = "draft" | "uploading" | "queued" | "processing" | "ready" | "failed";
export type VideoVisibility = "public" | "unlisted" | "private";

export type Video = {
  id: string;
  channel: ChannelSummary;
  title: string;
  description: string;
  status: VideoStatus;
  visibility: VideoVisibility;
  duration_seconds: number | null;
  view_count: number;
  created_at: string;
  published_at: string | null;
  thumbnail_url: string | null;
  playback_url: string | null;
  /** 0-100 while queued or processing, otherwise null. */
  processing_progress: number | null;
  /** Owner-facing reason when status is "failed". */
  processing_error: string | null;
  /** The curated collection the video belongs to, if any. */
  collection: CollectionRef | null;
};

export type CollectionRef = { slug: string; title: string };

/** Counts cover public, ready videos only. */
export type Collection = {
  slug: string;
  title: string;
  description: string;
  video_count: number;
  total_seconds: number;
  hls_bytes: number;
  cover_url: string | null;
};

export type CollectionPage = VideoPage & { collection: Collection };

/** Aggregates of the public library, computed by the API from stored rows. */
export type LibraryStats = {
  videos: number;
  total_seconds: number;
  renditions: number;
  hls_bytes: number;
  jobs_succeeded: number;
  jobs_retried: number;
  /** Median processing wall time / video duration; null until a job has finished. */
  median_processing_ratio: number | null;
};

export type Rendition = {
  name: string;
  width: number;
  height: number;
  bandwidth_bps: number;
  segment_count: number;
  size_bytes: number;
};

export type JobState = "queued" | "processing" | "retry" | "succeeded" | "failed";

/** How one video moved through upload, queue and worker. */
export type Pipeline = {
  video_id: string;
  status: VideoStatus;
  duration_seconds: number | null;
  upload: { size_bytes: number; content_type: string; created_at: string; completed_at: string | null } | null;
  job: {
    state: JobState;
    /** Worker stage: queued, starting, downloading, analyzing, "transcoding 360p", thumbnail, uploading, done, failed, "waiting to retry". */
    stage: string;
    progress: number;
    attempts: number;
    max_attempts: number;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  } | null;
  renditions: Rendition[];
};

export type VideoPage = {
  items: Video[];
  limit: number;
  offset: number;
};

export type UploadStatus = "pending" | "uploaded" | "failed" | "cancelled" | "expired";

export type Upload = {
  id: string;
  video_id: string;
  status: UploadStatus;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  failure_reason: string | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
};

/** Where and how the browser sends the file: straight to object storage. */
export type UploadTarget = {
  method: string;
  url: string;
  headers: Record<string, string>;
  expires_at: string;
};

export type InitiatedUpload = {
  upload: Upload;
  video: { id: string; title: string; status: VideoStatus; visibility: VideoVisibility };
  target: UploadTarget;
};

export type UploadLimits = {
  max_bytes: number;
  allowed_content_types: string[];
  allowed_extensions: string[];
  url_ttl_seconds: number;
};

export type ApiErrorDetail = {
  loc: (string | number)[];
  msg: string;
  type: string;
};

/** Display model for a video card. */
export type VideoCardData = {
  id: string;
  title: string;
  channelName: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  collectionTitle?: string | null;
  /** Where clicking the card goes; omitted when the video is not watchable yet. */
  href?: string;
};
