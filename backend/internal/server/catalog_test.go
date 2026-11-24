package server_test

import (
	"fmt"
	"net/http"
	"net/url"
	"testing"
)

func addCollection(t *testing.T, slug, title string, position int) {
	t.Helper()
	execSQL(t, `INSERT INTO collections (slug, title, description, position) VALUES ($1, $2, $3, $4)`, slug, title, "About "+title, position)
}

func addRendition(t *testing.T, videoID, name string, height, sizeBytes int) {
	t.Helper()
	execSQL(t, `INSERT INTO video_renditions (video_id, name, width, height, bandwidth_bps, segment_count, size_bytes, playlist_key)
		VALUES ($1, $2, $3, $4, 800000, 3, $5, $6)`,
		videoID, name, height*16/9, height, sizeBytes, fmt.Sprintf("videos/%s/hls/%s/index.m3u8", videoID, name))
}

func TestCollectionsListCountsOnlyPublicReadyVideos(t *testing.T) {
	app := newTestApp(t)
	alice, channelID := aliceWithChannel(app)
	addCollection(t, "coastlines", "Coastlines", 2)
	addCollection(t, "after-dark", "After dark", 1)

	public := str(alice.createVideo(channelID, map[string]any{"title": "Low tide"}), "id")
	publish(t, public)
	execSQL(t, `UPDATE videos SET duration_seconds = 90 WHERE id = $1`, public)
	addRendition(t, public, "360p", 360, 1000)
	private := str(alice.createVideo(channelID, map[string]any{"title": "Draft clip"}), "id")
	for _, id := range []string{public, private} {
		expectStatus(t, alice.patch("/api/v1/videos/"+id, map[string]any{"collection": "coastlines"}), http.StatusOK)
	}

	resp := app.browser().get("/api/v1/collections")
	expectStatus(t, resp, http.StatusOK)
	list := items(t, resp)
	if len(list) != 2 {
		t.Fatalf("want 2 collections, got %v", list)
	}
	first, _ := list[0].(map[string]any)
	second, _ := list[1].(map[string]any)
	if str(first, "slug") != "after-dark" || str(second, "slug") != "coastlines" {
		t.Fatalf("collections should follow position order: %v", list)
	}
	if first["video_count"] != float64(0) || first["cover_url"] != nil {
		t.Errorf("empty collection: %v", first)
	}
	if second["video_count"] != float64(1) || second["total_seconds"] != float64(90) || second["hls_bytes"] != float64(1000) {
		t.Errorf("counts should include only the public, ready video: %v", second)
	}
}

func TestCollectionPageListsItsVideos(t *testing.T) {
	app := newTestApp(t)
	alice, channelID := aliceWithChannel(app)
	addCollection(t, "coastlines", "Coastlines", 0)
	id := str(alice.createVideo(channelID, nil), "id")
	publish(t, id)
	resp := alice.patch("/api/v1/videos/"+id, map[string]any{"collection": "coastlines"})
	expectStatus(t, resp, http.StatusOK)
	if c, _ := resp.object(t)["collection"].(map[string]any); str(c, "slug") != "coastlines" || str(c, "title") != "Coastlines" {
		t.Fatalf("video should name its collection: %s", resp.body)
	}

	resp = app.browser().get("/api/v1/collections/coastlines")
	expectStatus(t, resp, http.StatusOK)
	body := resp.object(t)
	if c, _ := body["collection"].(map[string]any); str(c, "title") != "Coastlines" {
		t.Errorf("missing collection summary: %v", body)
	}
	if list := items(t, resp); len(list) != 1 {
		t.Errorf("want 1 video, got %v", list)
	}

	resp = app.browser().get("/api/v1/collections/no-such-thing")
	expectStatus(t, resp, http.StatusNotFound)
	if resp.errorCode(t) != "collection_not_found" {
		t.Errorf("unexpected error: %s", resp.body)
	}
}

func TestVideoCollectionCanBeClearedAndMustExist(t *testing.T) {
	app := newTestApp(t)
	alice, channelID := aliceWithChannel(app)
	addCollection(t, "coastlines", "Coastlines", 0)
	id := str(alice.createVideo(channelID, nil), "id")

	resp := alice.patch("/api/v1/videos/"+id, map[string]any{"collection": "missing"})
	expectStatus(t, resp, http.StatusNotFound)
	if resp.errorCode(t) != "collection_not_found" {
		t.Errorf("unexpected error: %s", resp.body)
	}

	expectStatus(t, alice.patch("/api/v1/videos/"+id, map[string]any{"collection": "coastlines"}), http.StatusOK)
	resp = alice.patch("/api/v1/videos/"+id, map[string]any{"collection": nil})
	expectStatus(t, resp, http.StatusOK)
	if resp.object(t)["collection"] != nil {
		t.Errorf("collection should be cleared: %s", resp.body)
	}

	// Leaving the field out keeps the collection.
	expectStatus(t, alice.patch("/api/v1/videos/"+id, map[string]any{"collection": "coastlines"}), http.StatusOK)
	resp = alice.patch("/api/v1/videos/"+id, map[string]any{"title": "Renamed"})
	expectStatus(t, resp, http.StatusOK)
	if c, _ := resp.object(t)["collection"].(map[string]any); str(c, "slug") != "coastlines" {
		t.Errorf("an unrelated update must not clear the collection: %s", resp.body)
	}
}

func TestOnlyTheOwnerCanChangeACollection(t *testing.T) {
	app := newTestApp(t)
	alice, channelID := aliceWithChannel(app)
	addCollection(t, "coastlines", "Coastlines", 0)
	id := str(alice.createVideo(channelID, nil), "id")
	publish(t, id)
	resp := app.signedIn("bob@example.com").patch("/api/v1/videos/"+id, map[string]any{"collection": "coastlines"})
	expectStatus(t, resp, http.StatusForbidden)
}

func TestFeaturedPrefersTheFeaturedVideo(t *testing.T) {
	app := newTestApp(t)
	expectStatus(t, app.browser().get("/api/v1/videos/featured"), http.StatusNotFound)

	alice, channelID := aliceWithChannel(app)
	older := str(alice.createVideo(channelID, map[string]any{"title": "Older"}), "id")
	publish(t, older)
	newer := str(alice.createVideo(channelID, map[string]any{"title": "Newer"}), "id")
	publish(t, newer)
	execSQL(t, `UPDATE videos SET published_at = now() + interval '1 minute' WHERE id = $1`, newer)

	resp := app.browser().get("/api/v1/videos/featured")
	expectStatus(t, resp, http.StatusOK)
	if str(resp.object(t), "id") != newer {
		t.Errorf("without a featured flag the newest video is used: %s", resp.body)
	}

	execSQL(t, `UPDATE videos SET featured_at = now() WHERE id = $1`, older)
	resp = app.browser().get("/api/v1/videos/featured")
	expectStatus(t, resp, http.StatusOK)
	if str(resp.object(t), "id") != older {
		t.Errorf("the featured video should win: %s", resp.body)
	}

	// A featured video that is not public is never shown.
	execSQL(t, `UPDATE videos SET visibility = 'private' WHERE id = $1`, older)
	resp = app.browser().get("/api/v1/videos/featured")
	expectStatus(t, resp, http.StatusOK)
	if str(resp.object(t), "id") != newer {
		t.Errorf("a private featured video must be skipped: %s", resp.body)
	}
}

func TestFeedSearchMatchesTitleAndTreatsWildcardsLiterally(t *testing.T) {
	app := newTestApp(t)
	alice, channelID := aliceWithChannel(app)
	for _, title := range []string{"Harbour lights", "Sea stacks in mist", "100% fog"} {
		publish(t, str(alice.createVideo(channelID, map[string]any{"title": title}), "id"))
	}
	hidden := str(alice.createVideo(channelID, map[string]any{"title": "Harbour draft"}), "id")
	_ = hidden // stays private and a draft

	search := func(q string) []any {
		resp := app.browser().get("/api/v1/videos?q=" + url.QueryEscape(q))
		expectStatus(t, resp, http.StatusOK)
		return items(t, resp)
	}
	if got := search("harbour"); len(got) != 1 {
		t.Errorf("case-insensitive title match should find 1 public video, got %v", got)
	}
	if got := search("%"); len(got) != 1 {
		t.Errorf("%% must match literally (only \"100%% fog\"), got %v", got)
	}
	if got := search("   "); len(got) != 3 {
		t.Errorf("a blank query is the plain feed, got %d items", len(got))
	}
	long := make([]byte, 101)
	for i := range long {
		long[i] = 'a'
	}
	expectStatus(t, app.browser().get("/api/v1/videos?q="+string(long)), http.StatusUnprocessableEntity)
}

func TestStatsAggregatePublicLibrary(t *testing.T) {
	app := newTestApp(t)
	resp := app.browser().get("/api/v1/stats")
	expectStatus(t, resp, http.StatusOK)
	empty := resp.object(t)
	if empty["videos"] != float64(0) || empty["median_processing_ratio"] != nil {
		t.Fatalf("empty library: %v", empty)
	}

	alice, channelID := aliceWithChannel(app)
	id := str(alice.createVideo(channelID, nil), "id")
	publish(t, id)
	execSQL(t, `UPDATE videos SET duration_seconds = 60 WHERE id = $1`, id)
	addRendition(t, id, "360p", 360, 1500)
	addRendition(t, id, "720p", 720, 4500)
	alice.createVideo(channelID, nil) // private draft: not counted

	resp = app.browser().get("/api/v1/stats")
	expectStatus(t, resp, http.StatusOK)
	s := resp.object(t)
	if s["videos"] != float64(1) || s["total_seconds"] != float64(60) || s["renditions"] != float64(2) || s["hls_bytes"] != float64(6000) {
		t.Errorf("unexpected stats: %v", s)
	}
}

func TestPipelineIsVisibleToViewersOnly(t *testing.T) {
	app := newTestApp(t)
	alice, channelID := aliceWithChannel(app)
	id := str(alice.createVideo(channelID, nil), "id")

	// A private draft is the owner's business.
	expectStatus(t, app.browser().get("/api/v1/videos/"+id+"/pipeline"), http.StatusNotFound)
	resp := alice.get("/api/v1/videos/" + id + "/pipeline")
	expectStatus(t, resp, http.StatusOK)
	if p := resp.object(t); p["upload"] != nil || p["job"] != nil {
		t.Errorf("a draft has no upload or job yet: %v", p)
	}

	publish(t, id)
	addRendition(t, id, "720p", 720, 4500)
	addRendition(t, id, "360p", 360, 1500)
	resp = app.browser().get("/api/v1/videos/" + id + "/pipeline")
	expectStatus(t, resp, http.StatusOK)
	p := resp.object(t)
	renditions, _ := p["renditions"].([]any)
	if str(p, "status") != "ready" || len(renditions) != 2 {
		t.Fatalf("unexpected pipeline: %v", p)
	}
	if first, _ := renditions[0].(map[string]any); str(first, "name") != "360p" {
		t.Errorf("renditions should be ordered by height: %v", renditions)
	}
}
