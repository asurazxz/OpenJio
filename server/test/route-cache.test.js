import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

// Never let a test write into the real route cache.
process.env.ROUTE_CACHE_FILE = path.join(os.tmpdir(), `openjio-route-cache-${process.pid}.json`);
const { getCached, setCached, resetCacheForTests, MAX_ENTRIES, MAX_AGE_MS } = await import('../src/cache.js');

test('cached routes expire after the maximum age', () => {
  resetCacheForTests({ old: { durationMins: 12, cachedAt: Date.now() - MAX_AGE_MS - 1 } });
  assert.equal(getCached('old'), undefined);
});

test('cached values are returned without bookkeeping fields', () => {
  resetCacheForTests();
  setCached('fresh', { durationMins: 9, mode: 'walk', source: 'onemap' });
  assert.deepEqual(getCached('fresh'), { durationMins: 9, mode: 'walk', source: 'onemap' });
});

test('the cache keeps only the newest entries', () => {
  resetCacheForTests();
  for (let i = 0; i <= MAX_ENTRIES; i++) setCached(`k${i}`, { durationMins: i });
  assert.equal(getCached('k0'), undefined);
  assert.equal(getCached(`k${MAX_ENTRIES}`).durationMins, MAX_ENTRIES);
  resetCacheForTests();
});
