import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlacesCatalogue, createQuotaReserve, parseOpeningHours } from '../src/places-catalogue.js';

const AREAS = [
  { slug: 'bugis', label: 'Bugis', lat: 1.30063, lng: 103.85563 },
  { slug: 'tampines', label: 'Tampines', lat: 1.35450, lng: 103.94560 },
];
const silent = { warn() {}, error() {}, info() {}, log() {} };
const DAY = 24 * 60 * 60 * 1000;

async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'openjio-catalogue-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function feature(id, name, options = {}) {
  const lat = options.lat ?? 1.3007;
  const lng = options.lng ?? 103.8557;
  const properties = {
    place_id: id,
    name,
    lat,
    lon: lng,
    country_code: 'sg',
    formatted: `${name}, Singapore`,
    categories: options.categories ?? ['catering.cafe'],
    datasource: { raw: options.raw ?? {} },
    ...(options.extra ?? {}),
  };
  if ('opening' in options) {
    if (options.opening === undefined) delete properties.opening_hours;
    else properties.opening_hours = options.opening;
  } else {
    properties.opening_hours = 'Mo-Su 09:00-21:00';
  }
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties };
}

// Answers like Geoapify: only features whose categories match the requested ones.
function geoapify(features, calls = []) {
  return async url => {
    const parsed = new URL(url);
    calls.push(parsed);
    const requested = parsed.searchParams.get('categories').split(',');
    const matches = features.filter(item => item.properties.categories.some(category => requested.includes(category)));
    return { ok: true, status: 200, json: async () => ({ type: 'FeatureCollection', features: matches }) };
  };
}

function catalogue(dir, options) {
  return createPlacesCatalogue({
    apiKey: 'test-key',
    areas: AREAS,
    file: path.join(dir, 'catalogue.json'),
    reserve: async () => {},
    logger: silent,
    paceMs: 0,
    ...options,
  });
}

// ---------------------------------------------------------------- opening hours

test('opening_hours parser handles the common OSM subset', () => {
  const weekdays = { mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']], thu: [['09:00', '18:00']], fri: [['09:00', '18:00']] };
  assert.deepEqual(parseOpeningHours('Mo-Fr 09:00-18:00; Sa,Su 10:00-22:00'), {
    ...weekdays,
    sat: [['10:00', '22:00']],
    sun: [['10:00', '22:00']],
  });
  const everyday = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => [day, [['11:00', '21:30']]]));
  assert.deepEqual(parseOpeningHours('Mo-Su 11:00-21:30'), everyday);
  assert.deepEqual(parseOpeningHours('09:00-18:00'), Object.fromEntries(Object.keys(everyday).map(day => [day, [['09:00', '18:00']]])));
});

test('24/7 means every day all day, and multiple ranges are kept in order', () => {
  const all = parseOpeningHours('24/7');
  assert.equal(Object.keys(all).length, 7);
  assert.deepEqual(all.wed, [['00:00', '23:59']]);
  const split = parseOpeningHours('Mo-Su 11:00-14:00,17:00-22:00');
  assert.deepEqual(split.sun, [['11:00', '14:00'], ['17:00', '22:00']]);
});

test('off and closed days are empty arrays, and a missing day stays unknown', () => {
  const hours = parseOpeningHours('Mo-Fr 09:00-18:00; Sa off; Su closed');
  assert.deepEqual(hours.sat, []);
  assert.deepEqual(hours.sun, []);
  const partial = parseOpeningHours('Mo-Fr 09:00-18:00');
  assert.equal('sat' in partial, false);
  assert.equal('sun' in partial, false);
});

test('public holiday rules are ignored while weekday rules still apply', () => {
  const hours = parseOpeningHours('Mo-Fr 09:00-18:00; PH off');
  assert.deepEqual(Object.keys(hours), ['mon', 'tue', 'wed', 'thu', 'fri']);
});

test('ranges past midnight are clipped to 23:59 and wrapping day ranges work', () => {
  assert.deepEqual(parseOpeningHours('Mo-Su 18:00-02:00').fri, [['18:00', '23:59']]);
  assert.deepEqual(parseOpeningHours('Fr-Mo 10:00-20:00').sun, [['10:00', '20:00']]);
  assert.equal('tue' in parseOpeningHours('Fr-Mo 10:00-20:00'), false);
});

test('unparseable opening hours return null', () => {
  for (const raw of ['by appointment', 'Mo-Fr', 'Mo-Fr 09:00-18:00 || Sa 10:00-12:00', 'Mo-Fr 25:00-18:00', 'Mo 10:00-10:00', '', 'x'.repeat(600)]) {
    assert.equal(parseOpeningHours(raw), null, raw);
  }
});

// ---------------------------------------------------------------- filtering and shape

test('filters out places without hours, outside Singapore, unparseable hours, nameless, and generic brands', async t => {
  const dir = await sandbox(t);
  const good = feature('good-1', 'Good Cafe');
  const features = [
    good,
    feature('no-hours', 'No Hours Cafe', { opening: undefined }),
    feature('abroad', 'Far Cafe', { lat: 40, lng: -73 }),
    feature('odd', 'Odd Cafe', { opening: 'by appointment' }),
    feature('brand', 'Starbucks', { extra: { brand: 'Starbucks' } }),
    feature('raw-brand', 'McDonalds', { raw: { brand: "McDonald's" } }),
    feature('nameless', '', { }),
  ];
  const cat = catalogue(dir, { fetchImpl: geoapify(features) });
  await cat.refresh();
  assert.deepEqual(cat.list().map(place => place.id), ['osm-good-1']);
});

test('branded attractions are kept, and the attraction interest follows the name', async t => {
  const dir = await sandbox(t);
  const features = [
    feature('brand-attr', 'Heritage Museum', { categories: ['tourism.attraction'], extra: { brand: 'Trust' } }),
    feature('park-attr', 'Botanic Garden Trail', { categories: ['tourism.attraction'] }),
    feature('sight', 'Clock Tower', { categories: ['tourism.sights'] }),
  ];
  const cat = catalogue(dir, { fetchImpl: geoapify(features) });
  await cat.refresh();
  const byId = Object.fromEntries(cat.list().map(place => [place.id, place]));
  assert.deepEqual(byId['osm-brand-attr'].interests, ['arts']);
  assert.deepEqual(byId['osm-park-attr'].interests, ['outdoors']);
  assert.deepEqual(byId['osm-sight'].interests, ['arts']);
});

test('listing shape matches the seed place contract and validates the website and OSM link', async t => {
  const dir = await sandbox(t);
  const features = [feature('shape-1', 'Shape Cafe', {
    raw: { osm_type: 'node', osm_id: 12345, wikidata: 'Q1' },
    extra: { website: 'https://example.sg/cafe', formatted: 'Shape Cafe, 1 Test Road, Singapore' },
    opening: 'Mo-Fr 09:00-18:00; Sa,Su 10:00-22:00',
  })];
  const cat = catalogue(dir, { fetchImpl: geoapify(features), now: () => Date.parse('2026-11-02T04:00:00Z') });
  await cat.refresh();
  const [place] = cat.list();
  assert.equal(place.id, 'osm-shape-1');
  assert.equal(place.type, 'place');
  assert.equal(place.kind, 'meal');
  assert.equal(place.title, 'Shape Cafe');
  assert.equal(place.summary, 'Cafe near Bugis.');
  assert.deepEqual(place.interests, ['cafes', 'food']);
  assert.equal(place.area, 'bugis');
  assert.equal(place.address, 'Shape Cafe, 1 Test Road, Singapore');
  assert.equal(place.durationMins, 60);
  assert.equal(place.durationDefault, true);
  assert.equal(place.priceLevel, null);
  assert.equal(place.priceText, null);
  assert.equal(place.openingHoursText, 'Mo-Fr 09:00-18:00; Sa,Su 10:00-22:00');
  assert.deepEqual(place.openingHours.sun, [['10:00', '22:00']]);
  assert.equal(place.website, 'https://example.sg/cafe');
  assert.equal(place.status, 'published');
  assert.equal(place.routeReady, true);
  assert.equal(place.reviewStatus, 'route-ready');
  assert.deepEqual(place.source, {
    kind: 'osm',
    name: 'OpenStreetMap via Geoapify',
    url: 'https://www.openstreetmap.org/node/12345',
    retrievedAt: '2026-11-02T04:00:00.000Z',
  });
});

test('unsafe website values are omitted and the source falls back to an empty link', async t => {
  const dir = await sandbox(t);
  const cat = catalogue(dir, { fetchImpl: geoapify([feature('bad-web', 'Risky Cafe', { extra: { website: 'javascript:alert(1)' } })]) });
  await cat.refresh();
  const [place] = cat.list();
  assert.equal('website' in place, false);
  assert.equal(place.source.url, '');
});

// ---------------------------------------------------------------- ranking, dedupe, areas

test('keeps the top five per category group per area, preferring websites and wiki-linked places', async t => {
  const dir = await sandbox(t);
  const features = [];
  for (let i = 1; i <= 7; i++) {
    features.push(feature(`cafe-${i}`, `Cafe ${i}`, {
      lat: 1.3007 + i * 0.00005,
      extra: i <= 2 ? { website: `https://cafe${i}.example.sg` } : {},
      raw: i === 3 ? { wikipedia: 'en:Cafe 3' } : {},
    }));
  }
  const cat = catalogue(dir, { fetchImpl: geoapify(features) });
  await cat.refresh();
  const bugisCafes = cat.list().filter(place => place.area === 'bugis' && place.interests.includes('cafes'));
  assert.equal(bugisCafes.length, 5);
  const ids = bugisCafes.map(place => place.id);
  assert.ok(ids.includes('osm-cafe-1'));
  assert.ok(ids.includes('osm-cafe-2'));
  assert.ok(ids.includes('osm-cafe-3'));
});

test('a place returned by several areas and groups appears once, in its nearest area and first group', async t => {
  const dir = await sandbox(t);
  const shared = feature('shared-1', 'Shared Spot', {
    lat: 1.3515,
    lng: 103.9440,
    categories: ['catering.cafe', 'tourism.attraction'],
  });
  const cat = catalogue(dir, { fetchImpl: geoapify([shared]) });
  await cat.refresh();
  const matches = cat.list().filter(place => place.id === 'osm-shared-1');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].area, 'tampines');
  assert.deepEqual(matches[0].interests, ['cafes', 'food']);
});

// ---------------------------------------------------------------- refresh, retention, quota

test('requests are paced at least 300 ms apart and charge the quota once per call', async t => {
  const dir = await sandbox(t);
  const times = [];
  const charges = [];
  const cat = catalogue(dir, {
    areas: [AREAS[0]],
    paceMs: 300,
    reserve: async () => { charges.push(Date.now()); },
    fetchImpl: async () => {
      times.push(Date.now());
      return { ok: true, status: 200, json: async () => ({ features: [] }) };
    },
  });
  await cat.refresh();
  assert.equal(times.length, 7);
  assert.equal(charges.length, 7);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 290, `gap ${times[i] - times[i - 1]}`);
});

test('saves to disk atomically and reloads the same catalogue in a new instance', async t => {
  const dir = await sandbox(t);
  const file = path.join(dir, 'catalogue.json');
  const cat = catalogue(dir, { fetchImpl: geoapify([feature('persist-1', 'Persist Cafe')]) });
  await cat.refresh();
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.version, 1);
  assert.ok(Array.isArray(saved.places));
  assert.ok(saved.lastSeen['osm-persist-1']);
  const reloaded = catalogue(dir, { fetchImpl: async () => { throw new Error('should not fetch'); } });
  await reloaded.ready();
  assert.deepEqual(reloaded.list().map(place => place.id), ['osm-persist-1']);
  assert.equal(reloaded.status().count, 1);
  assert.equal(reloaded.status().refreshing, false);
});

test('places missed by a refresh are kept for 30 days after last seen, then dropped', async t => {
  const dir = await sandbox(t);
  const file = path.join(dir, 'catalogue.json');
  const now = Date.now();
  const stored = (id) => ({
    id: `osm-${id}`, type: 'place', kind: 'meal', title: id, summary: '', interests: ['food'], area: 'bugis',
    address: '', lat: 1.3, lng: 103.85, durationMins: 60, openingHours: { mon: [['09:00', '18:00']] },
    status: 'published', routeReady: true, reviewStatus: 'route-ready', source: { kind: 'osm', name: 'x', url: '', retrievedAt: '' },
  });
  await writeFile(file, JSON.stringify({
    version: 1,
    refreshedAt: new Date(now - DAY).toISOString(),
    places: [stored('recent'), stored('stale')],
    lastSeen: { 'osm-recent': new Date(now - 10 * DAY).toISOString(), 'osm-stale': new Date(now - 31 * DAY).toISOString() },
  }));
  const cat = catalogue(dir, { fetchImpl: geoapify([]) });
  await cat.ready();
  await cat.refresh();
  assert.deepEqual(cat.list().map(place => place.id), ['osm-recent']);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(Object.keys(saved.lastSeen), ['osm-recent']);
});

test('quota exhaustion before a refresh keeps the existing catalogue and makes no provider calls', async t => {
  const dir = await sandbox(t);
  const file = path.join(dir, 'catalogue.json');
  await writeFile(file, JSON.stringify({
    version: 1,
    refreshedAt: new Date(Date.now() - 8 * DAY).toISOString(),
    places: [{ id: 'osm-kept', type: 'place', openingHours: { mon: [['09:00', '18:00']] }, lat: 1.3, lng: 103.85 }],
    lastSeen: { 'osm-kept': new Date().toISOString() },
  }));
  let calls = 0;
  const cat = catalogue(dir, {
    reserve: async () => { throw Object.assign(new Error('Today’s place data limit has been reached.'), { code: 'places_limit' }); },
    fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ features: [] }) }; },
  });
  await cat.ready();
  await cat.refresh();
  assert.equal(calls, 0);
  assert.deepEqual(cat.list().map(place => place.id), ['osm-kept']);
  assert.match(cat.status().lastError, /limit/);
});

test('quota exhausted partway through a refresh keeps the old catalogue untouched', async t => {
  const dir = await sandbox(t);
  const file = path.join(dir, 'catalogue.json');
  await writeFile(file, JSON.stringify({
    version: 1,
    refreshedAt: new Date(Date.now() - 8 * DAY).toISOString(),
    places: [{ id: 'osm-old', type: 'place', openingHours: { mon: [['09:00', '18:00']] }, lat: 1.3, lng: 103.85 }],
    lastSeen: { 'osm-old': new Date().toISOString() },
  }));
  let charges = 0;
  const cat = catalogue(dir, {
    fetchImpl: geoapify([feature('new-1', 'New Cafe')]),
    reserve: async () => {
      charges += 1;
      if (charges > 3) throw Object.assign(new Error('limit'), { code: 'places_limit' });
    },
  });
  await cat.ready();
  await cat.refresh();
  assert.equal(charges, 4);
  assert.deepEqual(cat.list().map(place => place.id), ['osm-old']);
});

test('the shared quota ledger refuses charges after the daily limit', async t => {
  const dir = await sandbox(t);
  const reserve = createQuotaReserve({ file: path.join(dir, 'quota.json'), limit: 2 });
  await reserve();
  await reserve();
  await assert.rejects(reserve(), error => error.code === 'places_limit');
  const ledger = JSON.parse(await readFile(path.join(dir, 'quota.json'), 'utf8'));
  assert.equal(ledger.used, 2);
});

test('without an API key the catalogue is empty and never touches the provider or disk', async t => {
  const dir = await sandbox(t);
  let calls = 0;
  const cat = createPlacesCatalogue({ apiKey: '', areas: AREAS, file: path.join(dir, 'catalogue.json'), logger: silent, fetchImpl: async () => { calls += 1; throw new Error('no'); } });
  cat.start();
  await cat.refresh();
  cat.stop();
  assert.deepEqual(cat.list(), []);
  assert.equal(cat.status().count, 0);
  assert.equal(calls, 0);
});

// ---------------------------------------------------------------- HTTP route

async function localServer(t) {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
    env: { ...process.env, PORT: String(port), DATA_MODE: 'demo', GEOAPIFY_API_KEY: '', ONEMAP_EMAIL: '', ONEMAP_PASSWORD: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local server did not start')), 10000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('OpenJio server listening')) { clearTimeout(timeout); resolve(); } });
    child.stderr.resume();
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Local server exited before starting')); });
  });
  return `http://127.0.0.1:${port}`;
}

test('the catalogue route is public, cacheable, and not behind the places rate limiter', async t => {
  const base = await localServer(t);
  for (let i = 0; i < 35; i++) {
    const response = await fetch(`${base}/api/places/catalogue`);
    assert.equal(response.status, 200);
    if (i === 0) {
      assert.equal(response.headers.get('cache-control'), 'max-age=300');
      assert.deepEqual(await response.json(), []);
    }
  }
  const status = await fetch(`${base}/api/places/catalogue/status`);
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.count, 0);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.placesCatalogue.count, 0);
});
