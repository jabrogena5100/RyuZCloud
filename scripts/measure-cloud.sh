#!/usr/bin/env bash
# Phase 6: page weight, Lighthouse and time to first frame against the live AWS deployment.
#
# Runs the same three scripts as scripts/measure-phase5.sh, unchanged, but against a deployed site instead
# of two local builds, so the numbers include the real network, the ALB, Fargate and CloudFront.
# Needs: a running session with the library seeded, Node and frontend/node_modules on this machine.
# Makes only HTTPS requests to BASE (and the media host it links to); no AWS credentials are used.
# Writes: docs/evidence/metrics/cloud-<date>-<label>/ (JSON only). Takes about 30-40 minutes.
#
# Usage: scripts/measure-cloud.sh            BASE=https://ryuzcloud.com RUNS=3 LABEL=<commit of the deployed images>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${BASE:-https://ryuzcloud.com}"
RUNS="${RUNS:-3}"
LABEL="${LABEL:-$(git -C "$ROOT" rev-parse --short HEAD)}"
OUT="$ROOT/docs/evidence/metrics/cloud-$(date -u +%F)-$LABEL"

[ ! -e "$OUT" ] || { echo "error: ${OUT#"$ROOT"/} already exists; set LABEL=<name> for a new run" >&2; exit 1; }
curl -fsS -m 10 "$BASE/api/v1/health/ready" >/dev/null || { echo "error: $BASE/api/v1/health/ready is not ready" >&2; exit 1; }
[ -d "$ROOT/frontend/node_modules/playwright" ] || { echo "error: frontend/node_modules is missing" >&2; exit 1; }

mkdir -p "$OUT"
{
  echo "date_utc: $(date -u +%FT%TZ)"
  echo "base: $BASE"
  echo "local_commit: $(git -C "$ROOT" rev-parse HEAD)"
  echo "api_health: $(curl -fsS "$BASE/api/v1/health")"
  echo "node: $(node -v)"
  echo "cpu: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//') x $(nproc)"
  echo "library: $(curl -fsS "$BASE/api/v1/stats")"
  # Round-trip time to the site, so the "unthrottled" playback profile has a stated network.
  echo "curl_timing: $(curl -s -o /dev/null -w 'dns %{time_namelookup}s connect %{time_connect}s tls %{time_appconnect}s ttfb %{time_starttransfer}s' "$BASE/")"
} >"$OUT/environment.txt"

cd "$ROOT/frontend"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ryuzcloud-cloud.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
echo "== page weight" >&2
SHOTS=0 node scripts/measure-pages.cjs "$BASE" "$WORK/pages" "$RUNS" >/dev/null
cp "$WORK/pages/metrics.json" "$OUT/pages.json"
echo "== lighthouse" >&2
node scripts/lighthouse.mjs "$BASE" "$OUT/lighthouse.json" "$RUNS"
echo "== playback" >&2
node scripts/measure-playback.cjs "$BASE" "$OUT/playback.json" "$RUNS"

echo
echo "Done. Evidence: ${OUT#"$ROOT"/}"
