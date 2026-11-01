# Getting the credentials

All four integrations are optional. Availability uses the manual grid; Google Calendar is outside the project submission scope. Current status of each is tracked in [STATUS.md](./STATUS.md#3-integrations). Without them the app still runs end to end on sample data, estimated travel times and the manual availability grid. Add whichever you get to a file named `.env` in the project root (copy `.env.example`), then restart `pnpm dev` and the server.

Never commit `.env`. It is already in `.gitignore`.

## 1. OneMap (address search and transit routing)

OneMap issues a token that expires every 3 days, so the server stores your account email and password and refreshes the token itself.

1. Go to https://www.onemap.gov.sg/apidocs/register
2. Enter an email address you can receive mail at and submit.
3. Open the verification email, follow the link and set a password.
4. In `.env`:
   ```
   ONEMAP_EMAIL=you@example.com
   ONEMAP_PASSWORD=the password you just set
   ```
5. Check it: start the server (`pnpm --dir server dev`) and open http://localhost:8787/api/health. It should show `"onemap": "ok"`.

## 2. Geoapify Free (place search)

Geoapify lets hosts search for Singapore cafés and other venues outside Discover. Without a key, **Enter manually** and OneMap address lookup still work.

1. Sign up at [Geoapify MyProjects](https://myprojects.geoapify.com/) and choose **Free**. No credit card is required. Keep the account on Free; do not enable a paid subscription or automatic paid upgrades. [Current free-plan limits](https://www.geoapify.com/pricing/).
2. Create an **OpenJio** project and open **API Keys**. Copy its key into the project-root `.env`:
   ```env
   GEOAPIFY_API_KEY=your-key
   ```
   This is a server secret. Do not prefix it with `VITE_` or put it in client code.
3. Restart the server: `pnpm --dir server dev`.
4. Open [the local place-search status endpoint](http://localhost:8787/api/places/status). `"configured": true` confirms the key was loaded; this check makes no Geoapify call. In the app, open **Plan → Add a stop → Find a place** to test a real search.

The Free plan currently includes **3,000 credits per day**. OpenJio limits usage further:

- At most **1,000 uncached provider calls per UTC day** (resets at 8 am Singapore time). Reservations are saved before calling Geoapify, including failed calls. Exhaustion disables provider searches and leaves manual entry available.
- Successful searches are cached for **24 hours**, and place details for **6 hours**, up to **200 entries**. Repeated or concurrent identical requests reuse results. Errors are not cached; expired data is refreshed.
- Counters and normalized results live in `server/.cache/`. Retain that directory across restarts. It contains no API keys or raw provider responses. Do not delete the daily counter to bypass the limit.
- Run **one active server process per data directory**. This file counter is not a distributed quota system. Separate deployments and other apps/keys on the same Geoapify account share its free allowance, so their combined usage must stay within it. A dedicated project/key makes OpenJio usage easier to track but does not create a separate account allowance.

The same key also builds Discover's live **places catalogue**: OpenStreetMap cafés, restaurants, hawker centres, museums, parks, attractions and activity venues near each start area, kept only when they list opening hours (top 5 per category per area, about 170 places). It refreshes weekly and uses about 100 calls of the same daily allowance; `http://localhost:8787/api/places/catalogue/status` shows its state, and it is cached in `server/.cache/places-catalogue.json`.

Geoapify and OpenStreetMap attribution is included in the place picker. Preserve it when changing the UI. Some cafés may be missing and opening hours may be absent or outdated; the host can enter checked hours for the outing day. [Place-details documentation](https://apidocs.geoapify.com/docs/place-details/).

## 3. Gemini API key (listing extraction)

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key**. If asked, let it create a new Google Cloud project.
3. Copy the key into `.env`:
   ```
   GEMINI_API_KEY=your key
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```
   `gemini-2.5-flash-lite` is no longer offered to new keys and returns 404, so use the model above.
4. Check it: `pipeline/.venv/bin/python pipeline/run.py --limit 5` should report `gemini` extractions in its summary. The pipeline paces calls about 4.5 seconds apart and retries on rate limits, so a full run of about 90 posts takes roughly 7 minutes.
5. The free tier is enough. Google may use free-tier inputs to improve its products; the pipeline only sends public posts.

## 4. Telegram (channels without a public preview)

Use a dedicated Telegram account, not your personal one. Automated logins can get an account rate-limited or banned.

1. Sign in to https://my.telegram.org with the dedicated account's phone number. Telegram sends a code to the Telegram app.
2. Open **API development tools** and fill in the form (App title: `OpenJio pipeline`, Short name: `openjio`, Platform: Desktop).
3. Copy **App api_id** and **App api_hash** into `.env`:
   ```
   TELEGRAM_API_ID=1234567
   TELEGRAM_API_HASH=abcdef...
   ```
4. Create the session string (you type the phone number and login code yourself):
   ```bash
   python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt
   pipeline/.venv/bin/python pipeline/telegram_login.py
   ```
5. Paste the printed string into `.env` as `TELEGRAM_SESSION=...`. Treat it like a password: it grants full access to that account.

## 5. Scheduled ingestion (Telegram and confirmgood posts)

The API server can run the content pipeline on a timer and publish complete posts to Discover automatically. It needs the Gemini key (section 3) and, for locating outlets, OneMap (section 1).

1. Create the pipeline environment once:
   ```bash
   python -m venv pipeline/.venv
   ```
   then install `pipeline/requirements.txt` with that environment's pip (`pipeline/.venv/Scripts/pip` on Windows, `pipeline/.venv/bin/pip` elsewhere). The server uses this venv automatically; set `PIPELINE_PYTHON` only to point somewhere else.
2. In `.env`:
   ```
   INGEST_ENABLED=true
   INGEST_INTERVAL_HOURS=2
   ```
3. Restart the server. The first run starts a minute after start-up; `http://localhost:8787/api/ingest/status` shows progress and the last log lines. `POST /api/ingest/run` starts a run immediately.

Only new or edited posts are sent to Gemini. A first run of about 90 posts takes roughly 7 minutes; later runs are short. Complete posts appear in Discover marked "Auto-extracted · not reviewed"; the rest wait in Review with the reason they were held back.
