// JSON file cache for route results. Written debounced, loaded once at start.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { singaporeParts } from './inputs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_FILE = process.env.ROUTE_CACHE_FILE || path.resolve(here, '../.cache/routes.json');
const WRITE_DELAY_MS = 500;
export const MAX_ENTRIES = 5000;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let entries = {};
let timer = null;
let dirty = false;

// Key: from|to|mode|SG minute. Coordinates are rounded to 4 decimal places.
// Minute precision matches the client cache, so each leg uses its own departure.
export function routeKey({ from, to, mode, depart }) {
  const fmt = (n) => Number(n).toFixed(4);
  const h = singaporeParts(depart);
  return `${fmt(from.lat)},${fmt(from.lng)}|${fmt(to.lat)},${fmt(to.lng)}|${mode}|${h.year}-${h.month}-${h.day}T${h.hour}:${h.minute}`;
}

// Drops expired entries, then the oldest ones beyond MAX_ENTRIES. Object keys
// keep insertion order, and setCached re-inserts, so the first keys are oldest.
function prune(now = Date.now()) {
  for (const [key, entry] of Object.entries(entries)) {
    if (!(now - entry.cachedAt < MAX_AGE_MS)) delete entries[key];
  }
  const keys = Object.keys(entries);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete entries[key];
}

export function loadCache() {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`cache: could not read ${CACHE_FILE}, starting empty (${err.message})`);
    }
    entries = {};
  }
  // Entries written before cachedAt existed start their age now.
  const now = Date.now();
  for (const entry of Object.values(entries)) {
    if (entry && typeof entry === 'object' && !Number.isFinite(entry.cachedAt)) entry.cachedAt = now;
  }
  prune(now);
  return entries;
}

export function getCached(key) {
  if (!Object.prototype.hasOwnProperty.call(entries, key)) return undefined;
  const { cachedAt, ...value } = entries[key];
  if (!(Date.now() - cachedAt < MAX_AGE_MS)) {
    delete entries[key];
    return undefined;
  }
  return value;
}

export function setCached(key, value) {
  delete entries[key];
  entries[key] = { ...value, cachedAt: Date.now() };
  prune();
  dirty = true;
  scheduleWrite();
}

// Test hook: replaces the in-memory entries and cancels any pending write.
export function resetCacheForTests(next = {}) {
  if (timer) clearTimeout(timer);
  timer = null;
  dirty = false;
  entries = next;
}

function scheduleWrite() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flushCache().catch((err) => console.warn(`cache: write failed (${err.message})`));
  }, WRITE_DELAY_MS);
  timer.unref();
}

export async function flushCache() {
  if (!dirty) return;
  dirty = false;
  try {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    const tmp = `${CACHE_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(entries, null, 2));
    await rename(tmp, CACHE_FILE);
  } catch (err) {
    dirty = true;
    throw err;
  }
}

// Synchronous flush for process exit.
export function flushCacheSync() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dirty) return;
  dirty = false;
  mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  const tmp = `${CACHE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(entries, null, 2));
  renameSync(tmp, CACHE_FILE);
}
