import type { APIRequestContext } from "@playwright/test";

/** Pages every browser test covers. Dynamic pages are added when the library has content. */
export const STATIC_PAGES = ["/", "/collections", "/login", "/register", "/upload", "/studio", "/credits"];

type Page<T> = { items: T[] };

/** A ready public video and a collection with clips, if the running stack has any. */
export async function contentPages(request: APIRequestContext): Promise<{ watch: string | null; collection: string | null }> {
  const videos = (await request.get("/api/v1/videos?limit=1").then((r) => (r.ok() ? r.json() : { items: [] }))) as Page<{ id: string }>;
  const collections = (await request
    .get("/api/v1/collections")
    .then((r) => (r.ok() ? r.json() : { items: [] }))) as Page<{ slug: string; video_count: number }>;
  const withClips = collections.items.find((c) => c.video_count > 0);
  return {
    watch: videos.items[0] ? `/watch/${videos.items[0].id}` : null,
    collection: withClips ? `/collections/${withClips.slug}` : null,
  };
}

export async function allPages(request: APIRequestContext): Promise<string[]> {
  const { watch, collection } = await contentPages(request);
  return [...STATIC_PAGES, ...(collection ? [collection] : []), ...(watch ? [watch] : [])];
}
