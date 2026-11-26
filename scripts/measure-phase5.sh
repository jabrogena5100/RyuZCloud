#!/usr/bin/env bash
# Phase 5 measurements: page weight, Lighthouse and time to first frame, before vs after the redesign.
#
# Builds two committed versions of the frontend as production builds, serves both against the running
# local API (Compose), and measures them with the same browser on the same library:
#   before  = BEFORE (default f14c846, the last commit before the redesign; same commit as metrics row W1)
#   after   = AFTER  (default HEAD)
# Each build is a `git archive` of frontend/ in a temporary directory that reuses frontend/node_modules, so
# both use the same installed Next.js/React; only the app code differs. Nothing in the working tree changes.
#
# Needs: the Compose stack up with the seeded library (API on localhost:8000), Node, frontend/node_modules.
# Writes: docs/evidence/metrics/phase5-<date>-<before>-vs-<after>/ (JSON only). Takes about 40 minutes.
#
# Usage: scripts/measure-phase5.sh            RUNS=3 BEFORE=f14c846 AFTER=HEAD PORT_BEFORE=3101 PORT_AFTER=3102
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BEFORE="${BEFORE:-f14c846}"
AFTER="${AFTER:-HEAD}"
RUNS="${RUNS:-3}"
PORT_BEFORE="${PORT_BEFORE:-3101}"
PORT_AFTER="${PORT_AFTER:-3102}"
API="${API:-http://localhost:8000}"
LABEL="${LABEL:-$(git -C "$ROOT" rev-parse --short "$BEFORE")-vs-$(git -C "$ROOT" rev-parse --short "$AFTER")}"
OUT="$ROOT/docs/evidence/metrics/phase5-$(date -u +%F)-$LABEL"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ryuzcloud-phase5.XXXXXX")"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]}"; do pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT

[ ! -e "$OUT" ] || { echo "error: ${OUT#"$ROOT"/} already exists; set LABEL=<name> for a new run" >&2; exit 1; }

curl -fsS -m 5 "$API/api/v1/health/ready" >/dev/null || { echo "error: API not ready at $API; start the stack first" >&2; exit 1; }
for port in "$PORT_BEFORE" "$PORT_AFTER"; do
  if curl -s -m 2 -o /dev/null "http://localhost:$port/"; then
    echo "error: port $port is already in use; set PORT_BEFORE/PORT_AFTER" >&2
    exit 1
  fi
done
[ -d "$ROOT/frontend/node_modules/next" ] || { echo "error: frontend/node_modules is missing" >&2; exit 1; }

# build <name> <commit> <port>: production build of that commit's frontend, served in the background.
build() {
  local name="$1" commit="$2" port="$3" dir="$WORK/$1"
  mkdir -p "$dir"
  git -C "$ROOT" archive "$commit" frontend | tar -x -C "$dir"
  ln -s "$ROOT/frontend/node_modules" "$dir/frontend/node_modules"
  echo "== building $name ($(git -C "$ROOT" rev-parse --short "$commit"))" >&2
  (cd "$dir/frontend" && NEXT_TELEMETRY_DISABLED=1 API_PROXY_TARGET="$API" node_modules/.bin/next build) >"$WORK/$name-build.log" 2>&1 \
    || { tail -40 "$WORK/$name-build.log" >&2; exit 1; }
  sed -n '/Route (app)/,$p' "$WORK/$name-build.log" >"$OUT/build-$name.txt"
  (cd "$dir/frontend" && NEXT_TELEMETRY_DISABLED=1 exec node_modules/.bin/next start -p "$port") >"$WORK/$name-server.log" 2>&1 &
  PIDS+=("$!")
  for _ in $(seq 60); do
    curl -s -m 2 -o /dev/null "http://localhost:$port/" && return 0
    sleep 1
  done
  echo "error: $name server did not start on port $port" >&2
  tail -20 "$WORK/$name-server.log" >&2
  exit 1
}

mkdir -p "$OUT"
{
  echo "date_utc: $(date -u +%FT%TZ)"
  echo "before: $(git -C "$ROOT" rev-parse "$BEFORE")"
  echo "after: $(git -C "$ROOT" rev-parse "$AFTER")"
  echo "node: $(node -v)"
  echo "next: $(node -p 'require("'"$ROOT"'/frontend/node_modules/next/package.json").version')"
  echo "cpu: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//') x $(nproc)"
  echo "memory: $(free -g | awk '/^Mem:/ {print $2 " GiB"}')"
  echo "library: $(curl -fsS "$API/api/v1/stats")"
} >"$OUT/environment.txt"

build before "$BEFORE" "$PORT_BEFORE"
build after "$AFTER" "$PORT_AFTER"

cd "$ROOT/frontend"
for name in before after; do
  port="PORT_${name^^}"
  echo "== page weight: $name" >&2
  SHOTS=0 node scripts/measure-pages.cjs "http://localhost:${!port}" "$WORK/pages-$name" "$RUNS" >/dev/null
  cp "$WORK/pages-$name/metrics.json" "$OUT/pages-$name.json"
  echo "== lighthouse: $name" >&2
  node scripts/lighthouse.mjs "http://localhost:${!port}" "$OUT/lighthouse-$name.json" "$RUNS"
  echo "== playback: $name" >&2
  node scripts/measure-playback.cjs "http://localhost:${!port}" "$OUT/playback-$name.json" "$RUNS"
done

echo
echo "Done. Evidence: ${OUT#"$ROOT"/}"
