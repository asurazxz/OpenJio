"""Fetch raw posts from public Singapore deal and event sources."""

import asyncio
import os
import re
import time
from datetime import datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup
from telethon import TelegramClient
from telethon.sessions import StringSession

import env  # noqa: F401  (loads ../.env)

USER_AGENT = "OpenJioPipeline/0.1 (student project)"
TIMEOUT = 15
DELAY_SECONDS = 1.0
SGT = timezone(timedelta(hours=8))
URL_RE = re.compile(r"https?://[^\s<>\"']+")
BLOCK_TAGS = ["br", "p", "li", "div", "h1", "h2", "h3", "h4", "h5", "h6", "tr"]

_last_request_at = 0.0


def _polite_get(url, params=None):
    """GET a URL with our User-Agent, waiting so requests are at least 1 second apart."""
    global _last_request_at
    wait = DELAY_SECONDS - (time.monotonic() - _last_request_at)
    if wait > 0:
        time.sleep(wait)
    try:
        resp = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
    finally:
        _last_request_at = time.monotonic()
    resp.raise_for_status()
    return resp


def _to_sgt(value):
    """Convert an ISO string or datetime to an SGT ISO string. Naive values are taken as SGT."""
    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SGT)
    return dt.astimezone(SGT).isoformat(timespec="seconds")


def _unique(items):
    """Drop duplicates while keeping order."""
    return list(dict.fromkeys(items))


def _node_text(node):
    """Return text from a BeautifulSoup node with line breaks kept and blank lines removed."""
    if node is None:
        return ""
    for tag in node.find_all(BLOCK_TAGS):
        tag.append("\n")
    lines = [line.strip() for line in node.get_text().splitlines()]
    return "\n".join(line for line in lines if line)


def _make_post(source, channel_id, message_id, url, text, links, posted_at):
    """Build the raw post dict shared by every source."""
    return {
        "source": source,
        "channel_id": channel_id,
        "message_id": message_id,
        "url": url,
        "text": text,
        "links": links,
        "posted_at": posted_at,
        "retrieved_at": datetime.now(SGT).isoformat(timespec="seconds"),
    }


def fetch_confirmgood(limit=40):
    """Return recent ConfirmGood WordPress posts as raw post dicts."""
    resp = _polite_get(
        "https://confirmgood.com/wp-json/wp/v2/posts",
        params={"per_page": min(limit, 100), "_fields": "id,date,link,title,excerpt,content"},
    )
    posts = []
    for item in resp.json():
        content_html = item.get("content", {}).get("rendered", "")
        soup = BeautifulSoup(content_html, "html.parser")
        links = _unique(a["href"] for a in soup.find_all("a", href=True))
        title = BeautifulSoup(item.get("title", {}).get("rendered", ""), "html.parser").get_text().strip()
        body = _node_text(soup)
        if not body:
            body = _node_text(BeautifulSoup(item.get("excerpt", {}).get("rendered", ""), "html.parser"))
        text = "\n".join(part for part in (title, body) if part)
        posts.append(_make_post(
            "confirmgood", "confirmgood", str(item["id"]), item["link"], text, links,
            _to_sgt(item["date"]),
        ))
    return posts


def fetch_telegram_preview(channel, limit=40):
    """Return recent posts from the public t.me/s/<channel> preview page."""
    resp = _polite_get(f"https://t.me/s/{channel}")
    soup = BeautifulSoup(resp.text, "html.parser")
    posts = []
    for node in soup.select(".tgme_widget_message")[-limit:]:
        data_post = node.get("data-post", "")
        if "/" not in data_post:
            continue
        _, message_id = data_post.rsplit("/", 1)
        text_node = node.select_one(".tgme_widget_message_text")
        text = _node_text(text_node)
        if not text:
            continue
        links = _unique(
            a["href"] for a in node.select(".tgme_widget_message_text a[href], a.tgme_widget_message_link_preview[href]")
        )
        time_tag = node.find("time")
        posted_at = _to_sgt(time_tag["datetime"]) if time_tag and time_tag.get("datetime") else None
        posts.append(_make_post(
            "telegram", channel, message_id, f"https://t.me/{channel}/{message_id}", text, links, posted_at,
        ))
    return posts


def telethon_configured():
    """True when all three Telethon settings are present."""
    return all(os.environ.get(key) for key in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION"))


def fetch_telegram_telethon(channel, limit=40):
    """Read recent channel posts through a saved Telethon StringSession. Read only."""
    if not telethon_configured():
        raise RuntimeError("TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_SESSION must be set")
    return asyncio.run(_read_channel(channel, limit))


async def _read_channel(channel, limit):
    """Fetch the latest messages from one channel."""
    client = TelegramClient(
        StringSession(os.environ["TELEGRAM_SESSION"]),
        int(os.environ["TELEGRAM_API_ID"]),
        os.environ["TELEGRAM_API_HASH"],
    )
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise RuntimeError("TELEGRAM_SESSION is not authorised; run telegram_login.py")
        posts = []
        for msg in await client.get_messages(channel, limit=limit):
            text = (getattr(msg, "message", None) or "").strip()
            if not text:
                continue
            links = URL_RE.findall(text)
            links += [e.url for e in (getattr(msg, "entities", None) or []) if getattr(e, "url", None)]
            posts.append(_make_post(
                "telegram", channel, str(msg.id), f"https://t.me/{channel}/{msg.id}",
                text, _unique(links), _to_sgt(msg.date),
            ))
        return posts
    finally:
        await client.disconnect()
