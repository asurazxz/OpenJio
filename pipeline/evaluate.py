"""Score out/drafts.json against hand labels in labels/labels.json."""

import json
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
LABELS_PATH = PIPELINE_DIR / "labels" / "labels.json"
DRAFTS_PATH = PIPELINE_DIR / "out" / "drafts.json"
FIELDS = ["type", "merchant", "dateFrom", "dateTo", "timeWindows", "outletName"]


def read_json(path, default):
    """Load JSON from path, or return default if the file is missing."""
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def draft_fields(draft):
    """Pull the comparable fields out of a draft."""
    validity = draft.get("validity") or {}
    outlets = draft.get("outlets") or [{}]
    return {
        "type": draft.get("type"),
        "merchant": draft.get("merchant"),
        "dateFrom": validity.get("dateFrom"),
        "dateTo": validity.get("dateTo"),
        "timeWindows": validity.get("timeWindows"),
        "outletName": outlets[0].get("name"),
    }


def normalise(value):
    """Trim and lower-case strings. Lists and dicts compare as sorted JSON."""
    if isinstance(value, str):
        return value.strip().lower() or None
    if isinstance(value, (list, dict)):
        return json.dumps(value, sort_keys=True)
    return value


def main():
    """Print per-field accuracy and how many drafts need review."""
    labels = read_json(LABELS_PATH, [])
    drafts = read_json(DRAFTS_PATH, {})
    by_raw_id = {d.get("rawPostId"): d for d in drafts.values()}

    correct = {f: 0 for f in FIELDS}
    total = {f: 0 for f in FIELDS}
    compared = missing = 0
    for label in labels:
        draft = by_raw_id.get(label.get("rawPostId"))
        if draft is None:
            missing += 1
            continue
        compared += 1
        got = draft_fields(draft)
        for field in FIELDS:
            total[field] += 1
            if normalise(label.get(field)) == normalise(got[field]):
                correct[field] += 1

    print(f"Labels: {len(labels)}, compared: {compared}, no draft found: {missing}")
    if not labels:
        print("labels/labels.json is empty. Label 30 to 50 posts first (see labels/README.md).")
    for field in FIELDS:
        if total[field]:
            pct = 100 * correct[field] / total[field]
            print(f"  {field:<12} {correct[field]}/{total[field]} exact ({pct:.0f}%)")
        else:
            print(f"  {field:<12} no labelled posts yet")

    needs_review = 0
    for draft in drafts.values():
        f = draft_fields(draft)
        if f["type"] is None or f["outletName"] is None or f["dateFrom"] is None or f["dateTo"] is None:
            needs_review += 1
    print(f"Drafts needing review (null type, outlet name or dates): {needs_review} of {len(drafts)}")


if __name__ == "__main__":
    main()
