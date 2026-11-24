package videos

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/jabrogena5100/RyuCloud/backend/internal/auth"
	"github.com/jabrogena5100/RyuCloud/backend/internal/httpx"
)

// The catalog endpoints read the public library: curated collections, the featured video,
// library-wide statistics, and how one video went through the pipeline. Everything here is
// derived from rows the upload service and the worker already write; nothing is estimated.

var (
	errCollectionNotFound = httpx.NewError(http.StatusNotFound, "collection_not_found", "Collection not found.")
	errNoFeatured         = httpx.NewError(http.StatusNotFound, "video_not_found", "No video is available to feature yet.")
)

// Collection summarises one curated collection. Counts cover public, ready videos only.
type Collection struct {
	Slug         string  `json:"slug"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	VideoCount   int64   `json:"video_count"`
	TotalSeconds int64   `json:"total_seconds"`
	HLSBytes     int64   `json:"hls_bytes"`
	CoverURL     *string `json:"cover_url"`
}

// CollectionPage is one collection with a page of its videos.
type CollectionPage struct {
	Collection Collection `json:"collection"`
	Page
}

// Stats describes the public library and the jobs that produced it.
type Stats struct {
	Videos       int64 `json:"videos"`
	TotalSeconds int64 `json:"total_seconds"`
	Renditions   int64 `json:"renditions"`
	HLSBytes     int64 `json:"hls_bytes"`
	// Jobs behind the public library: how many succeeded, and how many of those needed
	// more than one attempt (a crash, a lost lease or a transient error was recovered).
	JobsSucceeded int64 `json:"jobs_succeeded"`
	JobsRetried   int64 `json:"jobs_retried"`
	// Median of (processing wall time / video duration) over those jobs, from the first claim
	// to completion. Null until at least one job has finished.
	MedianProcessingRatio *float64 `json:"median_processing_ratio"`
}

// Rendition is one generated HLS variant.
type Rendition struct {
	Name         string `json:"name"`
	Width        int32  `json:"width"`
	Height       int32  `json:"height"`
	BandwidthBPS int64  `json:"bandwidth_bps"`
	SegmentCount int32  `json:"segment_count"`
	SizeBytes    int64  `json:"size_bytes"`
}

// PipelineUpload is the browser-to-storage leg of the pipeline.
type PipelineUpload struct {
	SizeBytes   int64      `json:"size_bytes"`
	ContentType string     `json:"content_type"`
	CreatedAt   time.Time  `json:"created_at"`
	CompletedAt *time.Time `json:"completed_at"`
}

// PipelineJob is the worker leg of the pipeline.
type PipelineJob struct {
	State       string     `json:"state"`
	Stage       string     `json:"stage"`
	Progress    int16      `json:"progress"`
	Attempts    int32      `json:"attempts"`
	MaxAttempts int32      `json:"max_attempts"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at"`
}

// Pipeline is how one video moved through upload, queue and worker.
type Pipeline struct {
	VideoID         string          `json:"video_id"`
	Status          string          `json:"status"`
	DurationSeconds *int32          `json:"duration_seconds"`
	Upload          *PipelineUpload `json:"upload"`
	Job             *PipelineJob    `json:"job"`
	Renditions      []Rendition     `json:"renditions"`
}

// catalogRoutes registers the catalog endpoints (called from Routes).
func (h *Handler) catalogRoutes(mux *http.ServeMux, prefix string) {
	mux.Handle("GET "+prefix+"/collections", httpx.Handler(h.collections))
	mux.Handle("GET "+prefix+"/collections/{slug}", httpx.Handler(h.collection))
	mux.Handle("GET "+prefix+"/videos/featured", httpx.Handler(h.featured))
	mux.Handle("GET "+prefix+"/stats", httpx.Handler(h.stats))
	mux.Handle("GET "+prefix+"/videos/{id}/pipeline", h.auth.Optional(h.pipeline))
}

const selectCollections = `SELECT c.slug, c.title, c.description,
		(SELECT count(*) FROM videos v WHERE v.collection_id = c.id AND ` + publiclyListed + `),
		(SELECT COALESCE(sum(v.duration_seconds), 0)::bigint FROM videos v WHERE v.collection_id = c.id AND ` + publiclyListed + `),
		(SELECT COALESCE(sum(r.size_bytes), 0)::bigint FROM video_renditions r JOIN videos v ON v.id = r.video_id
		  WHERE v.collection_id = c.id AND ` + publiclyListed + `),
		cover.id, cover.thumbnail_object_key
	FROM collections c
	LEFT JOIN LATERAL (
		SELECT v.id, v.thumbnail_object_key FROM videos v
		WHERE v.collection_id = c.id AND ` + publiclyListed + `
		` + newestFirst + ` LIMIT 1
	) cover ON true`

func (h *Handler) scanCollection(row scanner) (Collection, error) {
	var (
		c                 Collection
		coverID, coverKey *string
	)
	if err := row.Scan(&c.Slug, &c.Title, &c.Description, &c.VideoCount, &c.TotalSeconds, &c.HLSBytes, &coverID, &coverKey); err != nil {
		return Collection{}, err
	}
	if coverID != nil {
		c.CoverURL = h.playback.ThumbnailURL(*coverID, coverKey)
	}
	return c, nil
}

// collections lists every collection in curated order, including empty ones.
func (h *Handler) collections(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.db.Query(r.Context(), selectCollections+` ORDER BY c.position, c.title`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Collection{}
	for rows.Next() {
		c, err := h.scanCollection(rows)
		if err != nil {
			return err
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
	return nil
}

// collection returns one collection and a page of its public, ready videos, newest first.
func (h *Handler) collection(w http.ResponseWriter, r *http.Request) error {
	limit, offset, err := pagination(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	c, err := h.scanCollection(h.db.QueryRow(ctx, selectCollections+` WHERE c.slug = $1`, r.PathValue("slug")))
	if errors.Is(err, pgx.ErrNoRows) {
		return errCollectionNotFound
	}
	if err != nil {
		return err
	}
	videos, err := h.list(ctx, selectVideos+` WHERE col.slug = $1 AND `+publiclyListed+` `+newestFirst+` LIMIT $2 OFFSET $3`,
		c.Slug, limit, offset)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, CollectionPage{Collection: c, Page: Page{Items: videos, Limit: limit, Offset: offset}})
	return nil
}

// featured returns the most recently featured public, ready video, or the newest one when
// nothing is featured.
func (h *Handler) featured(w http.ResponseWriter, r *http.Request) error {
	v, err := scanVideo(h.db.QueryRow(r.Context(), selectVideos+` WHERE `+publiclyListed+`
		ORDER BY v.featured_at DESC NULLS LAST, v.published_at DESC NULLS LAST, v.created_at DESC, v.id LIMIT 1`))
	if errors.Is(err, pgx.ErrNoRows) {
		return errNoFeatured
	}
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, h.withURLs(v))
	return nil
}

// stats summarises the public library. Every figure is an aggregate of stored rows.
func (h *Handler) stats(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var s Stats
	if err := h.db.QueryRow(ctx,
		`SELECT count(*), COALESCE(sum(v.duration_seconds), 0)::bigint FROM videos v WHERE `+publiclyListed,
	).Scan(&s.Videos, &s.TotalSeconds); err != nil {
		return err
	}
	if err := h.db.QueryRow(ctx,
		`SELECT count(*), COALESCE(sum(r.size_bytes), 0)::bigint
		 FROM video_renditions r JOIN videos v ON v.id = r.video_id WHERE `+publiclyListed,
	).Scan(&s.Renditions, &s.HLSBytes); err != nil {
		return err
	}
	if err := h.db.QueryRow(ctx,
		`SELECT count(*), count(*) FILTER (WHERE j.attempts > 1),
		        percentile_cont(0.5) WITHIN GROUP (
		            ORDER BY (extract(epoch FROM j.finished_at - j.started_at) / v.duration_seconds)::float8)
		 FROM processing_jobs j JOIN videos v ON v.id = j.video_id
		 WHERE j.state = 'succeeded' AND j.started_at IS NOT NULL AND j.finished_at IS NOT NULL
		   AND v.duration_seconds > 0 AND `+publiclyListed,
	).Scan(&s.JobsSucceeded, &s.JobsRetried, &s.MedianProcessingRatio); err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, s)
	return nil
}

// pipeline shows how a video moved through the system. Anyone who may view the video may see
// it; it contains sizes, timestamps and renditions, never storage keys, worker IDs or errors
// (the owner already gets processing_error on the video itself).
func (h *Handler) pipeline(w http.ResponseWriter, r *http.Request, user *auth.User) error {
	v, err := h.viewable(r, user)
	if err != nil {
		return err
	}
	ctx := r.Context()
	p := Pipeline{VideoID: v.ID, Status: v.Status, DurationSeconds: v.DurationSeconds, Renditions: []Rendition{}}

	var up PipelineUpload
	err = h.db.QueryRow(ctx,
		`SELECT COALESCE(verified_size_bytes, declared_size_bytes), content_type, created_at, completed_at
		 FROM video_uploads WHERE video_id = $1 ORDER BY (status = 'uploaded') DESC, created_at DESC LIMIT 1`, v.ID,
	).Scan(&up.SizeBytes, &up.ContentType, &up.CreatedAt, &up.CompletedAt)
	switch {
	case err == nil:
		p.Upload = &up
	case !errors.Is(err, pgx.ErrNoRows):
		return err
	}

	var job PipelineJob
	err = h.db.QueryRow(ctx,
		`SELECT state, stage, progress, attempts, max_attempts, created_at, started_at, finished_at
		 FROM processing_jobs WHERE video_id = $1`, v.ID,
	).Scan(&job.State, &job.Stage, &job.Progress, &job.Attempts, &job.MaxAttempts, &job.CreatedAt, &job.StartedAt, &job.FinishedAt)
	switch {
	case err == nil:
		p.Job = &job
	case !errors.Is(err, pgx.ErrNoRows):
		return err
	}

	rows, err := h.db.Query(ctx,
		`SELECT name, width, height, bandwidth_bps, segment_count, size_bytes
		 FROM video_renditions WHERE video_id = $1 ORDER BY height`, v.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var rd Rendition
		if err := rows.Scan(&rd.Name, &rd.Width, &rd.Height, &rd.BandwidthBPS, &rd.SegmentCount, &rd.SizeBytes); err != nil {
			return err
		}
		p.Renditions = append(p.Renditions, rd)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, p)
	return nil
}
