import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveCatalogueSync } from '../src/live-sync.js';

test('live catalogue synchronizes real source data, avoids repeated writes and retries a failure', async () => {
  const place = { id: 'osm-real', type: 'place', title: 'Live venue', source: {kind: 'osm'}, openingHours: {}, lat: 1.3, lng: 103.8 };
  let places = [place], attempts = 0, stored;
  const sync = createLiveCatalogueSync({
    repository: { async syncListings(listings) { attempts++; if (attempts === 1) throw new Error('offline'); stored = structuredClone(listings); } },
    fetchPlaces: async () => places, readDrafts: async () => [],
  });
  await assert.rejects(sync, /offline/);
  await sync();
  assert.deepEqual(stored.map(l => l.id), ['osm-real']);
  await sync();
  assert.equal(attempts, 2);
  places = [{...place, title: 'Updated live venue'}, {...place, id: 'sample', sample: true}];
  await sync();
  assert.deepEqual(stored.map(l => l.title), ['Updated live venue']);
});
