"""Command line entry point: fetch posts, extract drafts, and write review files to out/."""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import env  # noqa: F401  (loads ../.env)
import extract
import sources

PIPELINE_DIR = Path(__file__).resolve().parent
OUT_DIR = PIPELINE_DIR / "out"
RAW_PATH = OUT_DIR / "raw_posts.json"
DRAFTS_PATH = OUT_DIR / "drafts.json"
RUNS_PATH = OUT_DIR / "ingest_runs.json"
DEFAULT_CHANNELS = ["sgfooddeals", "sgweekend", "sgconcerts", "dateideas", "sgstudentpromos"]
SGT = timezone(timedelta(hours=8))


def read_json(path, default):
    """Load JSON from path, or return default if the file does not exist."""
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    """Write data as UTF-8 JSON, creating out/ if needed."""
    OUT_DIR.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def raw_key(post):
    """Composite id that keys raw posts."""
    return f"{post['source']}:{post['channel_id']}:{post['message_id']}"


def fetch_telegram(channel, limit):
    """Read a channel from the public preview. Telethon is the fallback when it is configured."""
    try:
        posts = sources.fetch_telegram_preview(channel, limit)
    except Exception as exc:
        if not sources.telethon_configured():
            raise
        print(f"  preview failed for {channel} ({exc}); trying Telethon")
        posts = []
    if not posts and sources.telethon_configured():
        posts = sources.fetch_telegram_telethon(channel, limit)
    return posts


def fetch_all(limit, channels, use_confirmgood, errors):
    """Fetch every enabled source. Returns (posts, counts per source)."""
    jobs = []
    if use_confirmgood:
        jobs.append(("confirmgood", lambda: sources.fetch_confirmgood(limit)))
    for channel in channels:
        jobs.append((f"telegram:{channel}", lambda c=channel: fetch_telegram(c, limit)))

    posts, counts = [], {}
    for name, job in jobs:
        try:
            found = [p for p in job() if p["text"].strip()]
        except Exception as exc:  # one failing source must not stop the run
            errors.append(f"{name}: {exc}")
            print(f"[fetch] {name} failed: {exc}")
            found = []
        counts[name] = len(found)
        posts.extend(found)
        print(f"[fetch] {name}: {len(found)} posts")
    return posts, counts


def merge_raw(store, fetched, now_iso):
    """Merge fetched posts into store. Returns (new keys, edited keys)."""
    new_keys, edited_keys = [], []
    for post in fetched:
        key = raw_key(post)
        old = store.get(key)
        if old is None:
            store[key] = post
            new_keys.append(key)
        elif old["text"] != post["text"]:
            post["edited_at"] = now_iso
            store[key] = post
            edited_keys.append(key)
        else:
            old["retrieved_at"] = post["retrieved_at"]
    return new_keys, edited_keys


def run(args):
    """Run one ingest pass and print a summary."""
    if args.channels:
        channels = [c.strip() for c in args.channels.split(",") if c.strip()]
    else:
        channels = DEFAULT_CHANNELS
    now_iso = datetime.now(SGT).isoformat(timespec="seconds")
    errors = []

    fetched, counts = fetch_all(args.limit, channels, not args.no_confirmgood, errors)

    raw_store = read_json(RAW_PATH, {})
    new_keys, edited_keys = merge_raw(raw_store, fetched, now_iso)
    write_json(RAW_PATH, raw_store)

    drafts = read_json(DRAFTS_PATH, {})
    by_extractor = {"gemini": 0, "regex": 0}
    written, kept_reviewed, dropped_other = [], 0, 0
    for key in new_keys + edited_keys:
        draft = extract.build_draft(raw_store[key])
        by_extractor[draft["extractor"]] += 1
        if draft["type"] == "other":
            dropped_other += 1
            continue
        existing = drafts.get(draft["id"])
        if existing and existing.get("status") != "draft":
            kept_reviewed += 1  # a human has already reviewed this one
            continue
        drafts[draft["id"]] = draft
        written.append(draft)

    stale_other = [d_id for d_id, d in drafts.items()
                   if d.get("type") == "other" and d.get("status") == "draft"]
    for d_id in stale_other:
        del drafts[d_id]
    dropped_other += len(stale_other)
    write_json(DRAFTS_PATH, drafts)

    null_outlet = sum(1 for d in written if "outlets.name" in d["unknownFields"])
    null_dates = sum(1 for d in written if d["validity"]["dateFrom"] is None)
    extracted = len(new_keys) + len(edited_keys)

    print("\nSummary")
    for name, count in counts.items():
        print(f"  fetched {name}: {count}")
    print(f"  raw posts: {len(new_keys)} new, {len(edited_keys)} edited, {len(raw_store)} stored")
    print(f"  extracted: {extracted} (gemini {by_extractor['gemini']}, regex {by_extractor['regex']})")
    print(f"  drafts written: {len(written)} (drafts.json now holds {len(drafts)})")
    print(f"  dropped as other: {dropped_other}; reviewed drafts left untouched: {kept_reviewed}")
    print(f"  written drafts with null outlet name: {null_outlet} of {len(written)}")
    print(f"  written drafts with null dateFrom: {null_dates} of {len(written)}")
    if errors:
        print("  errors:")
        for error in errors:
            print(f"    - {error}")
    print(f"  output: {DRAFTS_PATH}")

    record = {
        "ranAt": now_iso,
        "limit": args.limit,
        "channels": channels,
        "confirmgood": not args.no_confirmgood,
        "fetched": counts,
        "rawNew": len(new_keys),
        "rawEdited": len(edited_keys),
        "rawTotal": len(raw_store),
        "extracted": extracted,
        "byExtractor": by_extractor,
        "draftsWritten": len(written),
        "draftsTotal": len(drafts),
        "droppedOther": dropped_other,
        "keptReviewed": kept_reviewed,
        "nullOutlet": null_outlet,
        "nullDate": null_dates,
        "errors": errors,
    }
    runs = read_json(RUNS_PATH, [])
    runs.append(record)
    write_json(RUNS_PATH, runs)


def main(argv=None):
    """Parse arguments and run the pipeline."""
    parser = argparse.ArgumentParser(description="Ingest public SG deal and event posts into review drafts.")
    parser.add_argument("--limit", type=int, default=40, help="max posts per source (default 40)")
    parser.add_argument("--channels", help="comma-separated Telegram channels to read")
    parser.add_argument("--no-confirmgood", action="store_true", help="skip the ConfirmGood source")
    args = parser.parse_args(argv)
    run(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
