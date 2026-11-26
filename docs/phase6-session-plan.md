# Phase 6: plan for the long-running deployment on ryuzcloud.com

Status (2026-11-26): **plan only. Nothing has been created in AWS for this deployment.**

**Decision (2026-11-26, owner):** RyuZCloud stays live on `https://ryuzcloud.com` while the owner applies for jobs. This
replaces the "temporary sessions only" decision of 2026-11-13 ([temporary-deployment.md](temporary-deployment.md)). The
build steps are the same as [rebuild-from-zero.md](rebuild-from-zero.md); what changes is the configuration before the
first apply, the guard rails, and that there is no destroy at the end.

Every AWS and Terraform command is typed by the owner. **BILLS** and **DESTRUCTIVE** are marked as in the runbook.
Costs are estimates from list prices ([aws-costs.md](aws-costs.md)); nothing on this page is a measurement.

## 1. What goes live, and what it must show

| # | Claim | How it is shown | Ledger row |
| --- | --- | --- | --- |
| G1 | The stack builds from code with the Cloudflare → Route 53 DNS split (first time; the 2026-11-14 session used the old `ryucloud.link` zone) | Staged apply succeeds; `https://ryuzcloud.com` serves the redesigned site | C1 (plan count), C5/P6 (build time) |
| G2 | Video bytes never pass through the API: uploader → S3 (presigned PUT), worker → S3, viewer ← CloudFront | Seed through the real upload path; `.m3u8`/`.ts` requests go to `media.ryuzcloud.com` | P7c |
| G3 | Private media stays private | Unsigned request to CloudFront and to S3 directly: 403; signed cookies on `ryuzcloud.com` | verification.md |
| G4 | Transcoding on Fargate, with a stated task size | Realtime factor per job from the seed evidence and `/stats` | P1b |
| G5 | Real-network performance: page weight, Lighthouse, time to first frame through CloudFront | `scripts/measure-cloud.sh` | W1d, P4e, P3c |
| G6 | Visitors can watch everything without an account; strangers cannot create one or upload | `GET /api/v1/auth/signup` is `{"open":false}`; a test registration gets `403 signup_closed` | verification.md |
| G7 | Real monthly cost | Cost Explorer after the first full week and month | C6, C7 |

Not in scope now (§8): CloudTrail, a snapshot restore test, an alarm drill, the GitHub deploy role, Multi-AZ, WAF.

## 2. Configuration that differs from a temporary session

All of it goes into `infra/terraform/terraform.tfvars` **before the first apply**. `terraform.tfvars.example` now has these values.

| Setting | Value | Why |
| --- | --- | --- |
| `protect_data` | `true` | Deletion protection on RDS and the ALB, a final snapshot if the database is ever destroyed, no `force_destroy` on the media bucket or ECR, a 7-day recovery window on secrets (`rds.tf`, `alb.tf`, `s3.tf`, `ecr.tf`, `secrets.tf`). Set from the first apply, so no data-bearing resource ever exists unprotected |
| `monthly_budget_usd` | `120` | The stack budget alerts at 80% actual ($96) and 100% forecast. The estimate for 24/7 is about $90–117/month, so the old 60 would alert every month |
| `signup_open` | `false` | New code (§4). Visitors browse and watch without an account; `/register` says sign-up is closed |
| `signup_allowed_emails` | `["library@example.com"]` | The `seed.py` demo account, so seeding still works. Add your own address only if you want a personal account; the list is visible in the ECS task definition |
| `upload_max_bytes` | `104857600` (100 MiB) | The largest library clip is 49 MB. Limits what an allow-listed account can upload |
| `deploy_services` | `false` for the first apply, then `true` | Unchanged from the runbook |
| `db_backup_retention_days` | default `7` | Point-in-time recovery for 7 days (already the default) |

Unchanged: one task each for the API, frontend and worker (worker on Spot), `db.t4g.micro` single-AZ, no NAT, `PriceClass_100`.

## 3. Budgets (console, free)

You have two account-level budgets, `RyuZCloud-monthyl-20` and `RyuZCloud-monthyl-50`. At about $90–117/month (estimate) both would alert within the
first two weeks of every month and stop meaning anything. Suggested set:

| Budget | Type | Amount | Alerts | Purpose |
| --- | --- | --- | --- | --- |
| `RyuZCloud-monthyl-20` | edit | **$100** | 100% **forecasted** | Early warning that the month is heading above the estimate's low end |
| `RyuZCloud-monthyl-50` | edit | **$150** | 80% and 100% **actual** | Something is wrong (traffic spike, runaway task, forgotten resource) |
| stack budget (Terraform) | automatic | $120 | 80% actual, 100% forecast | Destroyed only with the stack |

Billing → Budgets → select the budget → **Edit** → change *Budgeted amount* → *Configure alerts* → set the thresholds and
type → **Save**. Renaming is optional (budgets can't be renamed; create a new one and delete the old one if you want the
names to match the amounts). Also turn on **Cost Anomaly Detection** (Billing → Cost Anomaly Detection → the default
services monitor with an email subscription; free).

**The real exposure is CloudFront egress.** The first 1 TB a month is free; after that it is about $0.085/GB
(aws-costs.md). The library is 288 MB of HLS, so a viewer watching everything costs well under a cent until the free
tier runs out. The $150 budget is the tripwire if someone scripts mass downloads.

## 4. Closing public sign-up and limiting uploads (code, done 2026-11-26, not yet deployed)

- **API** (`backend/internal/auth`, `backend/internal/config`): `SIGNUP_OPEN` (default `true`, for local development)
  and `SIGNUP_ALLOWED_EMAILS` (comma-separated). With `SIGNUP_OPEN=false`, `POST /auth/register` answers
  `403 signup_closed` for any address not on the list, before hashing the password or touching the database. Existing
  accounts sign in as before. `GET /auth/signup` returns `{"open": false}` and never reveals the list.
- **Frontend** (`/register`): when sign-up is closed the page is titled "Sign-up is closed", links to the library, and
  keeps the form behind "Invited? Create your account" for allow-listed addresses.
- **Terraform**: `signup_open` (default `false`) and `signup_allowed_emails` feed the API task's environment (`ecs.tf`).
- **Uploads**: only signed-in accounts can upload, and only allow-listed addresses can get an account, so uploads are
  limited to you. `upload_max_bytes` caps the file size.
- **Tests**: Go tests in `backend/internal/server/signup_test.go` and `backend/internal/config/config_test.go` (**not
  run yet**: there is no Go on the host; run them in Docker, see the handoff). Frontend: 124 of 124 pass.

## 5. Pre-flight (free; nothing is created)

Stop at the first check that fails.

1. **Code committed and green:** `git status --short` empty; CI green on the commit you will deploy; Go tests pass.
2. **Local checks:** unit tests (**User-reported 2026-11-26**: 121 passed before the sign-up change; now 124 expected);
   `scripts/validate-terraform.sh` passed (**User-reported 2026-11-26**; re-run it after this change). Still to run: the
   Playwright e2e suite.
3. **Kept items exist:** `infra/terraform/backend.hcl`, `infra/terraform/terraform.tfvars`,
   `~/.ryucloud/cloudfront_private_key.pem`, `infra/terraform/cloudfront_public_key.pem`. Never `cat` the tfvars (it holds
   the alert email).
4. **tfvars** (keys and non-secret values only):
   `grep -E '^(aws_region|domain_name|delegated_zone_name|deploy_services|protect_data|monthly_budget_usd|signup_|upload_max_bytes)' infra/terraform/terraform.tfvars`.
   Expect `us-west-2`, `ryuzcloud.com`, `api.ryuzcloud.com`, `deploy_services = false`, `protect_data = true`, `120`,
   `signup_open = false`, the allow-list, `104857600`.
5. **DNS** (rebuild-from-zero.md §1.4 `dig` block): four `awsdns` servers in the referral, `aa` from Route 53, `@` and
   `media` CNAMEs in Cloudflare, DNS only.
6. **Budgets** edited as in §3.
7. **Old zones:** Route 53 lists only `api.ryuzcloud.com` (optional; each extra zone is $0.50/month).
8. **Login:** `aws sts get-caller-identity` ends in `user/ryucloud-admin`.

## 6. Build order and time

Follow [rebuild-from-zero.md](rebuild-from-zero.md) §2 with the `mark` function. The ACM validation CNAMEs are new for
this domain, so stage A needs the Cloudflare steps in §6.1. Times are **estimates**.

| Step | Runbook | Estimate | Notes |
| --- | --- | --- | --- |
| 1. Start, login, `dig` | §2.0 | 5 min | |
| 2. `tf init`, full plan | §2.1 | 5 min | Expect about 115 to add (derived, not run since the DNS change). Record the real count as C1 |
| 3. Stage A: certificates and the two Cloudflare CNAMEs | §2.2, §6.1 | 10–25 min | |
| 4. Stage B: CloudFront | §2.3 | 5–15 min | **BILLS** from here |
| 5. Stage C: everything else; SNS email; store the signing key | §2.4 | 10–20 min | **BILLS** (ALB, RDS, IPv4) |
| 6. Build and push 3 images | §2.5 | 10–25 min | From the committed tree |
| 7. Migrate, roll services, `deploy_services = true` | §2.6 | 10 min | **BILLS** (tasks). Expect `0 to add, 3 to change` |
| 8. Verify, plus the sign-up checks below | §2.7 | 15 min | `mark "first video played"` closes C5/P6 |
| 9. Seed the library (§6.2) | | 35–70 min | |
| 10. Measure (§6.3) | | 30–40 min | |
| 11. Evidence (§6.4) | | 15 min | |

**There is no step 12.** The stack stays up. Do not run the runbook's §3 tear-down; with `protect_data = true` it would
stop at deletion protection anyway.

Sign-up checks for step 8:

```bash
curl -fsS https://ryuzcloud.com/api/v1/auth/signup; echo          # {"open":false}
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ryuzcloud.com/api/v1/auth/register \
  -H 'Content-Type: application/json' -H 'Origin: https://ryuzcloud.com' \
  -d '{"email":"stranger@example.com","password":"not-a-real-pass","display_name":"x"}'   # 403
```

### 6.1 Adding the two ACM validation records in Cloudflare (stage A)

The records only exist once the certificates are requested, so this happens **between A1 and A2**.

1. Run A1 (rebuild-from-zero.md §2.2) and print the validation records:
   ```bash
   cd ~/projects/RyuZCloud/infra/terraform
   tf output -json cloudflare_records | jq -r '.[] | select(.purpose|startswith("ACM")) | [.name, .content, .purpose] | @tsv'
   ```
   Two lines: one for `ryuzcloud.com` (load balancer, us-west-2) and one for `media.ryuzcloud.com` (CloudFront,
   us-east-1). The name looks like `_<hex>.ryuzcloud.com` or `_<hex>.media.ryuzcloud.com`; the content like
   `_<hex>.<letters>.acm-validations.aws`.
2. Cloudflare dashboard → **ryuzcloud.com** → **DNS** → **Records** → **Add record**, once per line:
   - **Type:** `CNAME`
   - **Name:** the name *without* `.ryuzcloud.com` (`_<hex>` or `_<hex>.media`). Pasting the full name also works;
     Cloudflare shortens it.
   - **Target:** the content exactly, with no trailing dot.
   - **Proxy status:** **DNS only** (grey cloud). A proxied (orange) record cannot validate.
   - **TTL:** Auto. → **Save**.
3. Check both against Cloudflare's own name server (each line must print a value ending in `acm-validations.aws.`):
   ```bash
   tf output -json cloudflare_records | jq -r '.[] | select(.purpose|startswith("ACM")) | .name' |
     while read -r n; do echo "$n -> $(dig +norec +short CNAME "$n" @chad.ns.cloudflare.com)"; done
   ```
4. Run A2. It returns when both certificates are `ISSUED`, usually within minutes of the records resolving.
5. **Never delete these two records.** ACM renews the certificates automatically only while the validation CNAMEs still
   resolve. For a long-running site that is what keeps HTTPS working after the first year.

### 6.2 Seeding (step 9)

The demo account must be on `signup_allowed_emails`. Its password comes from the environment and is never printed.

```bash
cd ~/projects/RyuZCloud
mark "seed start"
read -rs -p "Demo account password: " SEED_PASSWORD && export SEED_PASSWORD && echo
SEED_API=https://ryuzcloud.com/api/v1 SEED_STALL_MINUTES=40 python3 scripts/seed.py run 2>&1 | tee ~/seed-aws.log
mark "seed done"
unset SEED_PASSWORD
```

- Use a strong password: unlike a temporary session, this account stays up for months. Keep it in a password manager.
- `SEED_STALL_MINUTES=40`: a Spot interruption returns the interrupted job to the queue only after the visibility
  timeout of 1,860 s (`sqs.tf`), longer than the default 15-minute stall check. Re-running `seed.py run` resumes.
- Processing on the 1-vCPU worker: **estimate 25–50 min** (local jobs took 761 s on 4 vCPU; inference).
- The raw-filename title of clip `23687819` goes live as it is (owner's decision, 2026-11-26).

### 6.3 Measuring (step 10)

```bash
cd ~/projects/RyuZCloud
curl -fsS https://ryuzcloud.com/api/v1/stats; echo     # "videos":40, "jobs_succeeded":40
time LABEL="$(git rev-parse --short HEAD)" scripts/measure-cloud.sh 2>&1 | tee ~/measure-cloud.log
```

Writes `docs/evidence/metrics/cloud-<date>-<commit>/`; HTTPS requests to the site only, no AWS credentials. It can be
re-run any time the site is up, for example after an update.

### 6.4 Evidence (step 11)

Into `docs/evidence/` (redact account IDs, ARNs, the alert email and any signed cookie or URL; check images before `git add`):
`~/ryuzcloud-session.log`, the seed evidence JSON, the `cloud-*` folder, `tf output` (redacted), the C1 plan count,
`/stats`, screenshots (home, a playing watch page, `/register` showing "Sign-up is closed", DevTools with the three
`CloudFront-*` cookies and `.ts` requests to `media.ryuzcloud.com`, the CloudWatch dashboard, ECS services 1/1). A row
in [deployment-log.md](deployment-log.md) and the real output in [verification.md](verification.md).

## 7. Running it (after go-live)

| When | What | Where |
| --- | --- | --- |
| Each code change | Commit, build and push images with the new `TAG`, then `scripts/aws-roll-service.sh` per service (runbook §2.5–2.6, without the `deploy_services` step); run migrations first if the change has one | rebuild-from-zero.md |
| Weekly | Cost Explorer daily view; CloudWatch dashboard; any alarm emails | console |
| After the first full month | C6 and C7 from the real bill; compare with the estimate | metrics.md |
| Before any `tf apply` | `tf plan` and read it: with `protect_data = true`, any replace of `aws_db_instance.main` or the media bucket means stop | |
| If the site must come down | Set `protect_data = false`, `tf apply`, then the runbook's §3 tear-down (**DESTRUCTIVE**). The final snapshot of RDS then **is not** kept, because `protect_data = false` also skips it; take a manual snapshot first if you want the data | rebuild-from-zero.md §3 |

The 15-minute credential limit still applies to every `apply` (runbook §2.0); keep applies small.

## 8. Production readiness, deferred (old phase5-plan step 12)

Skipped for now by the owner's decision (2026-11-26); the site works without them. In suggested order:

1. **Alarm check:** confirm the SNS email, then look at the 20 alarms in CloudWatch: all `OK` or `Insufficient data`,
   none `In alarm`. (Free; 5 minutes. Cheap enough to do on go-live day.)
2. **CloudTrail:** one trail for management events to an S3 bucket (the first copy of management events is free;
   S3 storage cents). Not in Terraform yet.
3. **Snapshot restore test:** restore an automated snapshot to a new instance, point a migrate task at it, check the
   row counts, delete the copy (**BILLS** about an hour of a second `db.t4g.micro`).
4. **RDS CA bundle and `sslmode=verify-full`** (aws-audit.md #3).
5. **GitHub deploy role** (aws-audit.md #1: the `production` environment, then `github_repository`).
6. Decide on Multi-AZ, WAF and S3 versioning (aws-audit.md #2) against a week of real cost data.

## 9. Risks and things not yet proven

- **First apply with the Cloudflare DNS split**, and the first ACM validation for this domain (§6.1).
- **First run of the sign-up switch anywhere:** the Go tests have not run (no Go on the host). Run them before building
  images.
- **First AWS run of native HLS in Chrome from `media.ryuzcloud.com` with `crossorigin="use-credentials"`.** CloudFront's
  CORS policy allows credentials for `https://ryuzcloud.com` (`cloudfront.tf`); not yet exercised. If playback fails,
  record it rather than changing code on the live site.
- **The frontend task is small** (0.25 vCPU); live Lighthouse scores should state it.
- **Spot worker:** an interruption delays a job by up to 31 minutes; it is retried, not lost (inference from `sqs.tf`).
- **Cost:** $90–117/month is an estimate from us-east-1 list prices, not confirmed for us-west-2. The first week of Cost
  Explorer data is the check.
- **Allow-listed accounts can still upload** up to 100 MiB per file. Keep the demo password strong and private.
