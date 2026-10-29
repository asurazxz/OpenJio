"""Regex pre-parser that pulls date, time, price, day and line hints from post text."""

import re
from datetime import datetime, timedelta, timezone

SGT = timezone(timedelta(hours=8))

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
          "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
MONTH = (r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
         r"|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)")
UNTIL = r"(?:till|until|til|thru|through)"
YEAR = r"(?:,?\s*(20\d{2}))?"

# Order matters: each match is blanked out before the next pattern runs.
DATE_PATTERNS = [
    ("until", re.compile(rf"\b{UNTIL}\s+(\d{{1,2}})\s*{MONTH}\b{YEAR}", re.I)),
    ("until_num", re.compile(rf"\b{UNTIL}\s+(\d{{1,2}})/(\d{{1,2}})/(20\d{{2}})\b", re.I)),
    ("range", re.compile(rf"\b(\d{{1,2}})\s*(?:-|\u2013|to)\s*(\d{{1,2}})\s*{MONTH}\b{YEAR}", re.I)),
    ("single", re.compile(rf"\b(\d{{1,2}})\s*{MONTH}\b{YEAR}", re.I)),
    ("numeric", re.compile(r"\b(\d{1,2})/(\d{1,2})/(20\d{2})\b", re.I)),
]

TIME_12 = r"\d{1,2}(?:[:.]\d{2})?\s*[ap]\.?m\b"
TIME_24 = r"(?:[01]?\d|2[0-3]):[0-5]\d\b"
TIME_RANGE_RE = re.compile(rf"\b({TIME_12}|{TIME_24})\s*(?:-|\u2013|to|till|until)\s*({TIME_12}|{TIME_24})", re.I)

DAY_LIST = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_WORD = (r"(monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu"
            r"|friday|fri|saturday|sat|sunday|sun)s?")
DAY_RANGE_RE = re.compile(rf"\b{DAY_WORD}\s*(?:-|\u2013|to|till|until|through|thru)\s*{DAY_WORD}\b", re.I)
DAY_SINGLE_RE = re.compile(rf"\b{DAY_WORD}\b", re.I)

PRICE_RE = re.compile(r"(?:\bfrom\s+)?\$\s?\d+(?:\.\d{1,2})?", re.I)
ONE_FOR_ONE_RE = re.compile(r"\b1\s*-?\s*for\s*-?\s*1\b", re.I)
FREE_RE = re.compile(r"\bfree\b", re.I)
PERCENT_OFF_RE = re.compile(r"\b\d{1,3}\s?%\s*off\b", re.I)

DEAL_RE = re.compile(r"1\s*-?\s*for\s*-?\s*1|%\s*off|\bpromo\w*|\bdiscounts?\b|\bdeals?\b", re.I)
EVENT_RE = re.compile(r"\b(?:tickets?|workshops?|concerts?|festivals?|exhibitions?)\b", re.I)

LABEL_LINE_RE = re.compile(r"^\W*(date|time|where|venue|price)\s*:\s*(.+)$", re.I)
# Calendar, clock, pin and money emoji, written as code points.
EMOJI_LINE_RE = re.compile(
    r"^\s*([\U0001F4C5\U0001F5D3\U000023F0\U0001F550-\U0001F567\U0001F4CD\U0001F4CC"
    r"\U0001F4B0\U0001F4B2\U0001F4B5])️?\s*(.+)$"
)


def _month_no(token):
    """Turn a month word or number into an int."""
    return int(token) if token.isdigit() else MONTHS[token.lower()[:3]]


def _iso(day, month, year):
    """Return YYYY-MM-DD for valid parts, otherwise None."""
    try:
        return datetime(int(year), _month_no(month), int(day)).strftime("%Y-%m-%d")
    except (ValueError, KeyError):
        return None


def _parse_dates(text):
    """Return (dateFrom, dateTo). Years missing from the text use the current SGT year."""
    default_year = datetime.now(SGT).year
    found, work = [], text
    for kind, pattern in DATE_PATTERNS:
        def keep(match, kind=kind):
            found.append((kind, match.groups()))
            return " " * len(match.group(0))
        work = pattern.sub(keep, work)

    start = end = None
    for kind, g in found:
        if kind in ("until", "until_num"):
            end = end or _iso(g[0], g[1], g[2] or default_year)
        elif kind == "range":
            start = start or _iso(g[0], g[2], g[3] or default_year)
            end = end or _iso(g[1], g[2], g[3] or default_year)
        else:
            value = _iso(g[0], g[1], g[2] or default_year)
            if start is None:
                start = value
            else:
                end = end or value
    if start and end is None:
        end = start
    return start, end


def _to_hhmm(token):
    """Convert a 12h or 24h time token to HH:MM, or None if invalid."""
    m = re.match(r"(\d{1,2})(?:[:.](\d{2}))?", token)
    hour, minute = int(m.group(1)), int(m.group(2) or 0)
    suffix = re.search(r"([ap])\.?m", token, re.I)
    if suffix:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if suffix.group(1).lower() == "p" else 0)
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def _parse_time_windows(text):
    """Return a list of {start, end} windows, or None."""
    windows = []
    for m in TIME_RANGE_RE.finditer(text):
        start, end = _to_hhmm(m.group(1)), _to_hhmm(m.group(2))
        if start and end:
            windows.append({"start": start, "end": end})
    return windows or None


def _day_index(word):
    """Map a day word such as Monday or Tues to an index 0 (Mon) to 6 (Sun)."""
    return DAY_LIST.index(word[:3].lower())


def _parse_days(text):
    """Return sorted day codes such as MON, or None."""
    days = set()
    for m in DAY_RANGE_RE.finditer(text):
        i, end = _day_index(m.group(1)), _day_index(m.group(2))
        while True:
            days.add(i)
            if i == end:
                break
            i = (i + 1) % 7
    for m in DAY_SINGLE_RE.finditer(text):
        days.add(_day_index(m.group(1)))
    low = text.lower()
    if "weekday" in low:
        days.update(range(5))
    if "weekend" in low:
        days.update({5, 6})
    if re.search(r"\bdaily\b|every day", low):
        days.update(range(7))
    return [DAY_LIST[i].upper() for i in sorted(days)] or None


def _price_text(text):
    """Return the earliest price-like phrase ($ amount, 1-for-1 or free), or None."""
    found = [(m.start(), m.group(0).strip()) for m in PRICE_RE.finditer(text)]
    found += [(m.start(), "1-for-1") for m in ONE_FOR_ONE_RE.finditer(text)]
    found += [(m.start(), m.group(0)) for m in FREE_RE.finditer(text)]
    return min(found)[1] if found else None


def _emoji_kind(ch):
    """Map a calendar, clock, pin or money emoji to a line kind."""
    cp = ord(ch)
    if cp in (0x1F4C5, 0x1F5D3):
        return "date"
    if cp == 0x23F0 or 0x1F550 <= cp <= 0x1F567:
        return "time"
    if cp in (0x1F4CD, 0x1F4CC):
        return "where"
    return "price"


def _parse_lines(text):
    """Return the first value found for date, time, where and price lines."""
    lines = {"date": None, "time": None, "where": None, "price": None}
    for raw in text.splitlines():
        line = raw.strip()
        m = LABEL_LINE_RE.match(line)
        if m:
            key = m.group(1).lower()
            key = "where" if key == "venue" else key
            value = m.group(2).strip()
        else:
            m = EMOJI_LINE_RE.match(line)
            if not m:
                continue
            key, value = _emoji_kind(m.group(1)), m.group(2).strip()
        if lines[key] is None and value:
            lines[key] = value
    return lines


def _classify(text):
    """Guess deal, event or other from keywords."""
    if DEAL_RE.search(text):
        return "deal"
    if EVENT_RE.search(text):
        return "event"
    return "other"


def parse_text(text):
    """Return regex hints for a post. Anything not found is None."""
    text = text or ""
    date_from, date_to = _parse_dates(text)
    return {
        "kind": _classify(text),
        "dateFrom": date_from,
        "dateTo": date_to,
        "daysOfWeek": _parse_days(text),
        "timeWindows": _parse_time_windows(text),
        "priceText": _price_text(text),
        "discounts": PERCENT_OFF_RE.findall(text) or None,
        "lines": _parse_lines(text),
    }
