#!/usr/bin/env python3
"""Build the demo video library from licence-clean sources (Phase 4).

Sources, and only these:
  * Pixabay video API        Pixabay Content License   (needs PIXABAY_API_KEY in the environment)
  * Wikimedia Commons        CC0 or public domain only (no key)

The flow is deliberately small and human-reviewed, not a bulk scraper. Pixabay's API terms say
"Systematic mass downloads are not allowed" and "requests must be cached for 24 hours", so:

  1. search    A handful of cached searches per collection (content/collections.json) write
               content/shortlist.json and content/review.html. Nothing is downloaded.
  2. review    Open content/review.html, tick the clips to keep (check for identifiable faces,
               logos and brands), copy the list into content/keep.txt.
  3. download  Downloads only the kept clips, one at a time, into content/media/ (git-ignored), and
               writes content/manifest.json and frontend/public/credits.json.
  4. verify    Re-hashes every file against the manifest.
     status    Counts per collection, and the bytes that a download would fetch.

Usage (from the repository root):
  python3 scripts/library.py search
  python3 scripts/library.py status
  python3 scripts/library.py download
  python3 scripts/library.py verify

Secrets: the Pixabay key is read from PIXABAY_API_KEY and never printed, logged or cached (cache
files are keyed by the request without the key). Wikimedia asks API clients to identify themselves;
set WIKIMEDIA_CONTACT (an email or URL) to add a contact to the User-Agent, otherwise a generic one
is sent.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
PLAN = CONTENT / "collections.json"
CACHE = CONTENT / "cache"
MEDIA = CONTENT / "media"
SHORTLIST = CONTENT / "shortlist.json"
REVIEW = CONTENT / "review.html"
KEEP = CONTENT / "keep.txt"
MANIFEST = CONTENT / "manifest.json"
CREDITS = ROOT / "frontend" / "public" / "credits.json"

PIXABAY_API = "https://pixabay.com/api/videos/"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
PIXABAY_LICENSE = ("Pixabay Content License", "https://pixabay.com/service/license-summary/")

CACHE_TTL_SECONDS = 24 * 3600  # Pixabay: "requests must be cached for 24 hours"
API_PAUSE_SECONDS = {"pixabay.com": 1.0, "commons.wikimedia.org": 3.0}  # well under both services' limits
MAX_RETRIES = 3
DOWNLOAD_PAUSE_SECONDS = {"upload.wikimedia.org": 10.0}  # per host; 2 s elsewhere. One file at a time: no bulk downloading
MIN_SECONDS, MAX_SECONDS = 8, 60
MIN_HEIGHT = 720                # the worker's top rendition is 720p and it never upscales
CANDIDATES_PER_COLLECTION = 2   # shortlist up to this many times the collection's target

# Tags that usually mean identifiable people; such clips are not even shortlisted.
PEOPLE_WORDS = {
    "people", "person", "man", "men", "woman", "women", "girl", "boy", "child", "children", "kid", "kids",
    "family", "couple", "face", "portrait", "crowd", "model", "selfie", "baby", "friends", "businessman",
}


def user_agent() -> str:
    contact = os.environ.get("WIKIMEDIA_CONTACT", "").strip()
    suffix = f"; {contact}" if contact else ""
    return f"RyuZCloud-demo-library/1.0 (portfolio demo library builder{suffix}) python-urllib"


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def load_json(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(path)


# --------------------------------------------------------------------------------------------
# HTTP with a 24-hour cache
# --------------------------------------------------------------------------------------------

def get_json(base: str, params: dict[str, str], secret: dict[str, str] | None = None) -> dict:
    """GET a JSON API. `secret` params are sent but never cached, printed or used in the cache key."""
    public_url = f"{base}?{urllib.parse.urlencode(sorted(params.items()))}"
    cache_file = CACHE / (hashlib.sha256(public_url.encode()).hexdigest()[:32] + ".json")
    if cache_file.exists() and time.time() - cache_file.stat().st_mtime < CACHE_TTL_SECONDS:
        return json.loads(cache_file.read_text())

    host = urllib.parse.urlparse(base).netloc
    query = dict(params, **(secret or {}))
    request = urllib.request.Request(f"{base}?{urllib.parse.urlencode(query)}", headers={"User-Agent": user_agent()})
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = json.loads(response.read())
                remaining = response.headers.get("X-RateLimit-Remaining")
            break
        except urllib.error.HTTPError as err:
            # Never include the URL: for Pixabay it contains the key.
            if err.code == 429 and attempt < MAX_RETRIES:
                wait = int(err.headers.get("Retry-After") or 0) or 30 * (attempt + 1)
                print(f"  {host} asked us to slow down (HTTP 429); waiting {wait} s", file=sys.stderr)
                time.sleep(wait)
                continue
            fail(f"{host} answered HTTP {err.code} for a search request")
        except urllib.error.URLError as err:
            fail(f"could not reach {host}: {err.reason}")
    if remaining is not None and int(remaining) < 10:
        print(f"  rate limit nearly used up ({remaining} left); waiting 60 s", file=sys.stderr)
        time.sleep(60)
    write_json(cache_file, body)
    time.sleep(API_PAUSE_SECONDS.get(host, 2.0))
    return body


def strip_html(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


# --------------------------------------------------------------------------------------------
# Search
# --------------------------------------------------------------------------------------------

def pixabay_candidates(term: str, collection: str) -> list[dict]:
    key = os.environ.get("PIXABAY_API_KEY", "").strip()
    if not key:
        fail("PIXABAY_API_KEY is not set in this shell (export it, then run again)")
    data = get_json(
        PIXABAY_API,
        {"q": term, "video_type": "film", "safesearch": "true", "order": "popular", "per_page": "50"},
        secret={"key": key},
    )
    out = []
    for hit in data.get("hits", []):
        tags = [t.strip().lower() for t in str(hit.get("tags", "")).split(",") if t.strip()]
        if PEOPLE_WORDS & {w for t in tags for w in t.split()}:
            continue
        duration = int(hit.get("duration") or 0)
        if not MIN_SECONDS <= duration <= MAX_SECONDS:
            continue
        # The smallest variant that still feeds the 720p rendition, landscape only.
        variants = [hit["videos"][k] for k in ("tiny", "small", "medium", "large") if hit.get("videos", {}).get(k)]
        usable = [v for v in variants if v.get("url") and v.get("height", 0) >= MIN_HEIGHT and v.get("width", 0) > v.get("height", 0)]
        if not usable:
            continue
        pick = min(usable, key=lambda v: v["height"])
        user, user_id = str(hit.get("user", "")), hit.get("user_id")
        out.append({
            "key": f"pixabay:{hit['id']}",
            "collection": collection,
            "source": "Pixabay",
            "source_page_url": hit.get("pageURL"),
            "author": user,
            "author_url": f"https://pixabay.com/users/{user}-{user_id}/" if user and user_id else None,
            "license_name": PIXABAY_LICENSE[0],
            "license_url": PIXABAY_LICENSE[1],
            "duration_seconds": duration,
            "width": pick["width"],
            "height": pick["height"],
            "approx_size_bytes": int(pick.get("size") or 0),
            "download_url": pick["url"],
            "extension": ".mp4",
            "preview_image": pick.get("thumbnail"),
            "tags": tags,
            "search_term": term,
        })
    return out


# Structured-data statements on Commons: P275 licence = CC0 (Q6938433); P6216 copyright status = public domain (Q19652).
COMMONS_FILTERS = ("haswbstatement:P275=Q6938433", "haswbstatement:P6216=Q19652")


def commons_licence_ok(name: str) -> bool:
    n = name.lower()
    return n.startswith("cc0") or "public domain" in n or n.startswith("pd")


def commons_candidates(term: str, collection: str) -> list[dict]:
    out = []
    for flt in COMMONS_FILTERS:
        data = get_json(COMMONS_API, {
            "action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
            "gsrsearch": f"{term} filetype:video {flt}", "gsrlimit": "30",
            "prop": "videoinfo", "viprop": "url|size|mime|extmetadata|derivatives", "viurlwidth": "480",
        })
        for page in data.get("query", {}).get("pages", {}).values():
            info = (page.get("videoinfo") or [{}])[0]
            meta = info.get("extmetadata", {})
            licence = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
            if not commons_licence_ok(licence):
                continue  # the search filter is a hint; the file page's own licence decides
            duration = float(info.get("duration") or 0)
            width, height = int(info.get("width") or 0), int(info.get("height") or 0)
            if not MIN_SECONDS <= duration <= MAX_SECONDS or width <= height:
                continue
            webm = [d for d in info.get("derivatives", []) if str(d.get("type", "")).startswith("video/webm")
                    and int(d.get("height") or 0) >= MIN_HEIGHT and int(d.get("width") or 0) > int(d.get("height") or 0)]
            if not webm:
                continue
            pick = min(webm, key=lambda d: int(d["height"]))
            author = strip_html(meta.get("Artist", {}).get("value", "")) or "Unknown author"
            out.append({
                "key": f"commons:{page['title']}",
                "collection": collection,
                "source": "Wikimedia Commons",
                "source_page_url": info.get("descriptionurl"),
                "author": author[:200],
                "author_url": None,
                "license_name": licence,
                "license_url": strip_html(meta.get("LicenseUrl", {}).get("value", "")) or None,
                "duration_seconds": round(duration),
                "width": int(pick["width"]),
                "height": int(pick["height"]),
                "approx_size_bytes": 0,  # Commons does not report derivative sizes
                "download_url": pick["src"],
                "extension": ".webm",
                "preview_image": info.get("thumburl"),
                "tags": [],
                "search_term": term,
            })
    return out


def cmd_search() -> None:
    plan = load_json(PLAN, None) or fail(f"{PLAN} is missing")
    shortlist: list[dict] = []
    seen: set[str] = set()
    for col in plan["collections"]:
        limit = col["target"] * CANDIDATES_PER_COLLECTION
        found: list[dict] = []
        for term in col.get("pixabay", []):
            print(f"  {col['slug']}: Pixabay '{term}'")
            found += pixabay_candidates(term, col["slug"])
        for term in col.get("commons", []):
            print(f"  {col['slug']}: Commons '{term}'")
            found += commons_candidates(term, col["slug"])
        kept = 0
        # Interleave sources and terms so one search does not fill the whole shortlist.
        for cand in sorted(found, key=lambda c: (c["source"] != "Wikimedia Commons", c["search_term"])):
            if cand["key"] in seen or kept >= limit:
                continue
            seen.add(cand["key"])
            shortlist.append(cand)
            kept += 1
        print(f"  {col['slug']}: {kept} candidates (target {col['target']})")
    write_json(SHORTLIST, {"generated": today(), "candidates": shortlist})
    write_review_page(plan, shortlist)
    print(f"\nWrote {SHORTLIST.relative_to(ROOT)} ({len(shortlist)} candidates) and {REVIEW.relative_to(ROOT)}.")
    print("Next: open the review page, tick the clips to keep, save the list as content/keep.txt.")


def write_review_page(plan: dict, shortlist: list[dict]) -> None:
    cards = []
    for col in plan["collections"]:
        items = [c for c in shortlist if c["collection"] == col["slug"]]
        cards.append(f"<h2>{html.escape(col['title'])} <small>target {col['target']}, "
                     f"<span class=count data-col='{col['slug']}'>0</span> ticked, {len(items)} candidates</small></h2><div class=grid>")
        for c in items:
            cards.append(
                f"<label class=card><input type=checkbox value='{html.escape(c['key'], quote=True)}' data-col='{col['slug']}'>"
                f"<img loading=lazy src='{html.escape(c['preview_image'] or '', quote=True)}' alt=''>"
                f"<span>{c['duration_seconds']} s · {c['width']}×{c['height']} · {html.escape(c['source'])}</span>"
                f"<span>{html.escape(c['author'][:40])} · {html.escape(c['license_name'])}</span>"
                f"<span class=tags>{html.escape(', '.join(c['tags'][:6]))}</span>"
                f"<a href='{html.escape(c['source_page_url'] or '', quote=True)}' target=_blank rel=noopener>source page</a></label>")
        cards.append("</div>")
    REVIEW.write_text(f"""<!doctype html><meta charset=utf-8><title>Library review</title>
<style>body{{font:14px system-ui;background:#141414;color:#eceae4;margin:24px}}h2 small{{color:#b2aea6;font-weight:400}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}}
.card{{display:flex;flex-direction:column;gap:4px;background:#20201f;padding:8px;border-radius:8px;border:2px solid transparent}}
.card:has(input:checked){{border-color:#a3b18a}}.card img{{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:4px}}
.tags{{color:#8f8c84}}a{{color:#a3b18a}}textarea{{width:100%;height:140px;background:#20201f;color:#eceae4}}
#bar{{position:sticky;top:0;background:#141414;padding:8px 0}}</style>
<div id=bar><p>Tick clips with no identifiable faces, logos or brands. Then copy the list into <code>content/keep.txt</code>.
Images load from Pixabay and Wikimedia for this local review only.</p><button id=copy>Copy list</button>
<textarea id=out readonly></textarea></div>{''.join(cards)}
<script>const boxes=[...document.querySelectorAll('input[type=checkbox]')];
function update(){{document.getElementById('out').value=boxes.filter(b=>b.checked).map(b=>b.value).join('\\n');
document.querySelectorAll('.count').forEach(c=>c.textContent=boxes.filter(b=>b.checked&&b.dataset.col===c.dataset.col).length)}}
boxes.forEach(b=>b.addEventListener('change',update));
document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('out').value);update();</script>
""")


# --------------------------------------------------------------------------------------------
# Download, manifest, credits
# --------------------------------------------------------------------------------------------

def kept_candidates() -> list[dict]:
    shortlist = load_json(SHORTLIST, None) or fail("no shortlist yet: run `search` first")
    if not KEEP.exists():
        fail("content/keep.txt is missing: tick clips in content/review.html and save the list there")
    wanted = [line.strip() for line in KEEP.read_text().splitlines() if line.strip() and not line.startswith("#")]
    by_key = {c["key"]: c for c in shortlist["candidates"]}
    unknown = [k for k in wanted if k not in by_key]
    if unknown:
        fail(f"{len(unknown)} line(s) in keep.txt are not in the shortlist, e.g. {unknown[0]!r}")
    return [by_key[k] for k in dict.fromkeys(wanted)]


def media_name(cand: dict) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", cand["key"].lower()).strip("-")[:80]
    return f"{slug}{cand['extension']}"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, target: Path) -> None:
    """Download one file, honouring HTTP 429 Retry-After (Wikimedia's media servers throttle per client)."""
    tmp = target.with_suffix(target.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": user_agent()})
    try:
        for attempt in range(MAX_RETRIES + 1):
            try:
                with urllib.request.urlopen(request, timeout=120) as response, tmp.open("wb") as out:
                    while chunk := response.read(1 << 20):
                        out.write(chunk)
                break
            except urllib.error.HTTPError as err:
                if err.code == 429 and attempt < MAX_RETRIES:
                    wait = int(err.headers.get("Retry-After") or 0) or 60 * (attempt + 1)
                    print(f"    {urllib.parse.urlparse(url).netloc} asked us to slow down (HTTP 429); waiting {wait} s", file=sys.stderr)
                    time.sleep(wait)
                    continue
                raise
        tmp.replace(target)
    finally:
        tmp.unlink(missing_ok=True)  # never leave a half-written .part behind


def cmd_download() -> None:
    wanted = kept_candidates()
    manifest = load_json(MANIFEST, {"items": []})
    done = {item["key"]: item for item in manifest["items"]}
    MEDIA.mkdir(parents=True, exist_ok=True)
    items = []
    for i, cand in enumerate(wanted, 1):
        target = MEDIA / media_name(cand)
        previous = done.get(cand["key"])
        if previous and target.exists() and previous.get("size_bytes") == target.stat().st_size:
            items.append(previous)
            continue
        print(f"  [{i}/{len(wanted)}] {cand['key']}")
        try:
            download(cand["download_url"], target)
        except (urllib.error.URLError, OSError) as err:
            print(f"    skipped: download failed ({getattr(err, 'code', '') or getattr(err, 'reason', err)})", file=sys.stderr)
            continue
        entry = {k: cand[k] for k in ("key", "collection", "source", "source_page_url", "author", "author_url",
                                     "license_name", "license_url", "duration_seconds", "width", "height", "tags")}
        entry.update({
            "file": str(target.relative_to(ROOT)),
            "size_bytes": target.stat().st_size,
            "sha256": sha256_of(target),
            "retrieved": today(),
            "download_url": cand["download_url"],
        })
        items.append(entry)
        time.sleep(DOWNLOAD_PAUSE_SECONDS.get(urllib.parse.urlparse(cand["download_url"]).netloc, 2.0))
    write_json(MANIFEST, {"generated": today(), "items": items})
    write_credits(items)
    total = sum(i["size_bytes"] for i in items)
    missing = len(wanted) - len(items)
    print(f"\n{len(items)} clips, {total / 1e6:.1f} MB in {MEDIA.relative_to(ROOT)}; manifest and credits written.")
    if missing:
        print(f"{missing} kept clip(s) failed to download; run `download` again later (finished files are skipped).")


def write_credits(items: list[dict]) -> None:
    """The public credits list served by the frontend (no file paths, hashes or download URLs)."""
    plan = load_json(PLAN, {"collections": []})
    titles = {c["slug"]: c["title"] for c in plan["collections"]}
    moved = {k: v.get("collection") for k, v in load_json(CONTENT / "titles.json", {}).items() if v.get("collection")}
    public = [{
        "key": i["key"], "collection": titles.get(moved.get(i["key"], i["collection"]), i["collection"]), "source": i["source"],
        "source_page_url": i["source_page_url"], "author": i["author"], "author_url": i["author_url"],
        "license_name": i["license_name"], "license_url": i["license_url"], "retrieved": i["retrieved"],
    } for i in items]
    write_json(CREDITS, {"generated": today(), "items": public})


def cmd_verify() -> None:
    manifest = load_json(MANIFEST, None) or fail("no manifest yet")
    bad = 0
    for item in manifest["items"]:
        path = ROOT / item["file"]
        if not path.exists():
            print(f"  missing: {item['file']}")
            bad += 1
        elif sha256_of(path) != item["sha256"]:
            print(f"  hash mismatch: {item['file']}")
            bad += 1
    print(f"{len(manifest['items']) - bad} of {len(manifest['items'])} files verified")
    sys.exit(1 if bad else 0)


def cmd_status() -> None:
    plan = load_json(PLAN, {"collections": []})
    shortlist = load_json(SHORTLIST, {"candidates": []})["candidates"]
    keep = set(line.strip() for line in KEEP.read_text().splitlines()) if KEEP.exists() else set()
    manifest = load_json(MANIFEST, {"items": []})["items"]
    print(f"{'collection':<14}{'target':>7}{'candidates':>12}{'kept':>6}{'downloaded':>12}{'seconds':>9}")
    for col in plan["collections"]:
        cands = [c for c in shortlist if c["collection"] == col["slug"]]
        kept = [c for c in cands if c["key"] in keep]
        got = [m for m in manifest if m["collection"] == col["slug"]]
        print(f"{col['slug']:<14}{col['target']:>7}{len(cands):>12}{len(kept):>6}{len(got):>12}"
              f"{sum(c['duration_seconds'] for c in kept):>9}")
    kept_all = [c for c in shortlist if c["key"] in keep]
    known = sum(c["approx_size_bytes"] for c in kept_all)
    unknown = sum(1 for c in kept_all if not c["approx_size_bytes"])
    print(f"\nkept: {len(kept_all)} clips, {sum(c['duration_seconds'] for c in kept_all)} s; "
          f"Pixabay-reported size {known / 1e6:.0f} MB (+{unknown} Commons files of unreported size)")


def cmd_credits() -> None:
    """Rewrite frontend/public/credits.json from the manifest (e.g. after editing content/titles.json)."""
    manifest = load_json(MANIFEST, None) or fail("no manifest yet")
    write_credits(manifest["items"])
    print(f"wrote {CREDITS.relative_to(ROOT)} ({len(manifest['items'])} clips)")


COMMANDS = {"search": cmd_search, "download": cmd_download, "verify": cmd_verify, "status": cmd_status, "credits": cmd_credits}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(2)
    COMMANDS[sys.argv[1]]()
