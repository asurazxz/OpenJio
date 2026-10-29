# Getting the credentials

All four are optional. Current status of each is tracked in [STATUS.md](./STATUS.md#3-integrations). Without them the app still runs end to end on sample data, estimated travel times and the manual availability grid. Add whichever you get to a file named `.env` in the project root (copy `.env.example`), then restart `pnpm dev` and the server.

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

## 2. Gemini API key (listing extraction)

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

## 3. Telegram (channels without a public preview)

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

## 4. Google OAuth client (calendar free/busy import)

1. Go to https://console.cloud.google.com and create a project (for example `OpenJio`).
2. **APIs & Services > Library**: search **Google Calendar API** and click **Enable**.
3. **APIs & Services > OAuth consent screen** (also called **Google Auth Platform**):
   - User type **External**, app name `OpenJio`, your email as support and developer contact.
   - **Data access / Scopes**: add `https://www.googleapis.com/auth/calendar.freebusy`.
   - **Audience / Test users**: add the Google account of every person who will try the import. Only these accounts can sign in while the app is in Testing mode.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type **Web application**.
   - Authorised JavaScript origins: `http://localhost:5173`
   - No redirect URI is needed.
5. Copy the **Client ID** (not the secret) into `.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   ```
6. The **Import from Google Calendar** button appears on the availability step once this is set.
