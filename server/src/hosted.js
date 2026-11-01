// Trusted domain boundary. Only sanitized engine results leave this process.
import { randomUUID, randomBytes } from 'node:crypto';
import { createApiEngine } from '../../client/src/api/engine.js';
import { estimateTravel } from '../../client/src/lib/geo.js';

const PUBLIC = new Set(['listListings', 'getListing', 'previewHangout']);
const OPERATIONS = new Set([
  ...PUBLIC, 'profile', 'listUsers', 'updateProfile', 'listMyHangouts', 'createHangout',
  'updateHangout', 'getHangout', 'joinHangout', 'leaveHangout', 'setRequired', 'setStage',
  'renewInvite', 'saveAvailability', 'clearAvailability', 'savePreferences', 'getSlots',
  'previewSlot', 'lockSlot', 'unlockSlot', 'getPlan', 'generatePlan', 'setPlanStops', 'getAlternatives',
  'previewCustomStop', 'addCustomStop', 'previewStops', 'vote', 'finalizePlan', 'reopenVoting', 'addToShortlist',
  'removeFromShortlist', 'lateJoin', 'listDrafts', 'publishDraft', 'rejectDraft', 'unpublish',
]);
export function domainError(code, message) { return Object.assign(new Error(message), { code }); }

export function createHostedService({ repository, verifyToken, readDrafts, catalogue, travel, fetchPlaces }) {
  return {
    async execute({ token, operation, args = [] }) {
      if (!OPERATIONS.has(operation)) throw domainError('invalid', 'Unknown app operation.');
      if (!Array.isArray(args) || args.length > 4) throw domainError('invalid', 'Invalid operation arguments.');
      const identity = token ? await verifyToken(token) : null;
      if ((token && !identity) || (!identity && !PUBLIC.has(operation))) throw domainError('auth', 'Please sign in first.');
      // A conflict rehydrates and reruns the permission checks and computation. This
      // makes final-seat joins safe without retaining a transaction during routing.
      for (let attempt = 0; attempt < 3; attempt++) {
        const snapshot = await repository.snapshot({ actorId: identity?.id || null, operation, args });
        const state = snapshot.state;
        let dirty = false;
        const runtime = travel?.() || { travelFn: () => estimateTravel, prefetchLegs: async () => ({ live: false }) };
        const engine = createApiEngine({
          load: () => state, persist: () => { dirty = true; },
          uid: () => randomUUID(), token: () => randomBytes(24).toString('hex'),
          getSessionUserId: () => identity?.id || null, setSessionUserId: () => {},
          resetDemo: () => { throw domainError('forbidden', 'Demo reset is unavailable.'); },
          ...runtime, fetchDrafts: readDrafts, fetchPlaces,
          catalogue: snapshot.catalogue ?? catalogue ?? [], latency: 0,
        });
        let result;
        if (operation === 'profile') result = engine.currentUser();
        else if (operation === 'listUsers') result = engine.currentUser() ? [engine.currentUser()] : [];
        else result = await engine[operation](...args);
        if (identity && !engine.currentUser()) throw domainError('auth', 'Your profile is not ready. Please sign in again.');
        if (dirty) {
          try {
            await repository.commit({ actorId: identity?.id, operation, args, revision: snapshot.revision, state, before: snapshot.before });
          } catch (error) {
            if (error.code === 'conflict' && attempt < 2) continue;
            throw error;
          }
        }
        return result ?? null;
      }
      throw domainError('conflict', 'This plan changed. Refresh and try again.');
    },
  };
}
