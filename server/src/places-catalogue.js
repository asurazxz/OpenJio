// Live places catalogue built from OpenStreetMap data served through Geoapify.
// Every failure here is non-fatal: a broken refresh keeps the last good data.
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AREAS as SEED_AREAS } from '../../client/src/data/seed-listings.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 7 * DAY_MS;
const RETAIN_UNSEEN_MS = 30 * DAY_MS;
const FIRST_CHECK_MS = 1000;
const SECOND_CHECK_MS = 2 * 60 * 1000;
const CHECK_EVERY_MS = DAY_MS;
const RADIUS_M = 1500;
const CALL_LIMIT = 60;
const PER_GROUP_CAP = 5;
const PACE_MS = 300;
const TIMEOUT_MS = 8000;
const DAILY_LIMIT = 1000;
const MAX_OPENING_TEXT = 500;
const SINGAPORE = { minLat: 1.13, maxLat: 1.48, minLng: 103.58, maxLng: 104.10 };
const CATALOGUE_FILE = fileURLToPath(new URL('../.cache/places-catalogue.json', import.meta.url));
const QUOTA_FILE = fileURLToPath(new URL('../.cache/geoapify-quota.json', import.meta.url));

// Order matters: a place found by several groups keeps the first group listed here.
const GROUPS = [
  { key: 'cafes', categories: ['catering.cafe'], kind: 'meal', interests: ['cafes', 'food'], durationMins: 60, label: 'Cafe' },
  { key: 'hawker', categories: ['catering.food_court'], kind: 'meal', interests: ['food'], durationMins: 60, label: 'Hawker centre' },
  { key: 'restaurants', categories: ['catering.restaurant'], kind: 'meal', interests: ['food'], durationMins: 75, label: 'Restaurant' },
  { key: 'museums', categories: ['entertainment.museum', 'entertainment.culture.gallery'], kind: 'activity', interests: ['arts'], durationMins: 90, label: 'Museum or gallery' },
  { key: 'parks', categories: ['leisure.park', 'leisure.park.garden'], kind: 'activity', interests: ['outdoors'], durationMins: 60, label: 'Park or garden' },
  { key: 'attractions', categories: ['tourism.attraction', 'tourism.sights'], kind: 'activity', interests: null, durationMins: 75, label: 'Attraction' },
  { key: 'activities', categories: ['entertainment.bowling_alley', 'entertainment.escape_game', 'entertainment.amusement_arcade', 'entertainment.miniature_golf'], kind: 'activity', interests: ['games'], durationMins: 90, label: 'Activity venue' },
];

const DAY_CODES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_ITEM = '(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?';
const DAY_PREFIX = new RegExp(`^(${DAY_ITEM}(?:\\s*,\\s*${DAY_ITEM})*)(?=\\s|$)`);
const TIME_RANGE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

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

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function distanceKm(a, b) {
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestArea(point, areas) {
  let best = null;
  let bestDistance = Infinity;
  for (const area of areas) {
    const distance = distanceKm(point, area);
    if (distance < bestDistance) {
      best = area;
      bestDistance = distance;
    }
  }
  return best;
}

function clock(hour, minute) {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || !Number.isInteger(m) || m > 59 || h > 24) return null;
  if (h === 24) return m === 0 ? '23:59' : null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimes(text) {
  if (/^(off|closed)$/i.test(text)) return [];
  if (text === '24/7') return [['00:00', '23:59']];
  const ranges = [];
  for (const part of text.split(',')) {
    const match = TIME_RANGE.exec(part.trim());
    if (!match) return null;
    const start = clock(match[1], match[2]);
    const end = clock(match[3], match[4]);
    if (!start || !end) return null;
    // A range past midnight keeps the evening part only.
    const clipped = end < start ? '23:59' : end;
    if (clipped <= start) return null;
    ranges.push([start, clipped]);
  }
  return ranges;
}

function dayIndexes(selector) {
  const days = new Set();
  for (const item of selector.split(',').map(part => part.trim())) {
    const [from, to = from] = item.split('-');
    let index = DAY_CODES.indexOf(from);
    const end = DAY_CODES.indexOf(to);
    if (index < 0 || end < 0) return null;
    days.add(index);
    while (index !== end) {
      index = (index + 1) % 7;
      days.add(index);
    }
  }
  return days;
}

// Parses the common subset of OSM opening_hours. Returns { mon: [[start, end]], ... }
// where [] means closed and a missing day means unknown, or null when unparseable.
export function parseOpeningHours(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_OPENING_TEXT) return null;
  const text = raw.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const days = {};
  for (const piece of text.split(';')) {
    const rule = piece.trim();
    // Public and school holiday rules are ignored; the weekday rules still apply.
    if (!rule || /^(PH|SH)\b/.test(rule)) continue;
    const prefix = DAY_PREFIX.exec(rule);
    let selected = new Set(DAY_KEYS.map((_, index) => index));
    let timePart = rule;
    if (prefix) {
      selected = dayIndexes(prefix[1]);
      if (!selected) return null;
      timePart = rule.slice(prefix[0].length).trim();
    }
    timePart = timePart.replace(/\s+open$/i, '').trim();
    const ranges = parseTimes(timePart);
    if (!ranges) return null;
    // Later rules override earlier ones for the same day, as in OSM.
    for (const index of selected) days[DAY_KEYS[index]] = ranges;
  }
  const ordered = {};
  for (const key of DAY_KEYS) if (days[key]) ordered[key] = days[key].map(range => [...range]);
  return Object.keys(ordered).length ? ordered : null;
}

function osmLink(raw) {
  const kinds = new Set(['node', 'way', 'relation']);
  const id = Number(raw.osm_id);
  if (!kinds.has(raw.osm_type) || !Number.isInteger(id) || id <= 0) return '';
  return `https://www.openstreetmap.org/${raw.osm_type}/${id}`;
}

function candidateFrom(feature, group) {
  const p = feature?.properties;
  if (!p || typeof p !== 'object') return null;
  const raw = p.datasource?.raw && typeof p.datasource.raw === 'object' ? p.datasource.raw : {};
  const lat = Number(p.lat ?? feature.geometry?.coordinates?.[1]);
  const lng = Number(p.lon ?? p.lng ?? feature.geometry?.coordinates?.[0]);
  if (!inSingapore(lat, lng)) return null;
  const id = typeof p.place_id === 'string' && /^[\w.:-]{1,256}$/.test(p.place_id) ? p.place_id : null;
  // Prefer the English name OSM records for local-script names (temples, eateries).
  const name = safeText(p.name_international?.en ?? raw['name:en'] ?? p.name, 160);
  if (!id || !name) return null;
  // Generic chains are noise, but a branded attraction can still be a real destination.
  if (group.key !== 'attractions' && (p.brand || raw.brand)) return null;
  if (typeof p.opening_hours !== 'string') return null;
  const openingHours = parseOpeningHours(p.opening_hours);
  if (!openingHours) return null;
  return {
    id,
    name,
    lat,
    lng,
    group,
    openingHours,
    openingText: safeText(p.opening_hours, MAX_OPENING_TEXT),
    address: safeText(p.formatted ?? p.address_line2, 320) || '',
    website: safeWebsite(p.website ?? raw.website),
    categories: Array.isArray(p.categories) ? p.categories.filter(category => typeof category === 'string') : [],
    notable: Boolean(raw.wikidata || raw.wikipedia),
    osmUrl: osmLink(raw),
  };
}

function scoreOf(candidate, area) {
  let score = 0;
  if (candidate.website) score += 2;
  if (candidate.notable) score += 2;
  if (candidate.categories.some(category => category.startsWith('tourism.'))) score += 1;
  if (candidate.address) score += 1;
  // Up to one point off for distance; the area centre is the reference.
  score -= Math.min(1, distanceKm(candidate, area) / 1.5);
  return score;
}

function attractionInterests(candidate) {
  const outdoorsy = candidate.categories.some(category => category.startsWith('leisure.park') || category.startsWith('natural'))
    || /\b(park|gardens?|beach|reserve|trail|nature|waterfront|hill|island)\b/i.test(candidate.name);
  return outdoorsy ? ['outdoors'] : ['arts'];
}

function listingFrom(candidate, area, nowMs) {
  const { group } = candidate;
  const listing = {
    id: `osm-${candidate.id}`,
    type: 'place',
    kind: group.kind,
    title: candidate.name,
    summary: `${group.label} near ${area.label}.`,
    interests: group.interests ?? attractionInterests(candidate),
    area: area.slug,
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    durationMins: group.durationMins,
    durationDefault: true,
    priceLevel: null,
    priceText: null,
    openingHours: candidate.openingHours,
    openingHoursText: candidate.openingText,
    status: 'published',
    routeReady: true,
    reviewStatus: 'route-ready',
    source: {
      kind: 'osm',
      name: 'OpenStreetMap via Geoapify',
      url: candidate.osmUrl || candidate.website || '',
      retrievedAt: new Date(nowMs).toISOString(),
    },
  };
  if (candidate.website) listing.website = candidate.website;
  return listing;
}

// Ranks candidates per (nearest area, category group) and keeps the top few.
function selectPlaces(candidates, areas, nowMs) {
  const buckets = new Map();
  for (const candidate of candidates) {
    const area = nearestArea(candidate, areas);
    if (!area) continue;
    const bucketKey = `${area.slug}|${candidate.group.key}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push({ candidate, area, score: scoreOf(candidate, area) });
  }
  const output = [];
  for (const rows of buckets.values()) {
    rows.sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name) || a.candidate.id.localeCompare(b.candidate.id));
    for (const row of rows.slice(0, PER_GROUP_CAP)) output.push(listingFrom(row.candidate, row.area, nowMs));
  }
  return output;
}

function freezePlace(place) {
  Object.freeze(place.openingHours);
  return Object.freeze(place);
}

function validStoredPlace(place) {
  return Boolean(place) && typeof place.id === 'string' && place.id.startsWith('osm-') && place.type === 'place'
    && Boolean(place.openingHours) && typeof place.openingHours === 'object' && inSingapore(place.lat, place.lng);
}

async function writeAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

// Charges one call against the daily Geoapify ledger. The ledger format and
// location match places.js, so both paths count toward the same 1,000/day cap.
export function createQuotaReserve({ file = QUOTA_FILE, limit = DAILY_LIMIT, clock: today = () => new Date() } = {}) {
  let queue = Promise.resolve();
  const charge = async () => {
    const day = today().toISOString().slice(0, 10);
    await mkdir(path.dirname(file), { recursive: true });
    let ledger;
    try {
      ledger = JSON.parse(await readFile(file, 'utf8'));
      if (!ledger || typeof ledger !== 'object' || !Number.isInteger(ledger.used) || ledger.used < 0 || typeof ledger.day !== 'string') throw new Error('Invalid quota ledger');
    } catch (error) {
      if (error.code !== 'ENOENT') throw fail('places_limit', 'Place data is paused because its daily usage record cannot be read.');
      ledger = { day, used: 0 };
    }
    if (ledger.day !== day) ledger = { day, used: 0 };
    if (ledger.used >= limit) throw fail('places_limit', 'Today’s place data limit has been reached. The existing catalogue is kept.');
    ledger.used += 1;
    try {
      await writeAtomic(file, JSON.stringify(ledger));
    } catch {
      throw fail('places_limit', 'Place data is paused because its daily usage record cannot be saved.');
    }
  };
  return function reserve() {
    const result = queue.then(charge);
    queue = result.catch(() => {});
    return result;
  };
}

export function createPlacesCatalogue({
  apiKey = process.env.GEOAPIFY_API_KEY,
  fetchImpl = fetch,
  file = CATALOGUE_FILE,
  areas = SEED_AREAS,
  now = Date.now,
  reserve,
  logger = console,
  paceMs = PACE_MS,
} = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const usableAreas = (Array.isArray(areas) ? areas : [])
    .filter(area => area && typeof area.slug === 'string' && typeof area.label === 'string' && Number.isFinite(area.lat) && Number.isFinite(area.lng));
  const reserveCharge = typeof reserve === 'function' ? reserve : createQuotaReserve();
  let places = [];
  let lastSeen = {};
  let refreshedAt = null;
  let refreshing = null;
  let lastError = null;
  let started = false;
  let lastFetchAt = 0;
  let interval = null;
  const timers = new Set();

  async function load() {
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (saved?.version !== 1 || !Array.isArray(saved.places)) throw new Error('Unrecognised catalogue file');
      places = saved.places.filter(validStoredPlace).map(freezePlace);
      refreshedAt = validIso(saved.refreshedAt) ? saved.refreshedAt : null;
      lastSeen = {};
      const seen = saved.lastSeen && typeof saved.lastSeen === 'object' ? saved.lastSeen : {};
      for (const [id, value] of Object.entries(seen)) if (validIso(value)) lastSeen[id] = value;
    } catch (error) {
      if (error?.code !== 'ENOENT') logger.warn?.(`Places catalogue file ignored: ${error?.message}`);
    }
  }

  // Loading never rejects. Without a key the catalogue stays empty.
  const loaded = key ? load() : Promise.resolve();

  function status() {
    return {
      count: key ? places.length : 0,
      refreshedAt,
      refreshing: Boolean(refreshing),
      lastError,
    };
  }

  function isStale() {
    return !refreshedAt || now() - Date.parse(refreshedAt) >= REFRESH_AFTER_MS;
  }

  async function pace() {
    const wait = lastFetchAt + paceMs - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastFetchAt = Date.now();
  }

  async function fetchGroup(area, group) {
    const url = `https://api.geoapify.com/v2/places?categories=${group.categories.join(',')}`
      + `&filter=circle:${area.lng},${area.lat},${RADIUS_M}&conditions=named&limit=${CALL_LIMIT}`
      + `&apiKey=${encodeURIComponent(key)}`;
    let response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw fail('places_error', 'Geoapify request failed.');
    }
    if (!response?.ok) throw fail('places_error', `Geoapify returned HTTP ${response?.status ?? 'error'}.`);
    let data;
    try {
      data = await response.json();
    } catch {
      throw fail('places_error', 'Geoapify returned an unreadable response.');
    }
    if (!Array.isArray(data?.features)) throw fail('places_error', 'Geoapify returned an unexpected response.');
    return data.features;
  }

  // Throws places_limit as soon as the shared quota refuses a charge, so the
  // caller can keep the existing catalogue untouched.
  async function collect() {
    const found = new Map();
    let succeeded = 0;
    let failed = 0;
    for (const area of usableAreas) {
      for (const group of GROUPS) {
        await reserveCharge();
        await pace();
        let features;
        try {
          features = await fetchGroup(area, group);
        } catch (error) {
          failed += 1;
          logger.warn?.(`Places catalogue: ${area.slug} ${group.key} skipped (${error.message})`);
          continue;
        }
        succeeded += 1;
        for (const feature of features) {
          const candidate = candidateFrom(feature, group);
          if (!candidate) continue;
          const previous = found.get(candidate.id);
          if (!previous || GROUPS.indexOf(group) < GROUPS.indexOf(previous.group)) found.set(candidate.id, candidate);
        }
      }
    }
    return { found: [...found.values()], succeeded, failed };
  }

  async function persist() {
    await writeAtomic(file, JSON.stringify({ version: 1, refreshedAt, places, lastSeen }));
  }

  async function commit(found, nowMs, failed) {
    const nowIso = new Date(nowMs).toISOString();
    const fresh = selectPlaces(found, usableAreas, nowMs);
    const freshIds = new Set(fresh.map(place => place.id));
    const nextSeen = {};
    const kept = [];
    const fallbackSeen = refreshedAt ?? nowIso;
    // Places missed by this refresh stay for 30 days after they were last seen.
    for (const place of places) {
      if (freshIds.has(place.id)) continue;
      const seenAt = lastSeen[place.id] ?? fallbackSeen;
      if (nowMs - Date.parse(seenAt) <= RETAIN_UNSEEN_MS) {
        kept.push(place);
        nextSeen[place.id] = seenAt;
      }
    }
    for (const place of fresh) nextSeen[place.id] = nowIso;
    places = [...fresh, ...kept].sort((a, b) => a.id.localeCompare(b.id)).map(freezePlace);
    lastSeen = nextSeen;
    refreshedAt = nowIso;
    lastError = failed ? 'Some categories could not be refreshed. Earlier places are kept.' : null;
    try {
      await persist();
    } catch (error) {
      logger.warn?.(`Places catalogue not saved: ${error.message}`);
    }
  }

  function refresh() {
    if (!key) return Promise.resolve();
    if (!refreshing) {
      refreshing = (async () => {
        lastError = null;
        try {
          const nowMs = now();
          const { found, succeeded, failed } = await collect();
          if (!succeeded) throw new Error('No place category request succeeded.');
          await commit(found, nowMs, failed);
        } catch (error) {
          lastError = error?.code === 'places_limit' ? error.message : 'Catalogue refresh failed. The existing catalogue is kept.';
          logger.warn?.(`Places catalogue refresh stopped: ${error?.message}`);
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  function schedule(fn, ms) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timer.unref?.();
    timers.add(timer);
  }

  function start() {
    if (!key || started) return;
    started = true;
    const check = () => {
      loaded.then(() => (isStale() ? refresh() : undefined)).catch(error => logger.warn?.(`Places catalogue check failed: ${error?.message}`));
    };
    schedule(check, FIRST_CHECK_MS);
    schedule(check, SECOND_CHECK_MS);
    interval = setInterval(check, CHECK_EVERY_MS);
    interval.unref?.();
  }

  function stop() {
    started = false;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    if (interval) clearInterval(interval);
    interval = null;
  }

  return {
    list() {
      return key ? places : [];
    },
    status,
    refresh,
    start,
    stop,
    ready() {
      return loaded;
    },
  };
}
