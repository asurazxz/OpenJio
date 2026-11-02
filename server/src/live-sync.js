import { createHash } from 'node:crypto';
import { createApiEngine } from '../../client/src/api/engine.js';

// Persist the same public provider listings the domain engine displays, so
// itinerary foreign keys resolve across requests and container restarts.
export function createLiveCatalogueSync({ repository, fetchPlaces, readDrafts }) {
  let accepted = null, pending = null;
  async function synchronize() {
    const [places, drafts] = await Promise.all([fetchPlaces(), readDrafts()]);
    const empty = { users: [], hangouts: [], members: [], availability: {}, prefs: {}, itineraries: {}, votes: {}, published: [], reviews: {} };
    const engine = createApiEngine({
      catalogue: [], load: () => empty, persist: () => {},
      getSessionUserId: () => null, latency: 0,
      fetchPlaces: async () => places, fetchDrafts: async () => drafts,
    });
    const listings = (await engine.listListings()).filter(l => !l.sample && ['osm', 'scraped'].includes(l.source?.kind));
    const fingerprint = createHash('sha256').update(JSON.stringify(listings)).digest('hex');
    if (fingerprint === accepted) return;
    await repository.syncListings(listings);
    accepted = fingerprint;
  }
  return () => pending ??= synchronize().finally(() => { pending = null; });
}
