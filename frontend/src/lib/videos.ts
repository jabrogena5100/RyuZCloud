import type { Video, VideoCardData } from "./types";

export function toVideoCardData(video: Video): VideoCardData {
  return {
    id: video.id,
    title: video.title,
    channelName: video.channel.name,
    publishedAt: video.published_at,
    durationSeconds: video.duration_seconds,
    thumbnailUrl: video.thumbnail_url,
    collectionTitle: video.collection?.title ?? null,
    href: video.status === "ready" ? `/watch/${video.id}` : undefined,
  };
}
