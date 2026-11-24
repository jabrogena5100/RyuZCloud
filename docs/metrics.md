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
| T3 | Frontend tests | 106 of 106 passing, 14 files | 2026-11-23 Vitest 3 → 5 upgrade: 104 of 106 (owner's container run, output pasted) → 106 of 106 after fixing the hls.js mock | Vitest 5.1.1, jsdom; 2026-11-10 run: Vitest 3 in the container, 3 consecutive runs; 2026-11-23 run: host Node 22.22.1, 1 run | 2026-11-23 | Run | `npx vitest run` (host); container: `docker compose run --rm --no-deps frontend npm test` |
| T4 | Real-FFmpeg transcode tests | all pass, 11.9 s | n/a | worker image | 2026-11-10 | Run | `docker compose run --rm --no-deps worker go test ./internal/transcode -v` |
| T5 | CloudFront signed-cookie regression test (`TestGrantPlaybackPolicyKeepsLiteralWildcard`) | PASS (with `TestGrantPlaybackSetsScopedSecureCookies`) | n/a | backend container | 2026-11-23 | Run (owner's terminal, output pasted) | `docker compose run --rm backend go test ./internal/integrations -run TestGrantPlayback -v -count=1` |
| T6 | Playwright and axe: pages checked and violations | Not measured | | | | Not run | Phase 3 |
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
| B3 | Next.js First Load JS (current UI) | 102 kB shared; 108–113 kB per route | before (redesign pending) | `next build`, commit `f14c846` | 2026-11-23 | Run | `next build` route table; see design/README.md |
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
| W1 | Page weight, current UI (transferred bytes, median of 3 cold loads) | `/` 199,156 B; `/login` 151,148 B; `/watch` 550,963 B; JS 131–136 KB per page; 17–27 requests | **before** (after: Phase 5) | Prod build of `f14c846` on localhost:3100, local API, Chromium 1255 via Playwright, cold context per run | 2026-11-23 | Run | `node scripts/measure-pages.cjs http://localhost:3100 <out> 3`; `docs/evidence/metrics/P4-page-weight-before-2026-11-23.json` |
| W2 | Horizontal overflow at 390 / 820 / 1440 px, current UI | 0 px on all 6 pages | before | as W1 | 2026-11-23 | Run | as W1 (`overflow_*` fields) |
| A1 | Token contrast (WCAG 2) | all text pairs ≥ 4.86:1 except subtle on s2 (4.17, banned); new `control` border 3.45:1 on bg | n/a | Python luminance formula | 2026-11-23 | Documented | design/README.md, "Tokens" |

### Wanted next (Not run; listed so the gaps are visible)

| ID | Metric | Phase |
| --- | --- | --- |
| L1 | Library: videos, total hours, original GB, HLS GB, renditions per video, thumbnails | 4 |
| P1 | Transcode realtime factor per ladder, local (stated CPU and memory) and Fargate | 4 to 6 |
| P2 | Largest direct-to-storage upload (multipart is not implemented, so multipart throughput cannot be measured) | 4 |
| P3 | Time to first frame and rebuffer count on a throttled mobile profile | 5 |
| P4 | Lighthouse mobile and desktop per main page, before and after the redesign (page weight before is row W1) | 5 (Lighthouse is not installed) |
| P5 | Monthly S3 and CloudFront cost of the seeded library, from its measured GB | 4 to 6 |
| P6 | Time to rebuild from zero using rebuild-from-zero.md | 6 |
