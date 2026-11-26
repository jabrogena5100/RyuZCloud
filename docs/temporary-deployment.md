# Temporary AWS sessions: when to use them, what survives, what it costs

**Status (2026-11-26): not the current mode.** The owner decided on 2026-11-26 to keep RyuZCloud live on
`https://ryuzcloud.com` while applying for jobs; that plan is [phase6-session-plan.md](phase6-session-plan.md). This page
covers the other mode: building the stack for a few hours (a test, a demo, a change to infrastructure) and destroying it
afterwards. It was the only mode from 2026-11-13 to 2026-11-26, and it is the way back if the live site is taken down.

The commands are in [rebuild-from-zero.md](rebuild-from-zero.md) (staged apply, verify, staged destroy, audit). This page
does not repeat them. Every `apply`/`destroy` is typed by the owner. Costs are list-price estimates, not measurements
([aws-costs.md](aws-costs.md)); us-west-2 prices were not confirmed against the AWS Price List.

## 1. The one setting that differs: `protect_data = false`

`infra/terraform/terraform.tfvars.example` now sets `protect_data = true` (the live site). For a temporary session set it
to **`false` before the first apply**. Then `destroy` completes in one pass: RDS skips the final snapshot, the media bucket
and ECR repositories force-delete their contents, the ALB has no deletion protection, and the secrets have no recovery
window (`rds.tf`, `s3.tf`, `ecr.tf`, `alb.tf`, `secrets.tf`). Also set `monthly_budget_usd = 60` (a session never gets
near it) and, if you want to test sign-up from the browser, `signup_open = true`.

Never point a temporary session at the live stack's state: a temporary session is a separate build only when the live
site is down. Running both at once would need a second state key and a second domain; that is not set up.

## 2. What survives a destroy, and what does not

| Resource | Lifetime | Why |
| --- | --- | --- |
| GitHub repository, Terraform code, `.terraform.lock.hcl`, docs, [verification.md](verification.md), [deployment-log.md](deployment-log.md) | **Kept** (Git) | The portfolio and the way to rebuild |
| Terraform **state bucket** (S3, versioned, `us-west-2`) | **Kept** | Created by hand, outside the stack, so `destroy` cannot delete it. Cents per month |
| Domain **`ryuzcloud.com`** (Cloudflare Registrar) and its hand-made Cloudflare records: `@` and `media` CNAMEs, the four NS records for `api`, the two ACM validation CNAMEs | **Kept** | Terraform never writes to Cloudflare (rebuild-from-zero.md §1.4). Keep the validation CNAMEs: ACM reuses them for the same domain and account |
| **Route 53 zone `api.ryuzcloud.com`** | **Kept** | Referenced by `hosted_zone_id`, not managed by Terraform. Recreating it changes its name servers, which would then have to be re-entered in Cloudflare. $0.50/month |
| **CloudFront private key** `~/.ryucloud/cloudfront_private_key.pem` (public key in `infra/terraform/`, git-ignored) | **Kept** locally, never in Git | The same key pair is reused. Back it up (password manager or encrypted drive) |
| `backend.hcl`, `terraform.tfvars` (git-ignored) | **Kept** locally | Back them up; no secrets, but needed to redeploy. The tfvars holds the alert email: never commit or paste it |
| Account budgets `RyuZCloud-monthyl-20` and `RyuZCloud-monthyl-50` (user-reported 2026-11-26) | **Kept** | Made by hand; the budget inside Terraform is destroyed with the stack |
| IAM user `ryucloud-admin` (MFA, no keys) | **Kept** | Free |
| VPC, subnets, security groups, ALB, ECS cluster/services/task definitions, ECR repositories **and images**, RDS, media bucket, SQS queues, CloudFront, ACM certificates, Secrets Manager secrets, CloudWatch logs/alarms/dashboard, SNS topic, IAM roles, stack budget, the Route 53 alias records in `api.ryuzcloud.com` | **Destroyed** | Recreated by `tf apply` from the code |

How each kind of data is handled on destroy (with `protect_data = false`):

| Data | On destroy | If you want to keep it |
| --- | --- | --- |
| **RDS** (users, videos, jobs) | Deleted, no snapshot | Restoring from a snapshot is not scripted. Re-seed instead: `scripts/seed.py run` rebuilds the 40-clip library through the real upload path (phase6-session-plan.md §6.2). For a one-off, take a manual snapshot first; it bills about $0.095/GB-month until deleted, and `scripts/aws-audit.sh` reports it |
| **S3 media** (originals, HLS) | Deleted (`force_destroy`) | The source clips stay in `content/media/` on the VM (git-ignored) |
| **Terraform state** | Bucket stays; resources leave the state | Never delete the bucket or its versions while a stack exists |
| **Secrets** | Deleted immediately (recovery window 0), so names can be reused | Re-store the CloudFront key after every apply (rebuild-from-zero.md §2.4) |
| **CloudFront, ACM** | Destroyed, re-issued next time | Validation is quick when the Cloudflare CNAMEs are still there |
| **ECR images** | Deleted with the repositories | Rebuilt and pushed each time (rebuild-from-zero.md §2.5) |
| **CloudWatch logs, dashboard, alarms** | Deleted | Capture evidence **before** the destroy |
| **SNS email subscription** | Deleted | A new confirmation email arrives after each apply |

## 3. Safeguards against unexpected charges

| Safeguard | Where | State |
| --- | --- | --- |
| Account budgets | Billing → Budgets | **Exist** (user-reported 2026-11-26): `RyuZCloud-monthyl-20`, `RyuZCloud-monthyl-50`. For the live site, raise them (phase6-session-plan.md §3) |
| Stack budget, 80% actual / 100% forecast | Terraform (`monitoring.tf`) | Built; destroyed with the stack |
| Cost Anomaly Detection (free) | Billing → Cost Anomaly Detection | Not confirmed |
| End-time alarm on your phone | You | Habit for every session |
| Tag search plus service-by-service audit | `scripts/aws-audit.sh` | **Ran 2026-11-14** (deployment-log.md): direct checks clean; the tag search kept listing 19 deleted items (AWS's tag index lags), so the script exited 1. The direct checks are the real test |
| Next-day Cost Explorer check | Console | Part of rebuild-from-zero.md §3.1 |
| No NAT gateway, no Multi-AZ, no WAF, `deploy_services` gates Fargate, RDS storage autoscaling capped | Terraform defaults | Built |
| Never leave a session overnight. `deploy_services = false` is not a pause: about $50/month of infrastructure keeps running | Policy | |

What the audit cannot see: other regions, services started by hand, support plans, marketplace items. Billing → Bills is
the final word.

## 4. Cost estimates (us-west-2, list prices, unmeasured)

Hourly cost with everything running: about **$0.12–0.16** (ALB, five public IPv4 addresses, RDS `db.t4g.micro`, two small
tasks, a worker on Spot, plus prorated storage, secrets and alarms). Apply and destroy add roughly an hour at the
infrastructure-only rate (≈ $0.07/h), so about **+$0.10** per session.

| Deployment | Running cost | Notes |
| --- | --- | --- |
| **8 hours** | ≈ **$1.1–1.4** | A realistic demo or test session |
| **24 hours** | ≈ **$3.0–3.9** | Overnight is where forgetting hurts |
| **7 days** | ≈ **$20–27** | Matches ≈ $90–117/month for 24/7 (that figure ÷ 730 × 168) |
| **24/7** (the live site) | ≈ **$90–117/month** | phase6-session-plan.md |

Persistent costs between sessions: Route 53 zone $6/year, state bucket under $1/year, the `ryuzcloud.com` renewal at
Cloudflare Registrar (price not recorded here). The real cost of a session is a ledger row (C6) only once it is read from
Cost Explorer.

## 5. Domain history

| Date | What | Status |
| --- | --- | --- |
| 2026-11-13 | `ryucloud.link` registered through Route 53 Registered Domains; registration auto-created a second hosted zone, so the registry pointed at the wrong zone until it was corrected | Used for the 2026-11-14 session only. Check Route 53 → Registered domains: turn auto-renew off if you no longer want it, and delete its hosted zones ($0.50/month each) |
| 2026-11-23 | Project renamed RyuCloud → RyuZCloud; **`ryuzcloud.com`** registered at Cloudflare Registrar. Cloudflare Registrar cannot hand the apex to other name servers, so DNS stays in Cloudflare and only `api.ryuzcloud.com` is delegated to Route 53 | **Current.** Design and records: rebuild-from-zero.md §1.4; Terraform side: `infra/terraform/dns.tf` |

A full deployment always needs the domain: the ACM certificates, the ALB's HTTPS listener, the CloudFront alias and the
signed cookies (which cannot work on `*.cloudfront.net` or the load balancer's name) all depend on it.

## 6. Where to pay

| What | Where | Frequency |
| --- | --- | --- |
| AWS usage, Route 53 zone, state bucket | The card on the AWS account: Billing and Cost Management → **Payment preferences**; invoices in **Bills** | Monthly in arrears |
| `ryuzcloud.com` | Cloudflare dashboard → **Domain Registration** | Yearly |
| `ryucloud.link` (if still renewing) | Route 53 → **Registered domains** | Yearly |
| Terraform, GitHub (Free plan, public repo), Docker, ACM certificates | Nothing to pay | |

## 7. What is repeatable and what is still manual

Repeatable from Git: all infrastructure (`tf apply`), the images (`docker build`, rebuild-from-zero.md §2.5), migrations,
the demo library (`scripts/seed.py run`), and the measurements (`scripts/measure-cloud.sh`).

Manual each time, by design: confirm the SNS email, store the CloudFront key in Secrets Manager, build and push the
images, check the Cloudflare records.

Proven on 2026-11-14 (deployment-log.md): a full apply, playback with signed cookies, and a staged destroy. Not yet
proven: a second apply after a destroy (secret and certificate names reused), the Cloudflare DNS split, and the destroy
count matching the plan count (C1 115 vs C2 94, unexplained).
