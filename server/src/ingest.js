// Scheduled ingestion: runs the Python pipeline, then marks drafts
// for auto-publish. Runs never overlap; the pipeline is killed after a timeout.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { singaporeParts } from './inputs.js';

const DEFAULT_INTERVAL_HOURS = 2;
const MAX_LOG_LINES = 40;
const RUN_TIMEOUT_MS = 20 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;
const DEFAULT_MIN_GAP_MS = 250;
const MAX_DISTANCE_KM = 3;
const SG_BOUNDS = { minLat: 1.13, maxLat: 1.48, minLng: 103.58, maxLng: 104.1 };

// Clamp INGEST_INTERVAL_HOURS to 1..6 hours; anything unparseable means the default.
export function parseIntervalHours(value) {
  const hours = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(hours)) return DEFAULT_INTERVAL_HOURS;
  return Math.min(6, Math.max(1, hours));
}

// Explicit PIPELINE_PYTHON wins, then the project venv, then whatever `python` is on PATH.
export function resolvePython({ repoRoot, env = process.env } = {}) {
  if (env.PIPELINE_PYTHON) return env.PIPELINE_PYTHON;
  const windows = path.join(repoRoot, 'pipeline', '.venv', 'Scripts', 'python.exe');
  const posix = path.join(repoRoot, 'pipeline', '.venv', 'bin', 'python');
  if (existsSync(windows)) return windows;
  if (existsSync(posix)) return posix;
  return 'python';
}

// Removes anything that looks like a credential before a log line is kept.
const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]'],
  [/\bsk-[0-9A-Za-z_-]{16,}/g, '[redacted]'],
  [/Bearer\s+\S+/gi, 'Bearer [redacted]'],
  [/((?:api[_-]?key|apikey|secret|token|password|passwd|key)\s*[=:]\s*)[^\s'",]+/gi, '$1[redacted]'],
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]'],
];
export function redact(line) {
  return SECRET_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(line));
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function singaporeDate(ms) {
  const parts = singaporeParts(new Date(ms));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isSingapore(place) {
  return Number.isFinite(place?.lat) && Number.isFinite(place?.lng)
    && place.lat >= SG_BOUNDS.minLat && place.lat <= SG_BOUNDS.maxLat
    && place.lng >= SG_BOUNDS.minLng && place.lng <= SG_BOUNDS.maxLng;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function nearestArea(place, areas) {
  let best = null;
  for (const area of areas) {
    const distanceKm = haversineKm(place.lat, place.lng, area.lat, area.lng);
    if (!best || distanceKm < best.distanceKm) best = { area, distanceKm };
  }
  return best;
}

// Reason a draft must stay out of the listing: wrong type, no title, or clearly ended.
// Missing details (dates, times, place, source) never block publication. Needs no lookups,
// so it is re-run on every pass.
function blockReason(draft, nowMs, today) {
  if (draft.type !== 'deal' && draft.type !== 'event') return 'Not a deal or event';
  if (!nonEmpty(draft.title)) return 'Missing title';
  if (draft.type === 'deal') {
    const to = draft.validity?.dateTo;
    if (isIsoDate(to) && to < today) return 'Deal has ended';
    return null;
  }
  const starts = Date.parse(draft.startsAt);
  const ends = Date.parse(draft.endsAt);
  if (Number.isFinite(starts) && Number.isFinite(ends) && ends < starts) return 'Event ends before it starts';
  if (Number.isFinite(ends) && ends <= nowMs) return 'Event has ended';
  return null;
}

// Fields the listing will show as unknown. Location is passed in because it comes from the lookup.
function missingFields(draft, located) {
  const missing = [];
  if (draft.type === 'deal') {
    if (!isIsoDate(draft.validity?.dateFrom) || !isIsoDate(draft.validity?.dateTo)) missing.push('dates');
    if (!Array.isArray(draft.validity?.timeWindows) || draft.validity.timeWindows.length === 0) missing.push('times');
  } else if (draft.type === 'event' && (!nonEmpty(draft.startsAt) || !nonEmpty(draft.endsAt))) {
    missing.push('dates');
  }
  if (!located) missing.push('location');
  if (!nonEmpty(draft.source?.url)) missing.push('source');
  return missing;
}

// A draft is located when a previous run found coordinates for it.
function isLocated(draft) {
  return draft.locationKnown !== false && Number.isFinite(draft.lat) && Number.isFinite(draft.lng);
}

function withBlock(draft, stamp, reason) {
  const next = { ...draft, ...stamp, autoPublish: false, autoReason: reason };
  delete next.missing;
  return next;
}

// Serialises lookups, spaces them by minGapMs, and caches results for the run.
function makeLookup(geocode, minGapMs) {
  const cache = new Map();
  let chain = Promise.resolve();
  let lastCallAt = 0;
  return query => {
    const key = query.toLowerCase();
    if (!cache.has(key)) {
      const job = chain.then(async () => {
        const wait = lastCallAt + minGapMs - Date.now();
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        lastCallAt = Date.now();
        return geocode(query);
      });
      chain = job.catch(() => {});
      cache.set(key, job);
    }
    return cache.get(key);
  };
}

// Returns { place: { area, lat, lng, address } } when located, or { note } saying why it is not.
async function locatePlace(draft, ctx) {
  if (!ctx.geocode) return { note: 'Address lookup unavailable' };

  const outlet = Array.isArray(draft.outlets) ? draft.outlets[0] : null;
  const queries = [outlet?.address, outlet?.name, draft.merchant]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  if (queries.length === 0) return { note: 'No place name or address to look up' };

  let lookupFailed = false;
  let place = null;
  for (const query of queries) {
    let results;
    try {
      results = await ctx.lookup(query);
    } catch {
      lookupFailed = true;
      continue;
    }
    const found = (Array.isArray(results) ? results : []).find(isSingapore);
    if (found) {
      place = { lat: found.lat, lng: found.lng, address: found.address || found.name || query };
      break;
    }
  }
  if (!place) return { note: lookupFailed ? 'Address lookup failed' : 'Place not found in Singapore' };

  const near = nearestArea(place, ctx.areas);
  if (!near || near.distanceKm > MAX_DISTANCE_KM) return { note: `Place is more than ${MAX_DISTANCE_KM} km from the listed areas` };
  return { place: { area: near.area.slug, lat: place.lat, lng: place.lng, address: place.address } };
}

// Pure apart from the injected geocode. Returns new draft objects (inputs are not mutated)
// in the same shape as the input (object keyed by id, or array).
export async function markAutoPublish(drafts, { geocode = null, areas = [], now = Date.now, minGapMs = DEFAULT_MIN_GAP_MS } = {}) {
  const nowMs = typeof now === 'function' ? now() : Number(now);
  const today = singaporeDate(nowMs);
  let geocodeCalls = 0;
  const countedGeocode = geocode ? query => { geocodeCalls++; return geocode(query); } : null;
  const ctx = { areas, geocode: countedGeocode, lookup: countedGeocode ? makeLookup(countedGeocode, minGapMs) : null };

  const isArray = Array.isArray(drafts);
  const out = isArray ? [] : {};
  const keys = isArray ? drafts.map((_, index) => index) : Object.keys(drafts);
  let changed = 0;
  let skipped = 0;

  for (const key of keys) {
    const draft = drafts[key];
    if (!draft || typeof draft !== 'object') { out[key] = draft; skipped++; continue; }

    if (draft.status === 'retired') {
      if (draft.autoPublish === false) { out[key] = draft; skipped++; continue; }
      out[key] = { ...draft, autoPublish: false };
      changed++;
      continue;
    }
    if (draft.status !== 'draft') { out[key] = draft; skipped++; continue; }

    const sourceEditedAt = draft.sourceEditedAt ?? null;
    const stamp = { autoCheckedAt: new Date(nowMs).toISOString(), autoCheckedSourceEditedAt: sourceEditedAt };
    const block = blockReason(draft, nowMs, today);

    // Already located and the source has not changed: no lookup. Only the clock (end dates) can change it.
    if (draft.autoPublish === true && draft.autoCheckedSourceEditedAt === sourceEditedAt && isLocated(draft)) {
      if (block) { out[key] = withBlock(draft, stamp, block); changed++; continue; }
      if (draft.locationKnown === true && Array.isArray(draft.missing)) { out[key] = draft; skipped++; continue; }
      // Verified before locationKnown and missing existed: fill them in without a lookup.
      out[key] = { ...draft, locationKnown: true, missing: missingFields(draft, true) };
      changed++;
      continue;
    }

    if (block) {
      out[key] = withBlock(draft, stamp, block);
      changed++;
      continue;
    }

    // Everything else is published, even with missing details or an unknown place.
    const located = await locatePlace(draft, ctx);
    const next = { ...draft, ...stamp, autoPublish: true };
    delete next.autoReason;
    if (located.place) {
      Object.assign(next, { locationKnown: true, ...located.place });
      delete next.autoNote;
    } else {
      Object.assign(next, { locationKnown: false, autoNote: located.note });
      delete next.area;
      delete next.lat;
      delete next.lng;
      delete next.address;
    }
    next.missing = missingFields(next, Boolean(located.place));
    out[key] = next;
    changed++;
  }

  const values = isArray ? out : Object.values(out);
  const published = values.filter(d => d && d.status === 'draft' && d.autoPublish === true).length;
  return { drafts: out, changed, skipped, published, geocodeCalls };
}

async function writeJsonAtomic(file, data) {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  try {
    await rename(temp, file);
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}

// Reads drafts.json, marks auto-publish, and writes back only when something changed.
export async function applyAutoPublish(draftsFile, options = {}) {
  let data;
  try {
    data = JSON.parse(await readFile(draftsFile, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { changed: 0, skipped: 0, published: 0, geocodeCalls: 0 };
    throw err;
  }
  const { drafts, ...summary } = await markAutoPublish(data, options);
  if (summary.changed > 0) await writeJsonAtomic(draftsFile, drafts);
  return summary;
}

// Counts for the status endpoint. A missing file counts as zero.
export async function countDrafts(draftsFile) {
  let data;
  try {
    data = JSON.parse(await readFile(draftsFile, 'utf8'));
  } catch {
    return { drafts: 0, autoPublished: 0 };
  }
  const values = Array.isArray(data) ? data : Object.values(data || {});
  return {
    drafts: values.length,
    autoPublished: values.filter(d => d && d.status === 'draft' && d.autoPublish === true).length,
  };
}

export function createIngestScheduler({
  intervalMs,
  python,
  runArgs = [],
  draftsFile,
  geocode = null,
  areas = [],
  now = () => Date.now(),
  spawnImpl = spawn,
  logger = console,
  cwd = process.cwd(),
  timeoutMs = RUN_TIMEOUT_MS,
  firstRunDelayMs = FIRST_RUN_DELAY_MS,
  minGapMs = DEFAULT_MIN_GAP_MS,
} = {}) {
  const state = {
    running: false,
    lastRunAt: null,
    lastFinishedAt: null,
    lastExitCode: null,
    lastError: null,
    autoPublish: null,
  };
  let logTail = [];
  let started = false;
  let timer = null;
  let nextRunAt = null;
  let activeChild = null;

  function pushLog(line) {
    const text = redact(line).trimEnd();
    if (!text.trim()) return;
    logTail.push(text);
    if (logTail.length > MAX_LOG_LINES) logTail = logTail.slice(-MAX_LOG_LINES);
  }

  // Splits a stream into lines for the log tail. Returns a flush for the last partial line.
  function collect(stream) {
    let buffer = '';
    stream?.on('data', chunk => {
      const lines = (buffer + String(chunk)).split(/\r?\n/);
      buffer = lines.pop();
      lines.forEach(pushLog);
    });
    return () => { if (buffer) pushLog(buffer); buffer = ''; };
  }

  function runPipeline() {
    return new Promise((resolve, reject) => {
      let proc;
      try {
        // A function is resolved per run, so a venv created after start-up is picked up.
        proc = spawnImpl(typeof python === 'function' ? python() : python, runArgs, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      } catch (err) {
        reject(new Error(`Could not start pipeline: ${err.message}`));
        return;
      }
      activeChild = proc;
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        if (activeChild === proc) activeChild = null;
        fn(value);
      };
      const killTimer = setTimeout(() => {
        // Settle first: kill() can emit 'close' synchronously, which would otherwise win.
        finish(reject, new Error(`Pipeline timed out after ${Math.round(timeoutMs / 60000)} minutes`));
        try { proc.kill(); } catch { /* already gone */ }
      }, timeoutMs);
      killTimer.unref?.();
      const flushOut = collect(proc.stdout);
      const flushErr = collect(proc.stderr);
      proc.once('error', err => finish(reject, new Error(`Could not start pipeline: ${err.message}`)));
      proc.once('close', code => {
        flushOut();
        flushErr();
        finish(resolve, code);
      });
    });
  }

  // Resolves to true when a run started, false when one is already running.
  async function runOnce() {
    if (state.running) return false;
    state.running = true;
    state.lastRunAt = new Date(now()).toISOString();
    state.lastExitCode = null;
    state.lastError = null;
    state.autoPublish = null;
    logTail = [];
    let error = null;
    try {
      const code = await runPipeline();
      state.lastExitCode = code;
      if (code !== 0) {
        error = `Pipeline exited with code ${code}; previous drafts were kept`;
      } else {
        try {
          state.autoPublish = await applyAutoPublish(draftsFile, { geocode, areas, now, minGapMs });
          pushLog(`auto-publish: ${state.autoPublish.published} live, ${state.autoPublish.changed} changed`);
        } catch (err) {
          error = `Auto-publish failed: ${err.message}`;
        }
      }
    } catch (err) {
      error = err.message;
    } finally {
      state.running = false;
      state.lastFinishedAt = new Date(now()).toISOString();
      state.lastError = error;
      if (error) logger?.error?.(`[ingest] ${redact(error)}`);
    }
    return true;
  }

  function scheduleNext(delay) {
    if (!started) return;
    clearTimeout(timer);
    nextRunAt = new Date(now() + delay).toISOString();
    timer = setTimeout(tick, delay);
    timer.unref?.();
  }

  async function tick() {
    timer = null;
    nextRunAt = null;
    if (!started) return;
    // A tick that lands during a run is skipped, not queued.
    if (!state.running) await runOnce();
    scheduleNext(intervalMs);
  }

  return {
    start() {
      started = true;
      scheduleNext(firstRunDelayMs);
    },
    stop() {
      started = false;
      clearTimeout(timer);
      timer = null;
      nextRunAt = null;
      if (activeChild) {
        try { activeChild.kill(); } catch { /* already gone */ }
        activeChild = null;
      }
    },
    // Starts a run now. Returns false when one is already running.
    runNow() {
      if (state.running) return false;
      runOnce().then(() => scheduleNext(intervalMs));
      return true;
    },
    isRunning() {
      return state.running;
    },
    status() {
      return {
        running: state.running,
        lastRunAt: state.lastRunAt,
        lastFinishedAt: state.lastFinishedAt,
        lastExitCode: state.lastExitCode,
        lastError: state.lastError,
        nextRunAt: started ? nextRunAt : null,
        lastAutoPublish: state.autoPublish,
        logTail: [...logTail],
      };
    },
  };
}
