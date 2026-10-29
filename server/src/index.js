import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as onemap from './onemap.js';
import { loadCache, getCached, setCached, routeKey, flushCacheSync } from './cache.js';
import {
  InputError,
  parseLatLng,
  parseMode,
  parseDepart,
  parseGeocodeQuery,
} from './inputs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DRAFTS_FILE = path.resolve(here, '../../pipeline/out/drafts.json');
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
const PORT = Number(process.env.PORT) || 8787;

async function readDrafts() {
  try {
    return JSON.parse(await readFile(DRAFTS_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

const app = express();

app.use((req, res, next) => {
  const origin = req.get('Origin');
  res.setHeader('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());

app.get('/api/health', async (req, res) => {
  let onemapStatus;
  if (!onemap.isConfigured()) {
    onemapStatus = 'missing';
  } else {
    try {
      await onemap.getToken();
      onemapStatus = 'ok';
    } catch (err) {
      onemapStatus = err.code === 'onemap_missing' ? 'missing' : 'error';
    }
  }
  let drafts = 0;
  try {
    const list = await readDrafts();
    drafts = Array.isArray(list) ? list.length : 0;
  } catch {
    drafts = 0;
  }
  res.json({
    ok: true,
    onemap: onemapStatus,
    gemini: Boolean(process.env.GEMINI_API_KEY),
    drafts,
  });
});

app.get('/api/geocode', async (req, res) => {
  const q = parseGeocodeQuery(req.query.q);
  res.json(await onemap.search(q));
});

app.get('/api/route', async (req, res) => {
  const from = parseLatLng(req.query.from, 'from');
  const to = parseLatLng(req.query.to, 'to');
  const mode = parseMode(req.query.mode);
  const depart = parseDepart(req.query.depart);

  const key = routeKey({ from, to, mode, depart });
  const hit = getCached(key);
  if (hit) {
    res.json({ ...hit, cached: true });
    return;
  }

  const result = await onemap.route({ from, to, mode, depart });
  setCached(key, result);
  res.json({ ...result, cached: false });
});

app.get('/api/ingest/drafts', async (req, res) => {
  res.json(await readDrafts());
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Error handler: maps known failures to status codes, never leaks stack traces.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof InputError) {
    res.status(400).json({ error: 'bad_request', message: err.message });
    return;
  }
  if (err.code === 'onemap_missing') {
    res.status(503).json({ error: 'onemap_missing' });
    return;
  }
  if (err.code === 'onemap_error') {
    res.status(502).json({ error: 'onemap_error' });
    return;
  }
  if (err.status && err.status >= 400 && err.status < 500 && err.expose) {
    res.status(err.status).json({ error: 'bad_request', message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

loadCache();
const server = app.listen(PORT, () => {
  console.log(`OpenJio server listening on http://localhost:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    flushCacheSync();
    server.close();
    process.exit(0);
  });
}
