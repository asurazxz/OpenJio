import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { routeKey } from '../src/cache.js';
import {
  InputError,
  parseLatLng,
  parseMode,
  parseDepart,
  parseGeocodeQuery,
  singaporeParts,
} from '../src/inputs.js';

const A = { lat: 1.3, lng: 103.8 };
const B = { lat: 1.29, lng: 103.85 };

describe('routeKey', () => {
  test('same inputs produce the same key', () => {
    const d = new Date('2026-01-05T04:10:00Z');
    assert.equal(routeKey({ from: A, to: B, mode: 'pt', depart: d }),
      routeKey({ from: A, to: B, mode: 'pt', depart: d }));
  });

  test('coordinates are rounded to 4 decimal places', () => {
    const d = new Date('2026-01-05T04:10:00Z');
    const a = routeKey({ from: { lat: 1.30001, lng: 103.80002 }, to: B, mode: 'walk', depart: d });
    const b = routeKey({ from: { lat: 1.30004, lng: 103.79998 }, to: B, mode: 'walk', depart: d });
    assert.equal(a, b);
    assert.match(a, /^1\.3000,103\.8000\|/);
  });

  test('mode changes the key', () => {
    const d = new Date('2026-01-05T04:10:00Z');
    assert.notEqual(routeKey({ from: A, to: B, mode: 'pt', depart: d }),
      routeKey({ from: A, to: B, mode: 'walk', depart: d }));
  });

  test('depart hour is taken in Singapore time', () => {
    // 15:30 UTC is 23:30 in Singapore (UTC+8)
    const key = routeKey({ from: A, to: B, mode: 'pt', depart: new Date('2026-01-01T15:30:00Z') });
    assert.ok(key.endsWith('|pt|2026-01-01T23'), key);
  });

  test('crossing Singapore midnight changes the day and hour', () => {
    // 16:10 UTC is 00:10 on 2026-01-02 in Singapore
    const key = routeKey({ from: A, to: B, mode: 'pt', depart: new Date('2026-01-01T16:10:00Z') });
    assert.ok(key.endsWith('|pt|2026-01-02T00'), key);
  });

  test('minutes within the same SG hour share a key', () => {
    const a = routeKey({ from: A, to: B, mode: 'pt', depart: new Date('2026-01-01T01:05:00Z') });
    const b = routeKey({ from: A, to: B, mode: 'pt', depart: new Date('2026-01-01T01:55:00Z') });
    assert.equal(a, b);
  });
});

describe('singaporeParts', () => {
  test('returns date and clock fields in SG time', () => {
    const p = singaporeParts(new Date('2026-01-01T00:00:00Z'));
    assert.deepEqual(p, { year: '2026', month: '01', day: '01', hour: '08', minute: '00', second: '00' });
  });
});

describe('parseLatLng', () => {
  test('parses a valid pair', () => {
    assert.deepEqual(parseLatLng('1.3,103.8', 'from'), { lat: 1.3, lng: 103.8 });
    assert.deepEqual(parseLatLng(' -1.5 , 100 ', 'from'), { lat: -1.5, lng: 100 });
  });

  test('rejects malformed input with InputError', () => {
    for (const bad of [undefined, '', '1.3', '1.3,', ',103.8', '1,2,3', 'a,b', 'NaN,1', '91,0', '0,181', ['1,2', '3,4']]) {
      assert.throws(() => parseLatLng(bad, 'from'), InputError, `expected reject: ${String(bad)}`);
    }
  });
});

describe('parseMode', () => {
  test('accepts pt and walk only', () => {
    assert.equal(parseMode('pt'), 'pt');
    assert.equal(parseMode('walk'), 'walk');
    for (const bad of [undefined, 'PT', 'bus', '', ['pt']]) {
      assert.throws(() => parseMode(bad), InputError);
    }
  });
});

describe('parseDepart', () => {
  test('parses ISO dates and defaults to now when absent', () => {
    assert.equal(parseDepart('2026-01-01T10:00:00Z').toISOString(), '2026-01-01T10:00:00.000Z');
    const before = Date.now();
    const d = parseDepart(undefined);
    assert.ok(d.getTime() >= before && d.getTime() <= Date.now());
  });

  test('rejects unparseable dates', () => {
    assert.throws(() => parseDepart('not-a-date'), InputError);
    assert.throws(() => parseDepart(['2026-01-01']), InputError);
  });
});

describe('parseGeocodeQuery', () => {
  test('trims and enforces minimum length', () => {
    assert.equal(parseGeocodeQuery('  ang mo kio '), 'ang mo kio');
    assert.throws(() => parseGeocodeQuery('a'), InputError);
    assert.throws(() => parseGeocodeQuery('  x  '), InputError);
    assert.throws(() => parseGeocodeQuery(undefined), InputError);
  });
});
