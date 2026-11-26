# Rebuild from zero after `terraform destroy`

This is the single procedure for taking RyuZCloud from "destroyed" to "a video plays on AWS" and back to "destroyed".
Follow it top to bottom; every command is meant to be pasted into an Ubuntu Bash shell on the VM. Nothing here runs
by itself.

- **BILLS** marks the step where charges start or grow.
- **DESTRUCTIVE** marks a step that deletes data.
- Each `tf plan` lists the counts it should show. If your plan shows a `destroy` you did not expect, stop.

Background reading (optional): [aws-architecture.md](aws-architecture.md) covers what gets built,
[aws-costs.md](aws-costs.md) the price list, and [aws-runbook.md](aws-runbook.md) day-two operations.

---

## 0. What survives a destroy

| Kept (outside Terraform) | Where | Needed for |
| --- | --- | --- |
| Git repository, Terraform code, `.terraform.lock.hcl` | GitHub, `~/projects/RyuZCloud` | everything |
| Terraform state bucket (versioned, private, `us-west-2`) | S3, created by hand once | `tf init` |
| `infra/terraform/backend.hcl`, `infra/terraform/terraform.tfvars` | VM only (git-ignored) | `tf init`, `tf plan` |
| CloudFront key pair: private key `~/.ryucloud/cloudfront_private_key.pem`, public key `infra/terraform/cloudfront_public_key.pem` | VM only (git-ignored) | signed cookies |
| Domain `ryuzcloud.com` and its hand-made records (§1.4); Route 53 zone `api.ryuzcloud.com` | Cloudflare, Route 53 | certificates, HTTPS, cookies |
| IAM user and `aws login` profile `ryucloud` | AWS IAM | every AWS command |

**Destroyed every time:** VPC, subnets, security groups, ALB, ECS cluster, services and task definitions, ECR repositories
**including images**, RDS and all its data, the media bucket and all its videos, SQS queues, CloudFront, ACM certificates,
Secrets Manager secrets, CloudWatch logs, alarms and dashboard, SNS topic, IAM task roles, and the stack's own budget.

If one of the kept items is missing (a new machine, or a lost key), do the one-time setup in §1 first.

## 1. One-time setup (skip the parts that already exist)

### 1.1 Tools on the VM

```bash
docker --version && docker compose version
aws --version            # AWS CLI v2
jq --version && openssl version && dig -v
```

Terraform is **not** installed on the host. It runs in Docker, pinned to 1.10.5 through `scripts/aws-terraform.sh`,
because a newer Terraform rewrites the state's version marker and CI's 1.10.5 can then no longer read it.

### 1.2 State bucket (≈ $0, once per account)

Replace `REPLACE_STATE_BUCKET` with a globally unique name, for example `ryucloud-tfstate-<12-digit account ID>`.
If `infra/terraform/backend.hcl` already exists, the bucket exists too. Skip this step.

```bash
export AWS_PROFILE=ryucloud AWS_REGION=us-west-2
STATE_BUCKET=REPLACE_STATE_BUCKET
aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"
aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$STATE_BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 1.3 CloudFront signing key pair (once; reuse it every session)

The private key never goes into Git, Terraform state or a chat. Back it up to a password manager.

```bash
mkdir -p ~/.ryucloud && chmod 700 ~/.ryucloud
openssl genrsa -out ~/.ryucloud/cloudfront_private_key.pem 2048
chmod 600 ~/.ryucloud/cloudfront_private_key.pem
openssl rsa -pubout -in ~/.ryucloud/cloudfront_private_key.pem \
  -out ~/projects/RyuZCloud/infra/terraform/cloudfront_public_key.pem
```

### 1.4 DNS: Cloudflare keeps the domain, one subdomain goes to Route 53

`ryuzcloud.com` is registered at Cloudflare Registrar, which does not let the apex use other name servers. So DNS
stays in Cloudflare and Terraform never writes to it (no Cloudflare provider, no API token). Route 53 serves exactly
one delegated subdomain, `api.ryuzcloud.com`, and Terraform writes the only records that change per session into that zone.

| Name (what browsers use) | Where | Record | Changes per session? |
| --- | --- | --- | --- |
| `ryuzcloud.com` (site, `domain_name`) | Cloudflare, by hand | `@` CNAME `api.ryuzcloud.com`, DNS only (Cloudflare flattens it at the apex) | No |
| `media.ryuzcloud.com` (CloudFront) | Cloudflare, by hand | `media` CNAME `media.api.ryuzcloud.com`, DNS only | No |
| `api.ryuzcloud.com` (`delegated_zone_name`) | Cloudflare, by hand | 4 × NS → Route 53 | No (the zone is kept) |
| ACM validation for `ryuzcloud.com` and `media.ryuzcloud.com` | Cloudflare, by hand | 2 × CNAME `_…` → `_….acm-validations.aws`, DNS only | Expected not to; check each session |
| `api.ryuzcloud.com` | Route 53, Terraform | A alias → this session's load balancer | **Yes** |
| `media.api.ryuzcloud.com` | Route 53, Terraform | A + AAAA alias → this session's CloudFront | **Yes** |

What follows from this:

- Certificates: the ALB gets `ryuzcloud.com` (ACM, us-west-2) and CloudFront gets `media.ryuzcloud.com` (ACM, us-east-1).
  Terraform cannot write their validation records, so it prints them (`tf output cloudflare_records`). ACM normally
  reuses the same validation CNAME for the same domain in the same account, so you should only have to add them once.
  Compare them every session anyway.
- The ALB answers only for the host `ryuzcloud.com`: `/api/*` goes to the API, everything else to the frontend, and any
  other host (the ALB's own name, `api.ryuzcloud.com`) gets a 404. The flattened apex keeps the browser's `Host: ryuzcloud.com`.
- Cookies, CORS and trusted origins all use `https://ryuzcloud.com`. The signed CloudFront cookies are scoped to
  `ryuzcloud.com`, a parent of `media.ryuzcloud.com`. Nothing in code or Terraform hard-codes `app.`.
- While the stack is destroyed, `api.ryuzcloud.com` has no A record, so the apex resolves to nothing. That is expected.

**One-time steps.** The zone `api.ryuzcloud.com` and its four NS records in Cloudflare already exist. A check on
2026-11-23 showed Cloudflare handing out the referral, and Route 53 answering authoritatively. Find the zone ID (read-only):

```bash
export AWS_PROFILE=ryucloud
aws route53 list-hosted-zones-by-name --dns-name api.ryuzcloud.com --max-items 1 \
  --query 'HostedZones[0].[Name,Id]' --output text      # api.ryuzcloud.com.  /hostedzone/Z...
```

In Cloudflare → **ryuzcloud.com → DNS → Records**:

1. Delete any `@` A, AAAA or CNAME records, and any NS records you added for the apex. Apex NS records have no effect.
2. Add `@` **CNAME** `api.ryuzcloud.com`, **DNS only** (grey cloud).
3. Add `media` **CNAME** `media.api.ryuzcloud.com`, **DNS only**.
4. After stage A1 (§2.2), add the two ACM validation CNAMEs, **DNS only**.

Steps 2 and 3 can be added now. They resolve to nothing until a session creates the targets.

**Check against Cloudflare's own name server, not your resolver** (free; `+norec` asks the server itself, with no cache in between):

```bash
CF=chad.ns.cloudflare.com
dig +norec +noall +authority NS api.ryuzcloud.com @$CF     # the referral: four ns-*.awsdns-* servers
R53=$(dig +norec +noall +authority NS api.ryuzcloud.com @$CF | awk 'NR==1{print $5}')
dig +norec +noall +answer +comments SOA api.ryuzcloud.com @$R53 | grep -E 'flags|SOA'   # "aa" flag = Route 53 is authoritative
dig +norec +short CNAME media.ryuzcloud.com @$CF            # media.api.ryuzcloud.com.
dig +norec +short A ryuzcloud.com @$CF                      # empty while destroyed; the ALB's IPs during a session
dig +norec +short A api.ryuzcloud.com @$R53                 # the same IPs (Route 53's alias answer)
```

Delete the old zones you no longer use: the two `ryucloud.link` zones, and any `ryuzcloud.com` or `app.ryuzcloud.com`
zone. Each costs $0.50 per month, and a zone must be empty except for NS and SOA before it can be deleted.

### 1.5 Config files

```bash
cd ~/projects/RyuZCloud/infra/terraform
[ -f backend.hcl ]      || cp backend.hcl.example backend.hcl
[ -f terraform.tfvars ] || cp terraform.tfvars.example terraform.tfvars
vi backend.hcl          # bucket = your state bucket; region = "us-west-2"
vi terraform.tfvars
```

`terraform.tfvars` for a temporary session:

```hcl
aws_region          = "us-west-2"
domain_name         = "ryuzcloud.com"       # the site (apex in Cloudflare); media is media.ryuzcloud.com
delegated_zone_name = "api.ryuzcloud.com"   # the Route 53 zone from 1.4
hosted_zone_id      = "Z..."                # its ID from 1.4
alert_email         = "you@example.com"     # your address; AWS emails a confirmation link
deploy_services     = false                 # first apply runs no tasks
protect_data        = false                 # lets destroy delete RDS, S3 and ECR in one pass
monthly_budget_usd  = 60
# github_repository left unset: no GitHub deploy role (see aws-audit.md finding 1)
```

`protect_data` must be `false` **before the first apply**. Otherwise destroy is blocked by deletion protection.

### 1.6 Account guard rails (once, free)

In the console: Billing → Budgets → two budgets, $20 and $50 actual spend, each with an email alert. The budget Terraform
creates is destroyed with the stack, so it cannot warn you about leftovers.

---

## 2. Rebuild

### 2.0 Start a session

Set a phone alarm for when you intend to destroy. Log each step's start time, so the rebuild time ends up in
[metrics.md](metrics.md) as a measurement rather than an estimate:

```bash
cd ~/projects/RyuZCloud
export AWS_PROFILE=ryucloud AWS_REGION=us-west-2
aws login --profile ryucloud --remote          # MFA; credentials last about 15 minutes
aws sts get-caller-identity --query Arn --output text    # must end in user/ryucloud-admin
tf() { ~/projects/RyuZCloud/scripts/aws-terraform.sh "$@"; }
export TERRAFORM=~/projects/RyuZCloud/scripts/aws-terraform.sh
mark() { echo "$(date -u +%FT%TZ) $*" | tee -a ~/ryuzcloud-session.log; }
tf version                                     # Terraform v1.10.5
dig +norec +noall +authority NS api.ryuzcloud.com @chad.ns.cloudflare.com   # four awsdns servers (§1.4)
git status --short                             # images are built from the committed tree: commit first
mark "session start $(git rev-parse --short HEAD)"
```

**The 15-minute rule.** `scripts/aws-terraform.sh` hands Terraform a fixed copy of your `aws login` credentials, and they
expire after about 15 minutes. Any single `apply` or `destroy` that runs past that fails with `ExpiredToken`. So the
apply below is split into stages, and you run `aws login` again before each one. If a stage still fails, see §5.

### 2.1 Init and full plan (free)

```bash
cd ~/projects/RyuZCloud/infra/terraform
tf init -backend-config=backend.hcl
tf plan -out=tfplan
```

**Expect:** `Plan: 111 to add, 0 to change, 0 to destroy` with `github_repository` unset (2026-11-26, metrics row C1b).
The 2026-11-14 plan for the old `ryucloud.link` setup showed 115; the difference was not broken down. Any `to destroy` on
an empty state means the state is not empty: stop and run `tf state list`.

Do not apply this saved plan yet. Apply it in the stages below.

### 2.2 Stage A: certificates (free: ACM public certificates)

**A1. Request the certificates and print the Cloudflare records.**

```bash
aws login --profile ryucloud --remote
mark "stage A start"
tf apply -target=aws_acm_certificate.app -target=aws_acm_certificate.media -target=data.aws_route53_zone.delegated
tf output -json cloudflare_records | jq -r '.[] | [.type, .name, .content, .purpose] | @tsv'
```

Expect `2 to add` in A1. The output lists every record from the §1.4 table. Make sure each one exists in Cloudflare
with the same content, **DNS only**. Normally only the two `_….ryuzcloud.com` validation CNAMEs are new, and only the
first time. Check them against Cloudflare's name server:

```bash
tf output -json cloudflare_records | jq -r '.[] | select(.purpose|startswith("ACM")) | .name' |
  while read -r n; do echo "$n -> $(dig +norec +short CNAME "$n" @chad.ns.cloudflare.com)"; done   # each must print a value
```

**A2. Wait for ISSUED.**

```bash
aws login --profile ryucloud --remote
tf apply -target=aws_acm_certificate_validation.app -target=aws_acm_certificate_validation.media
mark "stage A done"
```

Expect `2 to add`. It completes only when both certificates are `ISSUED`. Once the records resolve this takes a few minutes. Each validation gives up after 10 minutes. If it
does, recheck the records with the `dig` loop above and run A2 again; this is harmless.

### 2.3 Stage B: CloudFront (**BILLS** from here, though CloudFront with no traffic is near $0)

```bash
aws login --profile ryucloud --remote
mark "stage B start"
tf apply -target=aws_cloudfront_distribution.media
mark "stage B done"
```

This creates the distribution and what it depends on (the bucket, the key group, the public key and the response-headers policy). CloudFront usually
takes 5 to 15 minutes.

### 2.4 Stage C: everything else (**BILLS**: ALB, RDS, public IPv4, secrets, alarms)

```bash
aws login --profile ryucloud --remote
mark "stage C start"
tf plan -out=tfplan        # expect: only "to add"; 0 to change, 0 to destroy
tf apply tfplan
mark "stage C done"
tf plan                    # expect: "No changes."
```

RDS takes the longest, usually 5 to 10 minutes. When it finishes:

1. **Confirm the SNS email** sent to `alert_email`. Alarms stay silent until you do.
2. **Store the signing key.** The API refuses to start without it:

```bash
cd ~/projects/RyuZCloud/infra/terraform
aws secretsmanager put-secret-value \
  --secret-id "$(tf output -raw cloudfront_private_key_secret)" \
  --secret-string "file://$HOME/.ryucloud/cloudfront_private_key.pem" --query Name --output text
```

### 2.5 Build and push images (**BILLS**: ECR storage, cents)

Run 2.5 and 2.6 in the same shell, because they share variables. `--network host` works around this VM's slow Docker
bridge network ([troubleshooting.md](troubleshooting.md)).

```bash
cd ~/projects/RyuZCloud
aws login --profile ryucloud --remote
mark "images start"
TAG="$(git rev-parse HEAD)"
PREFIX=ryucloud-prod
REGISTRY="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.${AWS_REGION}.amazonaws.com"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker build --network host --target prod   -t "$REGISTRY/$PREFIX/api:$TAG"      backend
docker build --network host --target worker -t "$REGISTRY/$PREFIX/worker:$TAG"   backend
docker build --network host --target prod   -t "$REGISTRY/$PREFIX/frontend:$TAG" frontend
docker push "$REGISTRY/$PREFIX/api:$TAG"
docker push "$REGISTRY/$PREFIX/worker:$TAG"
docker push "$REGISTRY/$PREFIX/frontend:$TAG"
mark "images done"
```

The `docker login` stores a registry token in `~/.docker/config.json`. Run `docker logout "$REGISTRY"` at the end of the session.

### 2.6 Migrate, point the services at the images, start them (**BILLS**: Fargate tasks and their public IPs)

```bash
cd ~/projects/RyuZCloud
aws login --profile ryucloud --remote
CLUSTER="$(tf -chdir=infra/terraform output -raw ecs_cluster)"
mark "migrate start"
scripts/aws-roll-service.sh "$CLUSTER" - "$PREFIX-migrate" migrate "$REGISTRY/$PREFIX/api:$TAG"
scripts/aws-run-migrations.sh                       # prints "Migrations applied."
scripts/aws-roll-service.sh "$CLUSTER" api      "$PREFIX-api"      api      "$REGISTRY/$PREFIX/api:$TAG"
scripts/aws-roll-service.sh "$CLUSTER" worker   "$PREFIX-worker"   worker   "$REGISTRY/$PREFIX/worker:$TAG"
scripts/aws-roll-service.sh "$CLUSTER" frontend "$PREFIX-frontend" frontend "$REGISTRY/$PREFIX/frontend:$TAG"
mark "migrate done"
```

Then turn the services on:

```bash
cd ~/projects/RyuZCloud/infra/terraform
sed -i 's/^deploy_services *=.*/deploy_services = true/' terraform.tfvars
grep '^deploy_services' terraform.tfvars              # deploy_services = true
tf plan -out=tfplan
```

**Expect:** `Plan: 0 to add, 3 to change, 0 to destroy.` That is `desired_count` 0 → 1 on `api`, `frontend` and `worker`.
This is derived from `ecs.tf`, not from a recorded run. The services ignore `task_definition` changes, so the image roll in
2.6 does not appear here. Anything else in the plan means drift: read it before applying.

```bash
tf apply tfplan
mark "services on"
```

### 2.7 Verify

```bash
cd ~/projects/RyuZCloud
APP=$(tf -chdir=infra/terraform output -raw app_url)
MEDIA=$(tf -chdir=infra/terraform output -raw media_url)
BUCKET=$(tf -chdir=infra/terraform output -raw media_bucket)
curl -fsS "$APP/api/v1/health"; echo        # {"status":"ok","version":"..."}
curl -fsS "$APP/api/v1/health/ready"; echo  # includes "schema_version"
curl -sI "$APP/" | head -1                  # HTTP/2 200
curl -sI "http://${APP#https://}/" | head -1   # 301 (redirect to HTTPS)
curl -sI "$MEDIA/videos/x/hls/master.m3u8" | head -1                              # 403: no signed cookie
curl -sI "https://$BUCKET.s3.amazonaws.com/videos/x/hls/master.m3u8" | head -1    # 403: bucket is private
aws ecs describe-services --cluster "$CLUSTER" --services api frontend worker \
  --query 'services[].[serviceName,runningCount,desiredCount]' --output table    # 1 1 for each
```

Host routing: the ALB must refuse any host other than the site.

```bash
curl -sI https://api.ryuzcloud.com/ -k | head -1          # HTTP/2 404 (wrong host; -k because the cert is for ryuzcloud.com)
dig +norec +short A ryuzcloud.com @chad.ns.cloudflare.com # ALB addresses (flattened apex)
```

In the browser, open `https://ryuzcloud.com`: register, create a channel, upload a short clip, and watch it go to *ready*.
Then play it. In DevTools → Application → Cookies you should see three `CloudFront-*` cookies with domain
`ryuzcloud.com`. In the Network tab, the `.m3u8` and `.ts` requests go to `media.ryuzcloud.com` and return 200.

```bash
mark "first video played"
```

The time from `stage A start` to `first video played` is the rebuild time. Record it in [metrics.md](metrics.md), with
the timestamps from `~/ryuzcloud-session.log`.

---

## 3. Tear down (**DESTRUCTIVE**: deletes the database and every video)

Capture evidence first, because nothing survives: screenshots, `tf output`, and any numbers you want in
[metrics.md](metrics.md). Redact account IDs, ARNs and the alert email.

Check that `protect_data = false` is in `terraform.tfvars`. If it is `true`, set it to `false` and `tf apply` first.

Staged destroy, again with fresh credentials each time:

```bash
cd ~/projects/RyuZCloud/infra/terraform
aws login --profile ryucloud --remote
mark "destroy start"
tf apply -destroy -target=aws_cloudfront_distribution.media     # slowest part, 10-20 minutes
aws login --profile ryucloud --remote
tf apply -destroy -target=aws_db_instance.main
aws login --profile ryucloud --remote
tf plan -destroy -out=destroy.tfplan       # read it: only ryucloud-prod resources; never the hosted zone or the state bucket
tf apply destroy.tfplan
mark "destroy done"
tf state list | wc -l                      # 0
sed -i 's/^deploy_services *=.*/deploy_services = false/' terraform.tfvars   # ready for next time
```

On 2026-11-14 the destroy reported **94 destroyed** in total (User-reported). That does not match the 115 planned
adds. The raw output was not kept, so the gap is unexplained. Record your own counts.

### 3.1 Audit (read-only, free)

```bash
cd ~/projects/RyuZCloud
aws login --profile ryucloud --remote
scripts/aws-audit.sh
docker logout "$REGISTRY" 2>/dev/null; aws logout
```

Every **direct** check must print `ok ... none`. The tag-search section can keep listing deleted security groups, a VPC
endpoint or an `INACTIVE` ECS cluster for a while after a destroy: AWS's tag index lags. On 2026-11-14 it listed 19 such
entries, and every one was confirmed gone or inactive by direct lookup. The script still exits 1 in that case, which is a
known flaw. Then check the console: EC2 → Load Balancers, RDS → Databases and Snapshots, VPC → NAT gateways and Elastic
IPs, CloudFront → Distributions. All should be empty.

The next day, open Billing → Cost Explorer → daily view. The day after the destroy should be close to $0.

---

## 4. Cost while running

These are **estimates**, not measurements ([aws-costs.md](aws-costs.md); list prices taken from us-east-1 and not confirmed
for us-west-2):

| State | ≈ USD per hour | ≈ USD per day |
| --- | --- | --- |
| Infrastructure only (`deploy_services = false`: ALB, RDS, IPv4, secrets, alarms) | 0.07 | 1.65 |
| Everything running, no traffic | 0.12 to 0.16 | 2.90 to 3.90 |
| Destroyed (state bucket and one hosted zone) | ≈ 0.0007 | ≈ 0.02 |

Storage and delivery of media grow with the library: S3 Standard is about $0.023 per GB-month, and CloudFront's first
1 TB per month is free. The real cost of a session becomes a ledger row only once you read it from Cost Explorer.

---

## 5. When something goes wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ExpiredToken` during apply or destroy; `errored.tfstate` written; state locked | The 15-minute credentials expired mid-run | Make sure no Terraform container is running (`docker ps`). Read the lock ID from the `.tflock` object next to the state key in the state bucket, then `tf force-unlock -force <ID>`, `tf state push errored.tfstate` and `tf plan`. If a resource shows as tainted but is healthy in AWS (for example RDS is `available`), run `tf untaint <address>` instead of letting Terraform replace it. Then re-run the stage. |
| A2 times out on `aws_acm_certificate_validation` | A validation CNAME is missing, proxied (orange cloud) or mistyped in Cloudflare | Run the `dig` loop in §2.2. Every name must return the `acm-validations.aws` value. Fix it in Cloudflare, then re-run A2 |
| `ryuzcloud.com` does not resolve during a session | The apex CNAME is missing, or an old `@` A/AAAA record is still there | Run the §1.4 `dig` checks. Cloudflare allows only one kind of record at `@` |
| Browser shows a 404 page from the load balancer | Wrong `Host` (for example you opened `api.ryuzcloud.com` or the ALB name) | Use `https://ryuzcloud.com`. Only that host is routed |
| API tasks fail to start (ECS deployment circuit breaker) right after 2.6 | Signing key not stored (§2.4 step 2) | Store the key, then `aws ecs update-service --cluster "$CLUSTER" --service api --force-new-deployment` |
| `/health/ready` is 503 `migrations_pending` | Migrations not run against this database | `scripts/aws-run-migrations.sh` |
| Player 403 on `master.m3u8` with cookies present | Cookie policy or host mismatch | `CLOUDFRONT_COOKIE_DOMAIN` must be a parent of the media host. See the 2026-11-14 wildcard bug in [verification.md](verification.md) |
| Docker build crawls at KB/s | This VM's Docker bridge network | Keep `--network host` |
| Destroy fails on a non-empty bucket or repository | `protect_data` was `true` at apply time | Set it to `false`, `tf apply`, then destroy again. Do not delete things by hand first. |
