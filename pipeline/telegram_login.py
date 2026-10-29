"""Interactive helper that prints a Telethon StringSession to paste into TELEGRAM_SESSION."""

import asyncio
import os
import sys

import env  # noqa: F401  (loads ../.env)
from telethon import TelegramClient
from telethon.sessions import StringSession


async def main():
    """Log in with phone number and code, then print the session string."""
    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in the project root .env first.")
        return 1

    client = TelegramClient(StringSession(), int(api_id), api_hash)
    await client.start()  # prompts for phone number, login code and 2FA password if needed
    try:
        session = client.session.save()
    finally:
        await client.disconnect()

    print("\nWARNING: the session string below gives full access to your Telegram account.")
    print("Keep it secret. Do not commit it, log it or share it.")
    print("Paste it into the project root .env as TELEGRAM_SESSION.\n")
    print(session)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
