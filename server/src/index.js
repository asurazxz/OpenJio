import express from 'express';
import { createSupabaseRepository } from './supabase.js';
import { createHostedService } from './hosted.js';
import { createPlanningTravel } from './planning-travel.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as onemap from './onemap.js';
import { createPlaceSearch } from './places.js';
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
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);
const sharedMode = process.env.DATA_MODE === 'supabase';
const repository = createSupabaseRepository({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
const hosted = createHostedService({ repository, verifyToken: token => repository.verifyToken(token), readDrafts, travel: createPlanningTravel });
const PORT = Number(process.env.PORT) || 8787;
const places = createPlaceSearch();

// The pipeline stores drafts keyed by id; the domain engine expects a list.
async function readDrafts() {
  try {
    const data = JSON.parse(await readFile(DRAFTS_FILE, 'utf8'));
    return Array.isArray(data) ? data : Object.values(data || {});
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// In shared mode, provider-backed endpoints spend team quota, so they need a
// signed-in caller. Demo mode stays open for local development.
function requireSignIn(message) {
  return async (req, res, next) => {
    if (!sharedMode) return next();
    const authorization = req.get('Authorization') || '';
    if (!/^Bearer [^\s]+$/.test(authorization) || !await repository.verifyToken(authorization.slice(7))) {
      return res.status(401).json({ error: 'auth', message });
    }
    next();
  };
}

// Fixed one-minute window per client IP. Buckets are pruned as they expire.
function limitPerMinute(max, error, message) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now(), ip = req.ip;
    for (const [key, value] of buckets) if (now >= value.resetAt) buckets.delete(key);
    const bucket = buckets.get(ip) || { count: 0, resetAt: now + 60000 };
    if (bucket.count >= max || (buckets.size >= 1000 && !buckets.has(ip))) return res.status(429).json({ error, message });
    bucket.count++; buckets.set(ip, bucket);
    next();
  };
}

const app = express();
// Behind a hosting proxy, req.ip is the proxy unless the hop count is trusted.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY === 'true');
}

app.use((req, res, next) => {
  const origin = req.get('Origin');
  res.setHeader('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '256kb' }));

app.post('/api/app/:operation', async (req, res) => {
  const authorization = req.get('Authorization');
  if (authorization && !/^Bearer [^\s]+$/.test(authorization)) return res.status(401).json({ error: 'auth', message: 'Please sign in again.' });
  const result = await hosted.execute({ token: authorization?.slice(7), operation: req.params.operation, args: req.body?.args });
  res.json({ result });
});

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
    geoapify: places.status().configured,
    drafts,
  });
});

app.get('/api/places/status', (req, res) => res.json(places.status()));
app.use('/api/places',
  requireSignIn('Please sign in to search for places.'),
  limitPerMinute(30, 'places_limit', 'Too many place searches. Please wait a minute or enter the place manually.'));
app.get('/api/places/search', async (req, res) => res.json(await places.search(req.query.q)));
app.get('/api/places/details', async (req, res) => res.json(await places.details(req.query.id)));

app.get('/api/geocode',
  requireSignIn('Please sign in to look up addresses.'),
  limitPerMinute(30, 'geocode_limit', 'Too many address lookups. Please wait a minute.'),
  async (req, res) => {
  const q = parseGeocodeQuery(req.query.q);
  res.json(await onemap.search(q));
});

// One plan can request a leg per stop pair, so this allows more than geocoding.
app.get('/api/route',
  requireSignIn('Please sign in to check travel times.'),
  limitPerMinute(120, 'route_limit', 'Too many travel lookups. Please wait a minute.'),
  async (req, res) => {
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
  if (sharedMode) {
    const authorization = req.get('Authorization') || '';
    if (!/^Bearer [^\s]+$/.test(authorization)) return res.status(401).json({ error: 'auth' });
    const result = await hosted.execute({ token: authorization.slice(7), operation: 'listDrafts', args: [] });
    res.json(result.drafts);
    return;
  }
  res.json(await readDrafts());
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Error handler: maps known failures to status codes, never leaks stack traces.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const domainStatus = { auth:401, forbidden:403, invalid:400, not_found:404, closed:409, full:409, conflict:409, configuration:503, unavailable:503 };
  if (domainStatus[err.code]) {
    res.status(domainStatus[err.code]).json({ error: err.code, message: err.message });
    return;
  }
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
  if (['places_missing', 'places_limit', 'places_error'].includes(err.code)) {
    res.status(err.code === 'places_limit' ? 429 : err.code === 'places_missing' ? 503 : 502).json({ error: err.code, message: err.message });
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
