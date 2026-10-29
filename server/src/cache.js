// JSON file cache for route results. Written debounced, loaded once at start.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { singaporeParts } from './inputs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_FILE = path.resolve(here, '../.cache/routes.json');
const WRITE_DELAY_MS = 500;

let entries = {};
let timer = null;
let dirty = false;

// Key: from|to|mode|SG hour. Coordinates are rounded to 4 decimal places.
export function routeKey({ from, to, mode, depart }) {
  const fmt = (n) => Number(n).toFixed(4);
  const h = singaporeParts(depart);
  return `${fmt(from.lat)},${fmt(from.lng)}|${fmt(to.lat)},${fmt(to.lng)}|${mode}|${h.year}-${h.month}-${h.day}T${h.hour}`;
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
  return entries;
}

export function getCached(key) {
  return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : undefined;
}

export function setCached(key, value) {
  entries[key] = value;
  dirty = true;
  scheduleWrite();
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
