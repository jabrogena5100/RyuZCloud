#!/usr/bin/env python3
"""Seed the demo library through the real upload path (Phase 4).

Every clip in content/manifest.json goes through exactly what a browser does:
  POST /uploads (presigned URL)  ->  PUT the file straight to object storage  ->  POST /uploads/{id}/complete
so the API verifies it, queues a job, and the worker transcodes it to HLS and makes the thumbnail.
Then PATCH /videos/{id} sets the collection and the footage credit. The featured clip is uploaded
last, after every other clip is ready, so it is the newest ready video: the home hero shows it.

Commands (from the repository root):
  python3 scripts/seed.py titles   Draft demo titles into content/titles.json for clips without one.
                                   Edit them freely; they are invented demo data. Existing entries are kept.
  python3 scripts/seed.py run      Upload, wait for the worker, and write a timing report.

Environment:
  SEED_PASSWORD   required; the demo account's password (never printed). The account is created if missing.
  SEED_EMAIL      demo account email          (default library@example.com)
  SEED_API        API base URL                (default http://localhost:3000/api/v1, i.e. through the frontend
                                               like a browser; on AWS: https://ryuzcloud.com/api/v1)
  SEED_ORIGIN     Origin header for writes    (default: the scheme and host of SEED_API)
  SEED_FEATURED   manifest key of the hero clip (default: the first clip of the first collection)
  SEED_STALL_MINUTES  stop with an error when no pending job changes (claimed, stage, progress, attempt,
                  status) for this long (default 15). Usually means the worker is down.
  SEED_RETRY_FAILED   set to 1 to delete clips that ended `failed` in an earlier run and upload them again.

Re-running is safe: content/seed-state/<host>.json remembers which clips were uploaded to which API, and
only missing ones are uploaded. Raw timings go to docs/evidence/metrics/seed-<date>-<host>.json.
"""

from __future__ import annotations

import datetime as dt
import http.cookiejar
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "content" / "manifest.json"
PLAN = ROOT / "content" / "collections.json"
TITLES = ROOT / "content" / "titles.json"
STATE_DIR = ROOT / "content" / "seed-state"
EVIDENCE = ROOT / "docs" / "evidence" / "metrics"

POLL_SECONDS = 5
WAIT_LIMIT_SECONDS = 4 * 3600
STALL_HINT = (
    "Check the worker: `docker compose ps worker` (it should be Up, not Restarting) and "
    "`docker compose logs --tail 50 worker`. Fix it, then re-run `seed.py run`: uploaded clips are not uploaded again."
)
CHANNEL = {"handle": "demo-library", "name": "RyuZCloud Library"}
CONTENT_TYPES = {".mp4": "video/mp4", ".webm": "video/webm"}


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def load(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def save(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(path)


def now() -> float:
    return time.time()


def iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat(timespec="seconds")


def parse_time(value: str | None) -> float | None:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() if value else None


# --------------------------------------------------------------------------------------------
# Titles
# --------------------------------------------------------------------------------------------

def draft_title(item: dict) -> str:
    if item["source"] == "Pixabay" and item.get("tags"):
        words: list[str] = []
        for tag in item["tags"]:
            if tag not in words:
                words.append(tag)
        words = words[:3]
        text = words[0].capitalize() if len(words) == 1 else ", ".join(words[:-1]).capitalize() + " and " + words[-1]
    else:
        stem = item["key"].split(":", 1)[1]
        stem = re.sub(r"^File:", "", stem)
        stem = re.sub(r"\.(webm|ogv|mp4)$", "", stem, flags=re.I)
        stem = re.sub(r"^\d{4}[-_ ]\d{2}[-_ ]\d{2}\s*[-_]*\s*", "", stem)
        text = stem.replace("_", " ").strip() or "Untitled clip"
    return text[:100]


def cmd_titles() -> None:
    manifest = load(MANIFEST, None) or fail("content/manifest.json is missing: run scripts/library.py download first")
    plan = {c["slug"]: c for c in load(PLAN, {"collections": []})["collections"]}
    titles = load(TITLES, {})
    added = 0
    for item in manifest["items"]:
        if item["key"] in titles:
            continue
        collection = plan.get(item["collection"], {}).get("title", item["collection"])
        titles[item["key"]] = {
            "title": draft_title(item),
            "description": f"A demo clip in the {collection} collection. The footage credit is below.",
        }
        added += 1
    save(TITLES, dict(sorted(titles.items())))
    print(f"{added} draft title(s) added to {TITLES.relative_to(ROOT)} ({len(titles)} total). Edit them, then run `seed.py run`.")


# --------------------------------------------------------------------------------------------
# API client (cookie session, Origin header on writes, never prints secrets)
# --------------------------------------------------------------------------------------------

class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"HTTP {status} {code}: {message}")
        self.status, self.code = status, code


class Api:
    def __init__(self, base: str, origin: str):
        self.base = base.rstrip("/")
        self.origin = origin
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method: str, path: str, body: dict | None = None) -> dict | None:
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Accept": "application/json", "User-Agent": "ryuzcloud-seed/1.0"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if method != "GET":
            headers["Origin"] = self.origin  # the API only accepts writes from trusted origins
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with self.opener.open(request, timeout=60) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            try:
                error = json.loads(err.read()).get("error", {})
            except ValueError:
                error = {}
            raise ApiError(err.code, error.get("code", "http_error"), error.get("message", "")) from None
        except urllib.error.URLError as err:
            fail(f"could not reach the API at {self.base}: {err.reason}")


def put_file(target: dict, path: Path, content_type: str) -> float:
    """PUT the file straight to object storage with the presigned request. Returns seconds taken."""
    headers = dict(target.get("headers") or {})
    headers.setdefault("Content-Type", content_type)
    headers["Content-Length"] = str(path.stat().st_size)
    started = now()
    with path.open("rb") as fh:
        request = urllib.request.Request(target["url"], data=fh, method=target.get("method", "PUT"), headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=600) as response:
                response.read()
        except urllib.error.HTTPError as err:
            # The URL carries a signature: report the status only.
            raise ApiError(err.code, "storage_put_failed", "object storage rejected the upload") from None
    return now() - started


def sign_in(api: Api, email: str, password: str) -> None:
    try:
        api.call("POST", "/auth/register", {"email": email, "password": password, "display_name": "RyuZCloud Library"})
        print(f"created the demo account {email}")
    except ApiError as err:
        if err.status != 409:
            fail(f"could not create the demo account: {err}")
        try:
            api.call("POST", "/auth/login", {"email": email, "password": password})
        except ApiError as login_err:
            fail(f"could not sign in as {email}: {login_err}")


def demo_channel(api: Api) -> str:
    for channel in api.call("GET", "/channels/mine") or []:
        if channel["handle"] == CHANNEL["handle"]:
            return channel["id"]
    return api.call("POST", "/channels", CHANNEL)["id"]


# --------------------------------------------------------------------------------------------
# Seeding
# --------------------------------------------------------------------------------------------

def credit_of(item: dict) -> dict:
    return {k: item.get(k) for k in ("source", "source_page_url", "author", "author_url", "license_name", "license_url")}


def upload_one(api: Api, channel_id: str, item: dict, title: dict) -> dict:
    path = ROOT / item["file"]
    if not path.exists():
        raise ApiError(0, "file_missing", f"{item['file']} is missing (run scripts/library.py download)")
    content_type = CONTENT_TYPES.get(path.suffix.lower())
    if not content_type:
        raise ApiError(0, "unsupported_file", f"{path.suffix} is not an accepted video type")
    started = now()
    session = api.call("POST", "/uploads", {
        "channel_id": channel_id, "title": title["title"], "description": title["description"], "visibility": "public",
        "filename": path.name, "content_type": content_type, "size_bytes": path.stat().st_size,
    })
    put_seconds = put_file(session["target"], path, content_type)
    api.call("POST", f"/uploads/{session['upload']['id']}/complete")
    video_id = session["video"]["id"]
    collection = title.get("collection") or item["collection"]  # titles.json may move a clip to a better collection
    api.call("PATCH", f"/videos/{video_id}", {"collection": collection, "credit": credit_of(item)})
    return {
        "video_id": video_id, "size_bytes": path.stat().st_size, "put_seconds": round(put_seconds, 3),
        "upload_started": iso(started), "upload_completed": iso(now()), "status": "queued",
    }


class Stalled(Exception):
    pass


def wait_for(api: Api, state: dict, keys: list[str], stall_seconds: float) -> None:
    """Polls until every clip is ready or failed. Raises Stalled when nothing moves for stall_seconds."""
    pending = [k for k in keys if state[k]["status"] not in ("ready", "failed")]
    deadline = now() + WAIT_LIMIT_SECONDS
    seen: dict[str, tuple] = {}  # last observed (status, job state, stage, progress, attempts, started_at)
    last_change = now()
    while pending and now() < deadline:
        for key in list(pending):
            try:
                p = api.call("GET", f"/videos/{state[key]['video_id']}/pipeline")
            except ApiError as err:
                print(f"  {key}: pipeline check failed ({err}); will retry", file=sys.stderr)
                continue
            job = p.get("job") or {}
            mark = (p["status"], job.get("state"), job.get("stage"), job.get("progress"), job.get("attempts"), job.get("started_at"))
            if seen.get(key) != mark:
                if key in seen:
                    last_change = now()
                seen[key] = mark
            if p["status"] in ("ready", "failed"):
                last_change = now()
                job = p.get("job") or {}
                state[key].update({
                    "status": p["status"],
                    "duration_seconds": p.get("duration_seconds"),
                    "job_started": job.get("started_at"),
                    "job_finished": job.get("finished_at"),
                    "attempts": job.get("attempts"),
                    "renditions": [r["name"] for r in p.get("renditions", [])],
                    "hls_bytes": sum(r["size_bytes"] for r in p.get("renditions", [])),
                })
                pending.remove(key)
                print(f"  {p['status']:<6} {key}  ({len(keys) - len(pending)}/{len(keys)} done)")
        if pending and now() - last_change > stall_seconds:
            queued = sum(1 for k in pending if seen.get(k, ("",))[0] == "queued")
            raise Stalled(
                f"no job was claimed or made progress for {stall_seconds / 60:.0f} min; "
                f"{len(pending)} clip(s) pending ({queued} still queued). {STALL_HINT}"
            )
        if pending:
            time.sleep(POLL_SECONDS)
    if pending:
        print(f"  gave up waiting after {WAIT_LIMIT_SECONDS // 3600} h; {len(pending)} still processing (re-run to resume)")


def report(state: dict, keys: list[str], started: float, finished: float, host: str) -> dict:
    done = [state[k] for k in keys if state[k]["status"] == "ready"]
    ratios = []
    for v in done:
        start, end = parse_time(v.get("job_started")), parse_time(v.get("job_finished"))
        if start and end and v.get("duration_seconds"):
            v["job_seconds"] = round(end - start, 3)
            v["realtime_factor"] = round((end - start) / v["duration_seconds"], 3)
            ratios.append(v["realtime_factor"])
    original = sum(v["size_bytes"] for v in done)
    hls = sum(v.get("hls_bytes", 0) for v in done)
    put_seconds = sum(v["put_seconds"] for v in done)
    summary = {
        "date": dt.date.today().isoformat(),
        "api_host": host,
        "clips_uploaded": len(keys),
        "clips_ready": len(done),
        "clips_failed": sum(1 for k in keys if state[k]["status"] == "failed"),
        "clips_retried": sum(1 for v in done if (v.get("attempts") or 1) > 1),
        "footage_seconds": sum(v.get("duration_seconds") or 0 for v in done),
        "seed_wall_seconds_this_run": round(finished - started, 1),
        "original_bytes": original,
        "hls_bytes": hls,
        "hls_to_original_ratio": round(hls / original, 3) if original else None,
        "upload_put_seconds_total": round(put_seconds, 1),
        "upload_mbit_per_s": round(original * 8 / 1e6 / put_seconds, 1) if put_seconds else None,
        "realtime_factor": {
            "definition": "worker job wall time (first claim to finish: download, probe, all renditions, thumbnail, upload) / clip duration",
            "n": len(ratios),
            "median": round(statistics.median(ratios), 3) if ratios else None,
            "min": min(ratios) if ratios else None,
            "max": max(ratios) if ratios else None,
        },
    }
    out = EVIDENCE / f"seed-{summary['date']}-{re.sub(r'[^a-z0-9]+', '-', host.lower())}.json"
    save(out, {"summary": summary, "clips": {k: state[k] for k in keys}})
    print("\n" + json.dumps(summary, indent=2))
    print(f"\nRaw timings: {out.relative_to(ROOT)}")
    return summary


def cmd_run() -> None:
    password = os.environ.get("SEED_PASSWORD", "")
    if len(password) < 8:
        fail("set SEED_PASSWORD (8+ characters) for the demo account; it is never printed")
    email = os.environ.get("SEED_EMAIL", "library@example.com")
    base = os.environ.get("SEED_API", "http://localhost:3000/api/v1")
    parsed = urllib.parse.urlparse(base)
    origin = os.environ.get("SEED_ORIGIN", f"{parsed.scheme}://{parsed.netloc}")
    host = parsed.netloc
    try:
        stall_seconds = float(os.environ.get("SEED_STALL_MINUTES", "15")) * 60
    except ValueError:
        fail("SEED_STALL_MINUTES must be a number")
    retry_failed = os.environ.get("SEED_RETRY_FAILED") == "1"

    manifest = load(MANIFEST, None) or fail("content/manifest.json is missing: run scripts/library.py download first")
    titles = load(TITLES, {})
    missing_titles = [i["key"] for i in manifest["items"] if i["key"] not in titles]
    if missing_titles:
        fail(f"{len(missing_titles)} clip(s) have no title yet: run `seed.py titles` first")

    plan_order = [c["slug"] for c in load(PLAN, {"collections": []})["collections"]]
    def collection_of(item: dict) -> str:
        return titles[item["key"]].get("collection") or item["collection"]

    items = sorted(manifest["items"], key=lambda i: (plan_order.index(collection_of(i)) if collection_of(i) in plan_order else 99))
    featured = os.environ.get("SEED_FEATURED") or items[0]["key"]
    if featured not in {i["key"] for i in items}:
        fail(f"SEED_FEATURED={featured!r} is not in the manifest")
    ordered = [i for i in items if i["key"] != featured] + [i for i in items if i["key"] == featured]

    state_file = STATE_DIR / f"{re.sub(r'[^a-z0-9]+', '-', host.lower())}.json"
    state = load(state_file, {})
    api = Api(base, origin)
    sign_in(api, email, password)
    channel_id = demo_channel(api)
    print(f"seeding {len(ordered)} clips into channel @{CHANNEL['handle']} at {base} (featured: {featured})")

    if retry_failed:
        for key in [k for k, v in state.items() if v.get("status") == "failed"]:
            try:
                api.call("DELETE", f"/videos/{state[key]['video_id']}")
            except ApiError as err:
                if err.status != 404:
                    fail(f"could not delete the failed video for {key}: {err}")
            print(f"  removed failed {key}; it will be uploaded again")
            del state[key]
        save(state_file, state)

    started = now()
    rest, last = ordered[:-1], ordered[-1:]
    for batch in (rest, last):
        for item in batch:
            if item["key"] in state:
                continue  # uploaded in an earlier run
            try:
                state[item["key"]] = upload_one(api, channel_id, item, titles[item["key"]])
                save(state_file, state)
                print(f"  uploaded {item['key']} ({state[item['key']]['size_bytes'] / 1e6:.1f} MB in {state[item['key']]['put_seconds']:.1f} s)")
            except ApiError as err:
                print(f"  skipped {item['key']}: {err}", file=sys.stderr)
        # The featured clip waits until everything before it is ready, so it is the newest ready video.
        try:
            wait_for(api, state, [i["key"] for i in batch if i["key"] in state], stall_seconds)
        except Stalled as err:
            save(state_file, state)
            fail(str(err))
        save(state_file, state)
    keys = [i["key"] for i in ordered if i["key"] in state]
    report(state, keys, started, now(), host)


COMMANDS = {"titles": cmd_titles, "run": cmd_run}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(2)
    COMMANDS[sys.argv[1]]()
