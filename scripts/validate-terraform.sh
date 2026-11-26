#!/usr/bin/env bash
# Offline Terraform checks: formatting and validation. Needs no AWS credentials and creates
# nothing. `init -backend=false` downloads the AWS provider into infra/terraform/.terraform.
#
# The project pins Terraform 1.10.5 (CI uses it too). If the `terraform` on PATH is that exact
# version it is used directly; otherwise the same version runs in Docker, so the result does not
# depend on whatever Terraform happens to be installed on the host.
set -euo pipefail

TF_VERSION="${TF_VERSION:-1.10.5}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infra/terraform"

# A separate data directory, so a real `terraform init -backend-config=backend.hcl` from an AWS session
# (recorded in .terraform/terraform.tfstate) is never used here. With the default directory,
# `init -backend=false` reuses that S3 backend and fails without AWS credentials. Git-ignored via `.terraform/`.
export TF_DATA_DIR=".terraform/validate"

host_version=""
if command -v terraform >/dev/null 2>&1; then
  host_version="$(terraform version | head -1 | sed 's/^Terraform v//')"
fi

if [ "$host_version" = "$TF_VERSION" ]; then
  tf() { terraform "$@"; }
elif command -v docker >/dev/null 2>&1; then
  echo "host terraform is '${host_version:-not installed}', not $TF_VERSION: using hashicorp/terraform:$TF_VERSION in Docker" >&2
  tf() {
    docker run --rm --user "$(id -u):$(id -g)" --env HOME=/tmp \
      --env TF_DATA_DIR --volume "$ROOT:$ROOT" --workdir "$PWD" "hashicorp/terraform:$TF_VERSION" "$@"
  }
else
  echo "error: need Terraform $TF_VERSION or Docker (host terraform: '${host_version:-none}')" >&2
  exit 1
fi

tf fmt -check -recursive -diff
tf init -backend=false -input=false
tf validate
