import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { markAutoPublish, createIngestScheduler, parseIntervalHours } from '../src/ingest.js';

// 2 Nov 2026, 12:00 Singapore time.
const NOW = Date.parse('2026-11-02T04:00:00Z');
const AREAS = [
  { slug: 'bugis', label: 'Bugis', lat: 1.30063, lng: 103.85563 },
  { slug: 'orchard', label: 'Orchard', lat: 1.30411, lng: 103.83230 },
  { slug: 'jurong-east', label: 'Jurong East', lat: 1.33330, lng: 103.74220 },
];

function deal(overrides = {}) {
  return {
    id: 'd1',
    status: 'draft',
    type: 'deal',
    title: 'Half-price pizza',
    merchant: 'Pizza Place',
    summary: '',
    outlets: [{ name: 'Pizza Place', address: '1 Bugis St' }],
    validity: { dateFrom: '2026-10-01', dateTo: '2026-12-31', daysOfWeek: [], timeWindows: [{ start: '11:00', end: '14:00' }] },
    source: { kind: 'scraped', name: 'sgfooddeals', url: 'https://t.me/sgfooddeals/1', retrievedAt: '2026-11-01T00:00:00Z', postedAt: '2026-10-30T00:00:00Z' },
    rawPostId: 'r1',
    ...overrides,
  };
}

function event(overrides = {}) {
  return deal({
    type: 'event',
    title: 'Night market',
    validity: null,
    startsAt: '2026-11-10T19:00:00+08:00',
    endsAt: '2026-11-10T22:00:00+08:00',
    ...overrides,
  });
}

// Fake geocoder: answers from a table and records every query it receives.
function geocoderFrom(table) {
  const calls = [];
  const geocode = async query => {
    calls.push(query);
    return table[query] ?? [];
  };
  geocode.calls = calls;
  return geocode;
}

const BUGIS_HIT = { name: 'Bugis MRT', address: '1 Bugis St, Singapore 188000', lat: 1.3007, lng: 103.8557 };

test('a complete deal is marked auto-publish with its nearest area', async () => {
  const original = { d1: deal() };
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const { drafts } = await markAutoPublish(original, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  const d = drafts.d1;
  assert.equal(d.autoPublish, true);
  assert.equal(d.area, 'bugis');
  assert.equal(d.lat, BUGIS_HIT.lat);
  assert.equal(d.lng, BUGIS_HIT.lng);
  assert.equal(d.address, BUGIS_HIT.address);
  assert.equal(d.locationKnown, true);
  assert.deepEqual(d.missing, []);
  assert.equal(d.autoNote, undefined);
  assert.equal(d.autoCheckedAt, new Date(NOW).toISOString());
  assert.equal(d.autoReason, undefined);
  assert.equal(original.d1.autoPublish, undefined, 'input draft must not be mutated');
});

test('a complete event with a future end is marked auto-publish', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const { drafts } = await markAutoPublish({ e1: event({ id: 'e1' }) }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(drafts.e1.autoPublish, true);
  assert.equal(drafts.e1.area, 'bugis');
  assert.deepEqual(drafts.e1.missing, []);
});

test('a deal whose dateTo is in the past is not auto-published', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const draft = deal({ validity: { dateFrom: '2026-10-01', dateTo: '2026-11-01', daysOfWeek: [], timeWindows: [] } });
  const { drafts } = await markAutoPublish({ d1: draft }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(drafts.d1.autoPublish, false);
  assert.match(drafts.d1.autoReason, /ended/);
  assert.equal(geocode.calls.length, 0, 'expired drafts are rejected before any lookup');
});

test('an event whose endsAt is in the past is not auto-published', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const draft = event({ startsAt: '2026-10-20T19:00:00+08:00', endsAt: '2026-10-20T22:00:00+08:00' });
  const { drafts } = await markAutoPublish({ e1: draft }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(drafts.e1.autoPublish, false);
  assert.match(drafts.e1.autoReason, /ended/);
});

test('a place that cannot be found in Singapore is published without a location', async () => {
  const geocode = geocoderFrom({
    '1 Bugis St': [{ name: 'Elsewhere', address: 'Kuala Lumpur', lat: 3.139, lng: 101.687 }],
  });
  const { drafts } = await markAutoPublish({ d1: deal({ outlets: [{ name: 'Pizza Place', address: '1 Bugis St' }], merchant: '' }) },
    { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  const d = drafts.d1;
  assert.equal(d.autoPublish, true);
  assert.equal(d.locationKnown, false);
  assert.equal(d.autoNote, 'Place not found in Singapore');
  assert.equal(d.autoReason, undefined);
  assert.equal(d.lat, undefined);
  assert.equal(d.lng, undefined);
  assert.equal(d.area, undefined);
  assert.deepEqual(d.missing, ['location']);
});

test('when the address finds nothing, the outlet name and merchant are tried in turn', async () => {
  const geocode = geocoderFrom({ 'Pizza Place': [BUGIS_HIT] });
  const draft = deal({ outlets: [{ name: 'Pizza Place', address: '' }], merchant: 'Pizza Place Co' });
  const { drafts } = await markAutoPublish({ d1: draft }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(drafts.d1.autoPublish, true);
  assert.deepEqual(geocode.calls, ['Pizza Place']);
});

test('a place more than 3 km from every area is published without a location', async () => {
  const woodlands = { name: 'Woodlands', address: 'Woodlands Ave 1', lat: 1.4360, lng: 103.7865 };
  const geocode = geocoderFrom({ '1 Bugis St': [woodlands] });
  const { drafts } = await markAutoPublish({ d1: deal() }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(drafts.d1.autoPublish, true);
  assert.equal(drafts.d1.locationKnown, false);
  assert.match(drafts.d1.autoNote, /more than 3 km/);
  assert.equal(drafts.d1.lat, undefined);
});

test('missing details are listed and do not block publication', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const draft = deal({ validity: { dateFrom: null, dateTo: null, daysOfWeek: [], timeWindows: [] }, source: { kind: 'manual' } });
  const { drafts } = await markAutoPublish({ d1: draft }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(drafts.d1.autoPublish, true);
  assert.equal(drafts.d1.locationKnown, true);
  assert.deepEqual(drafts.d1.missing, ['dates', 'times', 'source']);
  assert.equal(drafts.d1.autoReason, undefined);
});

test('an event without start or end time is published with dates listed as missing', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const { drafts } = await markAutoPublish({ e1: event({ startsAt: null, endsAt: null }) },
    { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(drafts.e1.autoPublish, true);
  assert.deepEqual(drafts.e1.missing, ['dates']);
});

test('drafts that are not deals or events, or have no title, are not published', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const { drafts } = await markAutoPublish({
    o1: deal({ id: 'o1', type: 'other' }),
    n1: deal({ id: 'n1', title: '   ' }),
  }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(drafts.o1.autoPublish, false);
  assert.equal(drafts.o1.autoReason, 'Not a deal or event');
  assert.equal(drafts.n1.autoPublish, false);
  assert.equal(drafts.n1.autoReason, 'Missing title');
  assert.equal(geocode.calls.length, 0);
});

test('a previously unlocated draft with an unchanged source is looked up again', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const previous = deal({ autoPublish: true, locationKnown: false, autoNote: 'Place not found in Singapore', missing: ['location'], autoCheckedSourceEditedAt: null });
  const { drafts } = await markAutoPublish({ d1: previous }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(geocode.calls.length, 1);
  assert.equal(drafts.d1.locationKnown, true);
  assert.equal(drafts.d1.autoNote, undefined);
  assert.equal(drafts.d1.area, 'bugis');
});

test('a retired draft is only changed to autoPublish false', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const retired = deal({ id: 'd2', status: 'retired' });
  const { drafts } = await markAutoPublish({ d2: retired }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.deepEqual(drafts.d2, { ...retired, autoPublish: false });
  assert.equal(geocode.calls.length, 0);
});

test('an unchanged draft that was already auto-published is not re-geocoded', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const marked = deal({ autoPublish: true, area: 'bugis', lat: BUGIS_HIT.lat, lng: BUGIS_HIT.lng, address: BUGIS_HIT.address, autoCheckedSourceEditedAt: null });
  const { drafts } = await markAutoPublish({ d1: marked }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(geocode.calls.length, 0);
  assert.equal(drafts.d1.autoPublish, true);
});

test('an auto-published draft whose source was edited is checked again', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const edited = deal({
    autoPublish: true,
    area: 'bugis',
    autoCheckedSourceEditedAt: '2026-10-31T00:00:00Z',
    sourceEditedAt: '2026-11-01T00:00:00Z',
  });
  const { drafts } = await markAutoPublish({ d1: edited }, { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(geocode.calls.length, 1);
  assert.equal(drafts.d1.autoPublish, true);
  assert.equal(drafts.d1.autoCheckedSourceEditedAt, '2026-11-01T00:00:00Z');
});

test('drafts sharing an address trigger one lookup per run', async () => {
  const geocode = geocoderFrom({ '1 Bugis St': [BUGIS_HIT] });
  const { drafts } = await markAutoPublish({ d1: deal(), d3: deal({ id: 'd3' }) },
    { geocode, areas: AREAS, now: () => NOW, minGapMs: 0 });
  assert.equal(geocode.calls.length, 1);
  assert.equal(drafts.d1.autoPublish, true);
  assert.equal(drafts.d3.autoPublish, true);
});

test('parseIntervalHours defaults to 2 and clamps to 1..6', () => {
  assert.equal(parseIntervalHours(undefined), 2);
  assert.equal(parseIntervalHours('abc'), 2);
  assert.equal(parseIntervalHours('0'), 1);
  assert.equal(parseIntervalHours('9'), 6);
  assert.equal(parseIntervalHours('3'), 3);
});

// Fake child process: the test decides when it exits and what it prints.
class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.killed = false;
  }
  kill() {
    this.killed = true;
    this.finish(null);
  }
  finish(code) {
    this.emit('close', code);
  }
}

async function waitFor(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function tempDrafts(contents) {
  const dir = await mkdtemp(path.join(tmpdir(), 'openjio-ingest-'));
  const file = path.join(dir, 'drafts.json');
  if (contents !== undefined) await writeFile(file, JSON.stringify(contents), 'utf8');
  return file;
}

test('scheduled runs never overlap and the status records exit code and redacted logs', async () => {
  const draftsFile = await tempDrafts();
  const children = [];
  const spawnCalls = [];
  const spawnImpl = (cmd, args, opts) => {
    spawnCalls.push({ cmd, args, opts });
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  const scheduler = createIngestScheduler({
    intervalMs: 5,
    firstRunDelayMs: 5,
    python: 'py',
    runArgs: ['run.py', '--limit', '15'],
    draftsFile,
    spawnImpl,
    logger: null,
    now: () => NOW,
    cwd: path.dirname(draftsFile),
  });

  scheduler.start();
  await waitFor(() => children.length === 1);
  await delay(60);
  assert.equal(children.length, 1, 'ticks during a run are skipped, not stacked');
  assert.equal(scheduler.runNow(), false, 'a manual run is refused while one is running');
  assert.equal(spawnCalls[0].cmd, 'py');
  assert.deepEqual(spawnCalls[0].args, ['run.py', '--limit', '15']);

  children[0].stdout.emit('data', 'fetched 10\nGEMINI_API_KEY=AIzaSyA1234567890abcdefghijklmnop\n');
  children[0].stderr.emit('data', 'boom\n');
  children[0].finish(3);
  await waitFor(() => !scheduler.isRunning());

  const status = scheduler.status();
  scheduler.stop();
  assert.equal(status.lastExitCode, 3);
  assert.match(status.lastError, /code 3/);
  assert.ok(status.logTail.includes('boom'));
  assert.ok(status.logTail.includes('fetched 10'));
  assert.equal(status.logTail.join('\n').includes('AIzaSy'), false, 'API keys never reach the log tail');
});

test('a successful run marks drafts and writes drafts.json back', async () => {
  const draftsFile = await tempDrafts({ d1: deal() });
  const children = [];
  const scheduler = createIngestScheduler({
    intervalMs: 60 * 60 * 1000,
    firstRunDelayMs: 60 * 60 * 1000,
    python: 'py',
    runArgs: [],
    draftsFile,
    geocode: null,
    spawnImpl: () => { const c = new FakeChild(); children.push(c); return c; },
    logger: null,
    now: () => NOW,
  });
  assert.equal(scheduler.runNow(), true);
  children[0].finish(0);
  await waitFor(() => !scheduler.isRunning());
  const status = scheduler.status();
  scheduler.stop();
  assert.equal(status.lastExitCode, 0);
  assert.equal(status.lastError, null);
  const saved = JSON.parse(await readFile(draftsFile, 'utf8'));
  assert.equal(saved.d1.autoPublish, true);
  assert.equal(saved.d1.locationKnown, false);
  assert.equal(saved.d1.autoNote, 'Address lookup unavailable');
  assert.equal(saved.d1.title, 'Half-price pizza', 'other fields are preserved');
});

test('a non-zero exit records the error and keeps the existing drafts', async () => {
  const original = { d1: deal() };
  const draftsFile = await tempDrafts(original);
  const children = [];
  const scheduler = createIngestScheduler({
    intervalMs: 60 * 60 * 1000,
    firstRunDelayMs: 60 * 60 * 1000,
    python: 'py',
    runArgs: [],
    draftsFile,
    geocode: null,
    spawnImpl: () => { const c = new FakeChild(); children.push(c); return c; },
    logger: null,
    now: () => NOW,
  });
  scheduler.runNow();
  children[0].finish(1);
  await waitFor(() => !scheduler.isRunning());
  const status = scheduler.status();
  scheduler.stop();
  assert.equal(status.lastExitCode, 1);
  assert.match(status.lastError, /exited with code 1/);
  assert.deepEqual(JSON.parse(await readFile(draftsFile, 'utf8')), original);
});

test('a run that exceeds the timeout is killed and recorded', async () => {
  const children = [];
  const scheduler = createIngestScheduler({
    intervalMs: 60 * 60 * 1000,
    firstRunDelayMs: 60 * 60 * 1000,
    python: 'py',
    runArgs: [],
    draftsFile: await tempDrafts(),
    spawnImpl: () => { const c = new FakeChild(); children.push(c); return c; },
    logger: null,
    timeoutMs: 20,
  });
  scheduler.runNow();
  await waitFor(() => !scheduler.isRunning());
  const status = scheduler.status();
  scheduler.stop();
  assert.equal(children[0].killed, true);
  assert.match(status.lastError, /timed out/);
});

test('a pipeline that cannot be started is recorded as an error', async () => {
  const scheduler = createIngestScheduler({
    intervalMs: 60 * 60 * 1000,
    firstRunDelayMs: 60 * 60 * 1000,
    python: 'missing-python',
    runArgs: [],
    draftsFile: await tempDrafts(),
    spawnImpl: () => { throw new Error('ENOENT'); },
    logger: null,
  });
  scheduler.runNow();
  await waitFor(() => !scheduler.isRunning());
  const status = scheduler.status();
  scheduler.stop();
  assert.equal(status.lastExitCode, null);
  assert.match(status.lastError, /Could not start pipeline/);
});
