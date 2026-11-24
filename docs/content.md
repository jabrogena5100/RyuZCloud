# Demo library: sources, review, seeding

The demo library is built from two sources only, and seeded through the same path a browser uses, so
every clip exercises the real pipeline (presigned upload, verification, queue, worker, HLS).

| Source | Licence | Key |
| --- | --- | --- |
| Pixabay video API | Pixabay Content License (no attribution required; we credit anyway) | `PIXABAY_API_KEY` in your shell |
| Wikimedia Commons | CC0 or public domain, checked against each file page | none (set `WIKIMEDIA_CONTACT` to identify yourself to Wikimedia) |

Pixabay's API terms forbid "systematic mass downloads" and require 24-hour caching, so the flow is a few
cached searches, a human review, then a throttled download of the clips you picked. Wikimedia's media
servers throttle per client (HTTP 429 with `Retry-After`); the downloader waits and retries.

## Steps

```bash
cd ~/projects/RyuZCloud
python3 scripts/library.py search      # cached searches -> content/shortlist.json + content/review.html
xdg-open content/review.html            # tick clips (no identifiable faces, logos or brands); save the list as content/keep.txt
python3 scripts/library.py download    # kept clips -> content/media/ (git-ignored), content/manifest.json, frontend/public/credits.json
python3 scripts/library.py verify      # SHA-256 of every file against the manifest
python3 scripts/seed.py titles         # draft demo titles into content/titles.json for new clips; edit them
python3 scripts/library.py credits     # after moving clips between collections in titles.json
SEED_PASSWORD='...' python3 scripts/seed.py run   # upload through the real path, wait for the worker, write timings
SEED_PASSWORD='...' SEED_RETRY_FAILED=1 python3 scripts/seed.py run   # optional: delete clips that failed and upload them again
```

Committed: `content/collections.json`, `content/keep.txt`, `content/manifest.json`, `content/titles.json`,
`frontend/public/credits.json`. Never committed: `content/media/`, `content/cache/`, `content/seed-state/`.

## Files

| File | What it holds |
| --- | --- |
| `content/collections.json` | Collections, targets and search terms. Keep in step with migration `00006_demo_collections.sql` |
| `content/keep.txt` | The reviewed selection, one shortlist key per line |
| `content/manifest.json` | Per clip: source page, author, licence name and URL, retrieved date, duration, resolution, size, SHA-256 |
| `content/titles.json` | Invented demo title and description per clip; an optional `collection` moves a clip |
| `frontend/public/credits.json` | The public subset of the manifest shown on `/credits` |
| `docs/evidence/metrics/seed-*.json` | Raw timings of each seed run (per clip and summary) |

The seed uploads the featured clip (`SEED_FEATURED`, default: the first clip of the first collection) last,
after every other clip is ready, so it is the newest ready video and the home hero shows it.

If no pending job is claimed or makes progress for `SEED_STALL_MINUTES` (default 15), the seed stops with an error
instead of waiting up to 4 h. The usual cause is a worker that is down or restarting: check `docker compose ps worker`
and `docker compose logs --tail 50 worker`, fix it, and run the seed again. Clips already uploaded are not uploaded
again; it resumes waiting for them.
