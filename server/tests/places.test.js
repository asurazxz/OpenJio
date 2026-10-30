import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createPlaceSearch } from '../src/places.js';

const result = (properties, geometry = { type: 'Point', coordinates: [103.8198, 1.3521] }) => ({ type: 'Feature', properties, geometry });

async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'openjio-places-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { quotaPath: path.join(dir, 'quota.json'), cachePath: path.join(dir, 'results.json') };
}

test('search normalizes and filters results to Singapore, returning only the search contract', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  let requestUrl;
  const places = createPlaceSearch({ apiKey: 'secret-test-key', quotaPath, cachePath, fetchImpl: async url => {
    requestUrl = new URL(url);
    return { ok: true, json: async () => ({ results: [
      { place_id: 'sg-1', name: '<b>Nice Cafe</b>', formatted: 'Nice Cafe, Singapore', lat: 1.30, lon: 103.80, country_code: 'sg', website: 'javascript:alert(1)' },
      { place_id: 'outside', name: 'Elsewhere', lat: 40, lon: -73, country_code: 'us' },
      { place_id: 'missing-coord', name: 'Unknown', country_code: 'sg' },
    ] }) };
  } });
  const hits = await places.search(' cafe ');
  assert.deepEqual(hits, [{ id: 'sg-1', name: 'Nice Cafe', address: 'Nice Cafe, Singapore', lat: 1.3, lng: 103.8 }]);
  assert.equal(requestUrl.pathname, '/v1/geocode/autocomplete');
  assert.equal(requestUrl.searchParams.get('type'), 'amenity');
  assert.equal(requestUrl.searchParams.get('filter'), 'countrycode:sg');
  assert.equal(requestUrl.searchParams.get('limit'), '5');
  assert.equal(requestUrl.searchParams.get('apiKey'), 'secret-test-key');
});

test('details accepts only valid HTTP websites and returns safe optional fields and attribution', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  const places = createPlaceSearch({ apiKey: 'secret', quotaPath, cachePath, fetchImpl: async () => ({ ok: true, json: async () => ({ features: [
    result({ feature_type: 'details', place_id: 'sg-2', name: 'Tea Room', formatted: 'Tea Room, Singapore', country_code: 'sg', website: 'https://example.sg/cafe', opening_hours: '<img src=x>Mo-Fr 09:00-18:00' }),
  ] }) }) });
  const detail = await places.details('sg-2');
  assert.equal(detail.website, 'https://example.sg/cafe');
  assert.equal(detail.openingHoursText, 'Mo-Fr 09:00-18:00');
  assert.match(detail.attribution, /Geoapify.*OpenStreetMap/);
});

test('quota cap is durable across adapter restarts and reserves before external calls', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  let calls = 0;
  const create = () => createPlaceSearch({ apiKey: 'secret', quotaPath, cachePath, dailyLimit: 1, fetchImpl: async () => {
    calls += 1;
    return { ok: true, json: async () => ({ results: [result({ place_id: 'sg-3', name: 'Cafe', country_code: 'sg' })] }) };
  } });
  await create().search('one');
  await assert.rejects(create().search('two'), error => error.code === 'places_limit');
  assert.equal(calls, 1);
  const ledger = JSON.parse(await readFile(quotaPath, 'utf8'));
  assert.equal(ledger.used, 1);
});

test('concurrent requests cannot overshoot the cap', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  let calls = 0;
  const places = createPlaceSearch({ apiKey: 'secret', quotaPath, cachePath, dailyLimit: 1, fetchImpl: async () => {
    calls += 1;
    return { ok: true, json: async () => ({ results: [] }) };
  } });
  const results = await Promise.allSettled([places.search('first'), places.search('second')]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected' && item.reason.code === 'places_limit').length, 1);
  assert.equal(calls, 1);
});

test('different queries through separate adapters share one quota reservation queue', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  let calls = 0;
  const make = () => createPlaceSearch({ apiKey: 'secret', quotaPath, cachePath, dailyLimit: 1, fetchImpl: async url => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    const query = new URL(url).searchParams.get('text');
    return { ok: true, json: async () => ({ results: [{ place_id: query, name: query, formatted: `${query}, Singapore`, lat: 1.3, lon: 103.8, country_code: 'sg' }] }) };
  } });
  const outcomes = await Promise.allSettled([make().search('first query'), make().search('second query')]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected' && outcome.reason.code === 'places_limit').length, 1);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await readFile(quotaPath, 'utf8')).used, 1);
});

test('failed external call consumes a reservation and errors do not reveal the API key', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  const places = createPlaceSearch({ apiKey: 'do-not-leak-this', quotaPath, cachePath, dailyLimit: 1, fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'do-not-leak-this denied' }) });
  await assert.rejects(places.search('failed'), error => error.code === 'places_error' && !error.message.includes('do-not-leak-this'));
  await assert.rejects(places.search('next'), error => error.code === 'places_limit');
});

test('missing credentials are reported without calling fetch', async () => {
  let called = false;
  const places = createPlaceSearch({ apiKey: '', fetchImpl: async () => { called = true; } });
  assert.deepEqual(places.status(), { configured: false, provider: 'geoapify', dailyLimit: 1000 });
  await assert.rejects(places.search('cafe'), error => error.code === 'places_missing');
  assert.equal(called, false);
});

test('successful normalized search is reused after adapter restart without another quota charge', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  let firstCalls = 0;
  const create = fetchImpl => createPlaceSearch({ apiKey: 'persist-test-key', quotaPath, cachePath, fetchImpl });
  const first = create(async () => {
    firstCalls += 1;
    return { ok: true, json: async () => ({ results: [{ place_id: 'cached-sg', name: 'Saved Cafe', formatted: 'Saved Cafe, Singapore', lat: 1.30, lon: 103.80, country_code: 'sg', datasource: { secretRawProviderField: 'must not persist' } }] }) };
  });
  const expected = [{ id: 'cached-sg', name: 'Saved Cafe', address: 'Saved Cafe, Singapore', lat: 1.3, lng: 103.8 }];
  assert.deepEqual(await first.search('cached cafe'), expected);
  const second = create(async () => { throw new Error('cache miss'); });
  assert.deepEqual(await second.search('cached cafe'), expected);
  assert.equal(firstCalls, 1);
  const cacheFile = await readFile(cachePath, 'utf8');
  assert.equal(cacheFile.includes('persist-test-key'), false);
  assert.equal(cacheFile.includes('must not persist'), false);
  assert.equal(JSON.parse(await readFile(quotaPath, 'utf8')).used, 1);
});

test('normalized persistent cache is loaded from disk by a fresh adapter cache state', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  const query = 'disk cache';
  const key = `search:${createHash('sha256').update(query).digest('hex')}`;
  const expected = [{ id: 'disk-sg', name: 'Disk Cafe', address: 'Disk Cafe, Singapore', lat: 1.31, lng: 103.81 }];
  await writeFile(cachePath, JSON.stringify({ version: 1, entries: [{ key, expiresAt: Date.now() + 60_000, value: expected }] }));
  const places = createPlaceSearch({ apiKey: 'fresh-process-key', quotaPath, cachePath, fetchImpl: async () => { throw new Error('should use persisted cache'); } });
  assert.deepEqual(await places.search(query), expected);
  await assert.rejects(readFile(quotaPath, 'utf8'), error => error.code === 'ENOENT');
});

test('expired persisted results are ignored and refreshed from the provider', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  const query = 'stale cafe';
  const key = `search:${createHash('sha256').update(query).digest('hex')}`;
  await writeFile(cachePath, JSON.stringify({ version: 1, entries: [{
    key, expiresAt: Date.now() - 1,
    value: [{ id: 'stale-id', name: 'Old Cafe', address: 'Old address', lat: 1.31, lng: 103.81 }],
  }] }));
  let calls = 0;
  const places = createPlaceSearch({ apiKey: 'secret', quotaPath, cachePath, fetchImpl: async () => {
    calls += 1;
    return { ok: true, json: async () => ({ results: [{ place_id: 'fresh-id', name: 'Fresh Cafe', formatted: 'Fresh Cafe, Singapore', lat: 1.31, lon: 103.81, country_code: 'sg' }] }) };
  } });
  assert.equal((await places.search(query))[0].id, 'fresh-id');
  assert.equal(calls, 1);
});

test('identical in-flight searches across adapter instances share a single provider call', async t => {
  const { quotaPath, cachePath } = await sandbox(t);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { ok: true, json: async () => ({ results: [{ place_id: 'same-query', name: 'Cafe', formatted: 'Cafe, Singapore', lat: 1.3, lon: 103.8, country_code: 'sg' }] }) };
  };
  const create = () => createPlaceSearch({ apiKey: 'dedupe-key', quotaPath, cachePath, fetchImpl });
  const [left, right] = await Promise.all([create().search('same cafe'), create().search('same cafe')]);
  assert.deepEqual(left, right);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await readFile(quotaPath, 'utf8')).used, 1);
});

test('cache persistence failures do not prevent valid provider results', async t => {
  const { quotaPath } = await sandbox(t);
  const invalidCachePath = path.dirname(quotaPath);
  const places = createPlaceSearch({ apiKey: 'secret', quotaPath, cachePath: invalidCachePath, fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{ place_id: 'uncached', name: 'Cafe', formatted: 'Cafe, Singapore', lat: 1.3, lon: 103.8, country_code: 'sg' }] }) }) });
  assert.equal((await places.search('cafe'))[0].id, 'uncached');
});
