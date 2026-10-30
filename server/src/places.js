import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 1000;
const CACHE_MAX = 200;
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const DETAILS_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_FILE_MAX_BYTES = 1024 * 1024;
const MIN_REQUEST_INTERVAL_MS = 250;
const TIMEOUT_MS = 8000;
const SINGAPORE = { minLat: 1.13, maxLat: 1.48, minLng: 103.58, maxLng: 104.10 };
const DEFAULT_QUOTA_PATH = fileURLToPath(new URL('../.cache/geoapify-quota.json', import.meta.url));
const DEFAULT_CACHE_PATH = fileURLToPath(new URL('../.cache/geoapify-results.json', import.meta.url));
const cacheStates = new Map();
const quotaStates = new Map();
const inFlight = new Map();

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeText(value, max = 240) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

function safeWebsite(value) {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function inSingapore(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= SINGAPORE.minLat && lat <= SINGAPORE.maxLat && lng >= SINGAPORE.minLng && lng <= SINGAPORE.maxLng;
}

function normalizePlace(properties = {}, geometry) {
  const lat = Number(properties.lat ?? geometry?.coordinates?.[1]);
  const lng = Number(properties.lon ?? properties.lng ?? geometry?.coordinates?.[0]);
  const country = String(properties.country_code ?? properties.countrycode ?? '').toLowerCase();
  const countryName = String(properties.country ?? '').toLowerCase();
  if (!inSingapore(lat, lng) || (country ? country !== 'sg' : countryName !== 'singapore')) return null;
  const id = safeText(properties.place_id ?? properties.placeId ?? properties.id, 256);
  const name = safeText(properties.name ?? properties.address_line1, 160);
  if (!id || !name) return null;
  const address = safeText(properties.formatted ?? properties.address_line2 ?? properties.address, 320) ?? name;
  const normalized = { id, name, address, lat, lng };
  const website = safeWebsite(properties.website);
  if (website) normalized.website = website;
  const openingHoursText = safeText(properties.opening_hours, 500);
  if (openingHoursText) normalized.openingHoursText = openingHoursText;
  return normalized;
}

function hashed(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validCachedValue(key, value) {
  const validPlace = place => place && typeof place === 'object'
    && typeof place.id === 'string' && place.id.length > 0 && place.id.length <= 256
    && typeof place.name === 'string' && place.name.length > 0 && place.name.length <= 160
    && typeof place.address === 'string' && place.address.length > 0 && place.address.length <= 320
    && inSingapore(place.lat, place.lng);
  if (key.startsWith('search:')) return Array.isArray(value) && value.length <= 5 && value.every(place => validPlace(place) && !('website' in place) && !('attribution' in place));
  if (key.startsWith('details:')) {
    if (!validPlace(value) || value.attribution !== 'Powered by Geoapify | © OpenStreetMap contributors') return false;
    if (value.website !== undefined && safeWebsite(value.website) !== value.website) return false;
    return value.openingHoursText === undefined || (typeof value.openingHoursText === 'string' && value.openingHoursText.length <= 500);
  }
  return false;
}

function getCacheState(file) {
  let state = cacheStates.get(file);
  if (!state) {
    state = { entries: new Map(), loaded: false, loading: null, writes: Promise.resolve() };
    cacheStates.set(file, state);
  }
  return state;
}

function getQuotaState(file, limit) {
  let state = quotaStates.get(file);
  if (!state) {
    state = { queue: Promise.resolve(), requestQueue: Promise.resolve(), lastRequestAt: 0, unavailable: false, limit };
    quotaStates.set(file, state);
  } else {
    // Adapters sharing one ledger must honor the most restrictive configured cap.
    state.limit = Math.min(state.limit, limit);
  }
  return state;
}

async function loadCache(state, file) {
  if (state.loaded) return;
  if (!state.loading) {
    state.loading = (async () => {
      try {
        const raw = await readFile(file);
        if (raw.byteLength > CACHE_FILE_MAX_BYTES) throw new Error('Cache file is too large');
        const saved = JSON.parse(raw.toString('utf8'));
        if (saved?.version !== 1 || !Array.isArray(saved.entries)) throw new Error('Invalid cache');
        const now = Date.now();
        for (const entry of saved.entries.slice(-CACHE_MAX)) {
          if (typeof entry?.key !== 'string' || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now || !validCachedValue(entry.key, entry.value)) continue;
          state.entries.set(entry.key, { value: entry.value, expiresAt: entry.expiresAt });
        }
      } catch {
        // A cache is an optimization. Missing, corrupt, or unreadable cache data
        // must not stop a provider request.
      }
      state.loaded = true;
    })();
  }
  await state.loading;
}

function cacheGet(state, key) {
  const entry = state.entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    state.entries.delete(key);
    return undefined;
  }
  state.entries.delete(key);
  state.entries.set(key, entry);
  return entry.value;
}

async function cacheSet(state, file, key, value, ttl) {
  if (!validCachedValue(key, value)) return;
  state.entries.delete(key);
  state.entries.set(key, { value, expiresAt: Date.now() + ttl });
  while (state.entries.size > CACHE_MAX) state.entries.delete(state.entries.keys().next().value);
  state.writes = state.writes.then(async () => {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      const snapshot = JSON.stringify({ version: 1, entries: [...state.entries].map(([entryKey, entry]) => ({ key: entryKey, ...entry })) });
      const temp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      try {
        const handle = await open(temp, 'wx', 0o600);
        try { await handle.writeFile(snapshot); await handle.sync(); } finally { await handle.close(); }
        await rename(temp, file);
      } catch {
        await unlink(temp).catch(() => {});
      }
    } catch {
      // Persistence failure is deliberately non-fatal; keep the in-memory hit.
    }
  }).catch(() => {});
  await state.writes;
}

function deduplicate(key, operation) {
  if (!inFlight.has(key)) {
    const promise = Promise.resolve().then(operation).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }
  return inFlight.get(key);
}

export function createPlaceSearch({
  apiKey = process.env.GEOAPIFY_API_KEY,
  fetchImpl = fetch,
  quotaPath = DEFAULT_QUOTA_PATH,
  cachePath = DEFAULT_CACHE_PATH,
  dailyLimit = DEFAULT_LIMIT,
} = {}) {
  const limit = Math.min(MAX_LIMIT, Math.max(0, Number.isFinite(Number(dailyLimit)) ? Math.floor(Number(dailyLimit)) : DEFAULT_LIMIT));
  const absoluteCachePath = path.resolve(cachePath);
  const absoluteQuotaPath = path.resolve(quotaPath);
  const cache = getCacheState(absoluteCachePath);
  const quota = getQuotaState(absoluteQuotaPath, limit);

  async function reserveCredit() {
    let release;
    const previous = quota.queue;
    quota.queue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      if (quota.unavailable) throw fail('places_limit', 'Place search is temporarily unavailable. Please try again later.');
      const today = new Date().toISOString().slice(0, 10);
      const file = absoluteQuotaPath;
      await mkdir(path.dirname(file), { recursive: true });
      let ledger;
      try {
        ledger = JSON.parse(await readFile(file, 'utf8'));
        if (!ledger || typeof ledger !== 'object' || !Number.isInteger(ledger.used) || ledger.used < 0 || typeof ledger.day !== 'string') throw new Error('Invalid quota ledger');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          quota.unavailable = true;
          throw fail('places_limit', 'Place search is temporarily unavailable because its daily usage record cannot be read.');
        }
        ledger = { day: today, used: 0 };
      }
      if (ledger.day !== today) ledger = { day: today, used: 0 };
      if (ledger.used >= quota.limit) throw fail('places_limit', 'Today’s place search limit has been reached. Please try again tomorrow.');
      ledger.used += 1;
      const temp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      try {
        const handle = await open(temp, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(ledger)); await handle.sync(); } finally { await handle.close(); }
        await rename(temp, file);
      } catch {
        await unlink(temp).catch(() => {});
        quota.unavailable = true;
        throw fail('places_limit', 'Place search is temporarily unavailable because its daily usage record cannot be saved.');
      }
    } finally {
      release();
    }
  }

  async function paceRequest() {
    let release;
    const previous = quota.requestQueue;
    quota.requestQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const wait = Math.max(0, quota.lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      quota.lastRequestAt = Date.now();
    } finally { release(); }
  }

  async function getJson(url) {
    await reserveCredit();
    await paceRequest();
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw fail('places_error', 'Place search is temporarily unavailable. Please try again.');
      return await response.json();
    } catch (error) {
      if (error?.code === 'places_limit' || error?.code === 'places_error') throw error;
      throw fail('places_error', 'Place search is temporarily unavailable. Please try again.');
    }
  }

  function endpoint(pathname, params) {
    const url = new URL(`https://api.geoapify.com${pathname}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('apiKey', apiKey);
    return url;
  }

  return {
    status() {
      return { configured: Boolean(typeof apiKey === 'string' && apiKey.trim()), provider: 'geoapify', dailyLimit: quota.limit };
    },
    async search(query) {
      const q = typeof query === 'string' ? query.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100) : '';
      if (!q) return [];
      if (!apiKey) throw fail('places_missing', 'Place search is not configured. You can still enter the place manually.');
      const key = `search:${hashed(q.toLocaleLowerCase())}`;
      await loadCache(cache, absoluteCachePath);
      const hit = cacheGet(cache, key);
      if (hit) return hit.map(place => ({ ...place }));
      const operationKey = `${absoluteCachePath}|${hashed(String(apiKey))}|${key}`;
      const places = await deduplicate(operationKey, async () => {
        const secondHit = cacheGet(cache, key);
        if (secondHit) return secondHit;
        const url = endpoint('/v1/geocode/autocomplete', { text: q, type: 'amenity', filter: 'countrycode:sg', limit: '5', format: 'json' });
        const data = await getJson(url);
        const rows = Array.isArray(data?.results) ? data.results : (Array.isArray(data?.features) ? data.features.map(feature => ({ ...feature.properties, geometry: feature.geometry })) : null);
        if (!rows) throw fail('places_error', 'Place search returned an unexpected response. Please try again.');
        const normalized = rows.map(row => normalizePlace(row, row.geometry)).filter(Boolean).slice(0, 5).map(({ id, name, address, lat, lng }) => ({ id, name, address, lat, lng }));
        await cacheSet(cache, absoluteCachePath, key, normalized, SEARCH_TTL_MS);
        return normalized;
      });
      return places.map(place => ({ ...place }));
    },
    async details(placeId) {
      const id = typeof placeId === 'string' ? placeId.trim() : '';
      if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id)) throw fail('places_error', 'Choose a valid place from search results.');
      if (!apiKey) throw fail('places_missing', 'Place search is not configured. You can still enter the place manually.');
      const key = `details:${hashed(id)}`;
      await loadCache(cache, absoluteCachePath);
      const hit = cacheGet(cache, key);
      if (hit) return { ...hit };
      const operationKey = `${absoluteCachePath}|${hashed(String(apiKey))}|${key}`;
      const place = await deduplicate(operationKey, async () => {
        const secondHit = cacheGet(cache, key);
        if (secondHit) return secondHit;
        const url = endpoint('/v2/place-details', { id, features: 'details' });
        const data = await getJson(url);
        const feature = Array.isArray(data?.features) ? data.features.find(item => item?.properties?.feature_type === 'details') : null;
        if (!feature?.properties) throw fail('places_error', 'Place details are unavailable. Please try again.');
        const normalized = normalizePlace(feature.properties, feature.geometry);
        if (!normalized) throw fail('places_error', 'Place details are unavailable outside Singapore or are incomplete.');
        normalized.attribution = 'Powered by Geoapify | © OpenStreetMap contributors';
        await cacheSet(cache, absoluteCachePath, key, normalized, DETAILS_TTL_MS);
        return normalized;
      });
      return { ...place };
    },
  };
}
