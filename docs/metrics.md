# Metrics ledger

Every number this project quotes (README, résumé, interviews) must have a row here. A number without a row does not exist.

**Status**
- **Run**: executed, and the output was seen by whoever recorded it.
- **User-reported**: the owner ran it and stated the result; the raw output is not stored.
- **Documented**: derived from code or docs (a count, a calculation), not from executing the system.
- **Not run**: wanted, but there is no evidence yet.

**Rules**
- Timings: at least 3 runs, report the median and the range, never the best run.
- Improvements: measure the "before" first, then record the before → after pair in one row.
- Never round up, extrapolate, or claim users or traffic.

**Raw output** for new rows goes under `docs/evidence/metrics/<id>-<date>.txt` (redact account IDs, ARNs, emails, signed
URLs and cookies). Older rows predate that convention: their summary lives in [verification.md](verification.md) and
the raw output was not kept.

## Ledger

### Correctness and reliability

| ID | Metric | Value | Before → after | Setup | Date | Status | Command / raw output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Processing end-to-end checks | 35 checks passed | n/a | Local Compose on the Ubuntu VM (4 vCPU); synthetic 10 s clip | 2026-11-10 | Run | `bash scripts/e2e-processing-test.sh`; summary in verification.md |
| R2 | Crash-recovery end-to-end checks | 43 checks passed (35 + 8 recovery); worker SIGKILLed mid-encode, the job finished on attempt 2 | n/a | As R1, `CRASH_TEST=1`, lease 120 s | 2026-11-10 | Run | `CRASH_TEST=1 bash scripts/e2e-processing-test.sh`; verification.md |
| R3 | Point in the encode where the worker was killed (crash test) | ≈ 2 % | n/a | As R2 | 2026-11-05 | Run | troubleshooting.md (11-05 run). The 11-10 run did not record the percentage |
| R4 | Upload end-to-end checks | 23 checks passed | n/a | Local Compose, browser-equivalent upload to MinIO | 2026-11-10 | Run | `bash scripts/e2e-upload-test.sh` |
| R5 | Duplicate outputs after crash recovery | Not measured | | | | Not run | to add: count renditions per video after N crash runs |
| R6 | Concurrent uploads, all transcoded, none lost or duplicated | Not measured | | | | Not run | |
| R7 | Recovery time after a worker kill (lease 120 s) | Not measured | | | | Not run | |

### Tests and code size

| ID | Metric | Value | Before → after | Setup | Date | Status | Command / raw output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Go test packages passing | 9 of 9 `ok` | n/a | Go 1.26.10 image, Postgres 17 container | 2026-11-10 | Run | `docker compose run --rm backend go test ./... -count=1` |
| T2 | Go test functions | 232 `func Test…` in 23 files | n/a | Grep count, so table-driven subtests are not counted separately | 2026-11-23 | Documented | `grep -rhoE '^func Test[A-Za-z0-9_]+' backend --include=*_test.go \| wc -l` |
| T3 | Frontend tests | 106 of 106 passing, 14 files (2026-11-24 after Phase 3: **116 of 116, 15 files** in the owner's container run; 119 of 119 on the host after adding `formatClips` tests) | 2026-11-23 Vitest 3 → 5 upgrade: 104 of 106 (owner's container run, output pasted) → 106 of 106 after fixing the hls.js mock | Vitest 5.1.1, jsdom; 2026-11-10 run: Vitest 3 in the container, 3 consecutive runs; 2026-11-23 run: host Node 22.22.1, 1 run | 2026-11-23 | Run | `npx vitest run` (host); container: `docker compose run --rm --no-deps frontend npm test` |
| T4 | Real-FFmpeg transcode tests | all pass, 11.9 s | n/a | worker image | 2026-11-10 | Run | `docker compose run --rm --no-deps worker go test ./internal/transcode -v` |
| T5 | CloudFront signed-cookie regression test (`TestGrantPlaybackPolicyKeepsLiteralWildcard`) | PASS (with `TestGrantPlaybackSetsScopedSecureCookies`) | n/a | backend container | 2026-11-23 | Run (owner's terminal, output pasted) | `docker compose run --rm backend go test ./internal/integrations -run TestGrantPlayback -v -count=1` |
| T6 | Playwright and axe: pages checked and violations | **Real local stack: 8 of 8 browser tests pass**; 9 pages × 2 widths (390, 1440): **0** WCAG 2.1 A/AA violations; 0 px sideways overflow at 320 px; focus visible on the first 12 Tab stops; reduced motion honoured; player playable and pausable by keyboard alone | axe: 2 violations (`link-in-text-block`, /login and /register) → 0. Overflow at 320 px: the watch page scrolled 15 px with a one-word title (owner's run) → 0 after `overflow-wrap: anywhere` | Compose stack (`next dev`), 1 public ready video, Chromium 1255, Playwright 1.65, 1 run each. The first run was against a fixture API (26 placeholder clips) | 2026-11-24 | Run (8/8 on the real stack by me; 7/8 + the overflow failure in the owner's run, output pasted) | `BASE_URL=http://localhost:3000 npx playwright test` (frontend/) |
| T7 | Terraform `resource` blocks | 88 in 14 files (some use `for_each`, so the real resource count is higher; see C1) | n/a | Grep count | 2026-11-23 | Documented | `cat infra/terraform/*.tf \| grep -c '^resource '` |

### Security

| ID | Metric | Value | Before → after | Setup | Date | Status | Command / raw output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Reachable Go vulnerabilities | 0 | **13 → 0** (Go 1.25.14 → 1.26.10, pgx 5.7.5 → 5.9.2, x/text 0.26.0 → 0.41.0) | govulncheck v1.1.4 | 2026-11-10 | Run | `govulncheck ./...`; verification.md |
| S2 | Secrets found in Git history | 0 leaks across 15 commits | n/a | gitleaks 8.21.2 | 2026-11-10 | Run | `gitleaks detect`; verification.md. The history has grown since; re-run |
| S3 | Unsigned media requests refused | 403 from CloudFront and from S3 directly; 200 with signed cookies | n/a | AWS session, us-west-2 | 2026-11-14 | Run | curl checks in verification.md |

### Builds

| ID | Metric | Value | Before → after | Setup | Date | Status | Command / raw output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | Production image size | api 30.3 MB, worker 212 MB (includes FFmpeg), frontend 354 MB | n/a | `docker build --network host`, single build each | 2026-11-10 | Run | verification.md |
| B3 | Next.js First Load JS per route | after the redesign: 102 kB shared; 103–114 kB per route (11 routes) | before 108–113 kB (8 routes) → after 103–114 kB; no animation library added | `next build`, before = commit `f14c846`, after = Phase 3 working tree | 2026-11-24 | Run | `next build` route table |
| B2 | Production image build time | api 157 s, worker 49 s, frontend 466 s (1 run each, so not a median) | n/a | As B1, VM on a throttled link | 2026-11-10 | Run | verification.md |

### Cloud session

| ID | Metric | Value | Before → after | Setup | Date | Status | Command / raw output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Terraform plan from an empty state | 115 to add, 0 to change, 0 to destroy | n/a | `deploy_services = false`, `github_repository` unset | 2026-11-14 | User-reported | `tf plan -out=tfplan` |
| C2 | Resources destroyed at teardown | 94 (staged destroy) | n/a | Same stack | 2026-11-14 | User-reported | Does not match C1's 115. Unexplained, raw output not kept |
| C3 | Cloud transcodes | 2 uploads (10 s and 6 s HEVC), each to 2 renditions (360p, 720p); worker logged 33 s and 16 s | n/a | Fargate worker; task size not confirmed for this run; unclear whether the times are job wall time | 2026-11-14 | User-reported | worker log |
| C4 | CloudWatch alarms | 20 defined; 19 of 20 `OK` at the first check | n/a | | 2026-11-14 | User-reported | |
| C5 | Time from first apply to first played video | Not measured | | | | Not run | `mark` timestamps in [rebuild-from-zero.md](rebuild-from-zero.md) |
| C6 | Real cost of a session (Cost Explorer) | Not measured | | | | Not run | the owner deferred the 2026-11-14 check |
| C7 | Cost per day while running | ≈ $2.90 to $3.90 (estimate) | n/a | List prices from us-east-1, not confirmed for us-west-2 | 2026-11-13 | Documented | aws-costs.md |

### Frontend weight and accessibility

| ID | Metric | Value | Before → after | Setup | Date | Status | Command / raw output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | Page weight, current UI (transferred bytes, median of 3 cold loads; library of 1 clip, see W1b for a fair before/after) | `/` 199,156 B; `/login` 151,148 B; `/watch` 550,963 B; JS 131–136 KB per page; 17–27 requests | **before** (after: Phase 5) | Prod build of `f14c846` on localhost:3100, local API, Chromium 1255 via Playwright, cold context per run | 2026-11-23 | Run | `node scripts/measure-pages.cjs http://localhost:3100 <out> 3`; `docs/evidence/metrics/P4-page-weight-before-2026-11-23.json` |
| W2 | Horizontal overflow at 390 / 820 / 1440 px, current UI | 0 px on all 6 pages | before | as W1 | 2026-11-23 | Run | as W1 (`overflow_*` fields) |
| A1 | Token contrast (WCAG 2) | all text pairs ≥ 4.86:1 except subtle on s2 (4.17, banned); new `control` border 3.45:1 on bg | n/a | Python luminance formula | 2026-11-23 | Documented | design/README.md, "Tokens" |

### Frontend performance, before vs after the redesign (Phase 5, local)

All rows: 3 runs per page, median (range); same machine, same library, same installed Next.js, so only the app code
differs. Local numbers: no CDN, no real network unless stated. Status for all: **Run (owner's terminal, output pasted
and JSON read)**, 2026-11-26.

| ID | Metric | Value | Before → after | Setup | Date | Status | Command / raw output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1b | Page weight, transferred bytes per cold load (Playwright, 1440 × 900) | after: `/` 2,692,617 B (2,692,617–3,215,745); `/login` 891,594; `/register` 891,679; `/upload` 300,675; `/studio` 307,114; `/watch` 2,115,946; `/collections` 478,888; `/credits` 303,245. JS 129–147 KB per page, CSS 8.3 KB | `/` 842,809 → 2,692,617; `/login` 151,507 → 891,594; `/upload` 146,728 → 300,675; `/watch` 1,794,407 → 2,115,946; JS 132–136 → 129–147 KB (flat). **Regressions**, causes below | Prod builds (`next build`/`next start`, Next.js 15.5.29) of `f14c846` (before) and `19e92e7` (after) on the VM (AMD Ryzen AI 5 340, 4 vCPU, 7 GiB), local Compose API and MinIO, seeded library (40 clips); Playwright Chromium 159 | 2026-11-26 | Run | `scripts/measure-phase5.sh`; raw: `docs/evidence/metrics/phase5-2026-11-26/`, `pages-*.json` |
| P4 | Lighthouse 13.6.0, mobile (simulated slow 4G, 4× CPU) | perf / LCP / TBT / CLS, after: `/` 57 (55–61) / 4,364 ms / 1,956 ms / 0; `/login` 81 (74–83) / 824 / 807 / 0; `/credits` 78 (71–78) / 786 / 1,050 / 0; `/collections` 71 (63–73) / 3,710 / 748 / 0; `/watch` 64 (63–66) / 3,583 / 720 / **0.17**. Accessibility 100 on every page | perf `/` 58 → 57, `/login` 79 → 81, `/watch` 75 → 64; accessibility 95–96 → 100; best practices 96 → 96; SEO 100 → 100 | as W1b; Lighthouse default `simulate` throttling, so scores are modelled, not real throttling | 2026-11-26 | Run | `scripts/measure-phase5.sh`; raw: `docs/evidence/metrics/phase5-2026-11-26/`, `lighthouse-*.json` |
| P4d | Lighthouse 13.6.0, desktop | after: `/` 91 (90–95) / LCP 1,230 ms / TBT 167 / CLS 0; `/login` 99 (95–99); `/credits` **76** (76–77) / CLS **0.666**; `/collections` 98 (91–98); `/watch` 97 (96–99) / CLS 0.012 | `/` 98 → 91; `/login` 100 → 99; `/watch` 92 → 97 (CLS 0.156 → 0.012) | as P4 | 2026-11-26 | Run | as P4 |
| P3 | Time to first frame on `/watch`, `play()` as soon as the player exists (4 clips × 3 runs) | **unthrottled: 598 ms** (317–889) from `play()`, 1,217 ms (808–1,557) from navigation; **slow 4G + 4× CPU: 5,434 ms** (2,358–7,912) from `play()`, 8,612 ms (5,524–11,071) from navigation. n = 12 per profile, 0 failures | after only (not measured before) | as W1b; network throttling real (CDP: 150 ms RTT, 1.44 Mbit/s down, 675 kbit/s up) and CPU 4× | 2026-11-26 | Run | `scripts/measure-phase5.sh`; raw: `docs/evidence/metrics/phase5-2026-11-26/`, `playback-after.json` |
| P3r | Rebuffers in the first 20 s after the first frame | unthrottled: 22 `waiting` events, 1,827 ms stalled in total over 12 runs; slow 4G: 19 events, 1,728 ms. One clip had 0 in all 6 runs | after only | as P3. **Every sample used Chrome's native HLS player, not hls.js** (see note) | 2026-11-26 | Run | as P3 (`player` field) |

**What the numbers say (inferences are marked):**
- **Native HLS in Chrome.** Chromium 159 answers `canPlayType("application/vnd.apple.mpegurl")`. The player and the
  previews checked that first (written for Safari), so in Chrome they skipped hls.js. P3/P3r therefore measure Chrome's
  own HLS player, and the hero preview ignored its "lowest rendition, 8 s buffer" settings. Inference: most of the
  home page's extra 1.8 MB (non-image, non-JS bytes) is that preview's video, since the before build has no preview.
- **`/login`, `/register` +740 KB:** 601,332 B of images, the 20 decorative thumbnails of the split layout (640 px wide
  JPEGs shown at about 200 px).
- **Every page +141 KB:** the two Geist variable fonts, 69,488 B (sans) + 71,212 B (mono) (Documented: file sizes in
  `node_modules/geist`). That matches `/upload` and `/studio`, which have no images.
- **`/credits` desktop CLS 0.666:** the list was fetched in the browser and pushed everything below it down.
- **`/watch` mobile CLS 0.17:** the footer sat under the loading placeholder on a phone and moved twice.
- **Mobile TBT** is 700–2,000 ms both before and after (React hydration under Lighthouse's 4× CPU model). The redesign
  did not cause it, and it is not fixed here.
- Unthrottled rebuffering on a local server suggests the native player's rendition switches, not the network
  (inference; the re-measure with hls.js tests it).

**Fixes made after this run (not yet measured):** hls.js first, native HLS only without MSE (player and previews);
`/credits` rendered on the server; `/watch` reserves one screen of height; 12 instead of 20 decorative tiles on small
screens. Re-measure: `BEFORE=19e92e7 AFTER=<fix commit> scripts/measure-phase5.sh`.

### Library and pipeline (from `GET /stats`)

| ID | Metric | Value | Before → after | Setup | Date | Status | Command / raw output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L0 | Local library before seeding | 1 public ready clip, 159 s, 2 renditions, 7,421,000 B of HLS; median processing time ÷ length **0.89×** (n = 1, so not a representative figure) | n/a | Local Compose, worker 2 CPU / 2 GB defaults (`WORKER_CPUS`, `WORKER_MEMORY` not confirmed for that run) | 2026-11-24 | Run (owner's terminal, output pasted) | `curl -s http://localhost:8000/api/v1/stats` |
| L1 | Library seeded through the real upload path | **40 clips ready**, 0 failed, 0 retried (every job 1 attempt); 971 s of footage; 21 Pixabay, 19 Wikimedia Commons; 7 collections | L0 had 1 ready clip; 40 seeded clips added (whether the earlier lecture clip is still public is not confirmed) | Local Compose on the VM; worker `WORKER_CONCURRENCY` 1, `WORKER_CPUS` 2, `FFMPEG_THREADS` 2 (defaults; `.env` overrides not confirmed); 360p + 720p renditions | 2026-11-24 | Run (owner's terminal, output pasted) | `python3 scripts/seed.py run`; raw: `docs/evidence/metrics/seed-2026-11-24-localhost-3000.json` |
| L2 | Original bytes vs HLS bytes of the library | originals **430,635,085 B** (430.6 MB); HLS **288,496,910 B** (288.5 MB) for both renditions; ratio **0.67** | n/a | as L1 | 2026-11-24 | Run (owner's terminal, output pasted) | `summary.original_bytes`, `summary.hls_bytes` |
| P1 | Transcode realtime factor (worker job wall time from first claim to finish ÷ clip duration; download, probe, both renditions, thumbnail, upload) | **median 0.768×**, range 0.321–2.789×, interquartile 0.574–0.999×, n = 40 clips of 8–60 s. By source: Pixabay MP4 median 0.582× (0.321–0.982, n = 21; median source bitrate 1.9 Mbit/s); Commons WebM median 1.005× (0.582–2.789, n = 19; 4.0 Mbit/s). The slowest two are 9–11 s Commons clips of 34–49 MB | L0 0.89× (n = 1) → 0.768× (n = 40); not a speed-up, just a real sample | as L1 | 2026-11-24 | Run (owner's terminal, output pasted) | `summary.realtime_factor`; per clip `clips.*.realtime_factor` |
| P7 | Total seed time and upload throughput | **3,619.7 s** (60.3 min) from first upload to last job finished, of which about **47.6 min was the worker outage** (first upload 10:31:56 UTC, first job claimed 11:19:33). Without the outage: 39 uploads in 7.0 s, then the worker busy for 762.6 s (sum of job times 761.2 s, concurrency 1), so about **12.8 min**, derived, not separately run. Upload: 430.6 MB in 3.2 s of PUT time = 1,067.9 Mbit/s, VM to MinIO on the same host, so it says nothing about a real network upload. `seed_wall_seconds_this_run` 394.5 s is the resumed run only (waiting + the featured clip) | n/a | as L1, uploads from the VM to local MinIO | 2026-11-24 | Run (owner's terminal, output pasted); outage-free time Documented (derived from the same file) | evidence file: `clips.*.upload_started`, `job_started`, `job_finished` |

**Note on the first seed run (2026-11-24, owner-reported).** The worker crash-looped for about the first 48 minutes of the run
(`go: go.mod file not found`; measured from the evidence file: 47.6 min between the first upload and the first claim): its container was created before the project folder was renamed from `RyuCloud` to
`RyuZCloud`, so its bind mount still pointed at the old path. No job was claimed until the owner recreated the container
(`docker compose up -d --force-recreate --no-deps worker`). Consequences for the rows above:
- **P7 total seed time** includes that idle queue. It is recorded as measured, with the outage split out, and is not
  a measure of how long seeding takes. Upload throughput (`upload_mbit_per_s`) is timed per PUT and is not affected.
- **P1 realtime factor** is not affected: it is measured from a job's first claim (`started_at`) to `finished_at`, so time
  spent queued does not count. The first job after the recreate also excludes the worker's `go run` compile, which
  happens before any claim.
- The run was one seed; P1's spread is across 40 clips, not across repeated runs. A clean re-seed would give the
  outage-free total as a Run figure.
- Database status counts before the fix, as reported: draft 4, failed 4, queued 39, ready 5, uploading 4.
- Since then `seed.py` stops with an error when no pending job moves for `SEED_STALL_MINUTES` (default 15).

### Wanted next (Not run; listed so the gaps are visible)

| ID | Metric | Phase |
| --- | --- | --- |
| P1b | Transcode realtime factor on Fargate (stated CPU and memory) | 6 |
| P2 | Largest direct-to-storage upload (multipart is not implemented, so multipart throughput cannot be measured) | 4 |
| P5 | Monthly S3 and CloudFront cost of the seeded library, from its measured GB | 4 to 6 |
| P6 | Time to rebuild from zero using rebuild-from-zero.md | 6 |
