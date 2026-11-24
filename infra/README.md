# infra/

| Path | Purpose |
| --- | --- |
| `minio/` | Local development: creates the private bucket and least-privilege app user in MinIO (used by `docker-compose.yml`) |
| `terraform/` | AWS infrastructure. Applied once (2026-11-14), verified, then destroyed; rebuilt on demand. |

Local development needs nothing from `terraform/` and never talks to AWS.

## Terraform layout

| File | Resources |
| --- | --- |
| `versions.tf`, `variables.tf`, `main.tf` | Providers, validated input variables, naming and tags |
| `network.tf` | VPC, public + isolated database subnets, S3 gateway endpoint, security groups |
| `alb.tf`, `dns.tf` | Load balancer, listeners, ACM certificates, Route 53 records |
| `ecs.tf`, `ecr.tf` | Fargate cluster, API/frontend/worker services, one-off migration task, image repositories |
| `rds.tf` | PostgreSQL 17 on RDS, encrypted, RDS-managed password |
| `s3.tf`, `cloudfront.tf` | Private media bucket; CloudFront with Origin Access Control and a trusted key group |
| `sqs.tf` | Job queue and dead-letter queue |
| `iam.tf`, `secrets.tf` | Task/execution roles (least privilege), CloudFront key secret container |
| `monitoring.tf` | Log metric filters, alarms, SNS, dashboard, budget |
| `github_oidc.tf` | Optional OIDC role for the deploy workflow |

Start with [docs/rebuild-from-zero.md](../docs/rebuild-from-zero.md). Validation without AWS credentials:

```bash
cd ~/projects/RyuZCloud
scripts/validate-terraform.sh       # fmt -check, init -backend=false, validate
```

Never commit `terraform.tfvars`, `backend.hcl`, `*.pem`, or state files (all git-ignored). Do commit `.terraform.lock.hcl`.
