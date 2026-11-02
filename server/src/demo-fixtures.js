// Explicitly synthetic fixtures for the isolated database-backed demo only.
import { randomUUID, randomBytes } from 'node:crypto';
import { createApiEngine } from '../../client/src/api/engine.js';
import { LISTINGS } from '../../client/src/data/seed-listings.js';
import { PERSONAS } from '../../client/src/data/personas.js';
import { sgStartOfDay, sgDateKey, sgParts, toIso, DAY, HOUR, MIN } from '../../client/src/lib/time.js';
import { estimateTravel } from '../../client/src/lib/geo.js';

export const DEMO_ACCOUNTS = [
  { key: 'andrew', email: 'andrew@demo.openjio.test', name: 'Andrew', homeArea: 'bugis', interests: { food: 1, arts: 0.8, games: 0.7 } },
  ...PERSONAS.slice(0, 5).map(p => ({ key: p.id.slice(2), email: `${p.id.slice(2)}@demo.openjio.test`, name: p.name, homeArea: p.homeArea, interests: p.interests })),
];

export async function buildDemoFixture({ users, now = Date.now() }) {
  if (!Array.isArray(users) || users.length !== 6) throw new Error('Exactly six demo accounts are required.');
  if (new Set(users.map(u => u.id)).size !== 6) throw new Error('Demo identities must be unique.');
  if (DEMO_ACCOUNTS.some(a => !users.some(u => u.key === a.key && u.id))) throw new Error('All six demo identities must be present.');
  const anchor = sgStartOfDay(now) + 14 * DAY;
  const at = (day, hour, minute = 0) => anchor + day * DAY + hour * HOUR + minute * MIN;
  let eventIndex = 0;
  const catalogue = structuredClone(LISTINGS).map(l => {
    l.id = `demo-${l.id}`;
    l.status = 'published'; l.sample = true;
    l.source = { kind: 'curated', name: 'OpenJio demo sample — not a real offer', url: null, retrievedAt: toIso(now), verifiedAt: toIso(now) };
    if (l.startsAt) {
      const start = Date.parse(l.startsAt), end = Date.parse(l.endsAt);
      const p = sgParts(start);
      l.startsAt = toIso(at(eventIndex++ % 7, p.hour, p.minute));
      l.endsAt = toIso(Date.parse(l.startsAt) + (end - start));
    }
    if (l.validity) l.validity = { ...l.validity, dateFrom: sgDateKey(anchor), dateTo: sgDateKey(anchor + 30 * DAY) };
    return l;
  });
  const state = {
    version: 1, users: users.map(u => ({ ...u })), hangouts: [], members: [],
    availability: {}, prefs: {}, itineraries: {}, votes: {}, published: [], reviews: {},
  };
  const ids = Object.fromEntries(users.map(u => [u.key, u.id]));
  let actor = ids.andrew;
  const api = createApiEngine({
    load: () => state, persist() {}, uid: () => randomUUID(), token: () => randomBytes(24).toString('hex'),
    getSessionUserId: () => actor, setSessionUserId: id => { actor = id; }, resetDemo() {},
    catalogue, travelFn: () => estimateTravel, prefetchLegs: async () => ({}), latency: 0,
  });
  const act = key => { actor = ids[key]; api.session.userId = actor; };
  async function join(h, people) {
    for (const person of people) { act(person); await api.joinHangout({ token: h.inviteToken }); }
  }
  async function availability(h, people, day) {
    for (const person of people) {
      act(person);
      await api.saveAvailability(h.id, [{ start: at(day, 12), end: at(day, 22) }]);
      await api.savePreferences(h.id, { food: 0.8, arts: 0.6 });
    }
  }
  async function makePlan(h, owner, people, day, final = false) {
    act(owner);
    if (!h.lockedSlot) await api.lockSlot(h.id, { start: at(day, 13), end: at(day, 19) });
    const generated = await api.generatePlan(h.id);
    if (!generated.ok) throw new Error(`Demo itinerary did not fit: ${h.title}`);
    const plan = await api.getPlan(h.id);
    if (plan.stops.length < 2) throw new Error(`Demo itinerary needs at least two stops: ${h.title}`);
    for (const person of people) {
      act(person);
      for (const [i, stop] of plan.stops.entries()) await api.vote(h.id, stop.id, person === 'jun' && i === 1 ? -1 : 1);
    }
    act(owner);
    if (final) await api.finalizePlan(h.id);
  }
  act('andrew');
  const collecting = await api.createHangout({ title: 'Find a time with the crew', area: 'city-hall', dateFrom: sgDateKey(anchor), dateTo: sgDateKey(anchor + 2 * DAY), interests: ['food', 'arts', 'games'] });
  await join(collecting, ['mei', 'arjun', 'farah', 'jun']);
  await availability(collecting, ['andrew', 'mei', 'arjun', 'farah'], 0);
  act('andrew'); await api.setRequired(collecting.id, ids.farah, true);
  await api.addToShortlist(collecting.id, 'demo-pl-artscience-museum');

  act('andrew');
  const voting = await api.createHangout({ title: 'Vote on our city afternoon', area: 'city-hall', dateFrom: sgDateKey(anchor + DAY), dateTo: sgDateKey(anchor + DAY), interests: ['arts', 'food'] });
  await join(voting, ['mei', 'arjun', 'farah', 'jun']);
  await availability(voting, ['andrew', 'mei', 'arjun', 'farah', 'jun'], 1);
  await makePlan(voting, 'andrew', ['mei', 'jun'], 1);

  act('andrew');
  const confirmed = await api.createHangout({ title: 'Confirmed makan and museum', area: 'city-hall', dateFrom: sgDateKey(anchor + 2 * DAY), dateTo: sgDateKey(anchor + 2 * DAY), interests: ['food', 'museums'] });
  await join(confirmed, ['mei', 'farah', 'priya']);
  await availability(confirmed, ['andrew', 'mei', 'farah', 'priya'], 2);
  await makePlan(confirmed, 'andrew', ['andrew', 'mei', 'farah', 'priya'], 2, true);
  await api.updateHangout(confirmed.id, { meetingPoint: 'City Hall MRT, Exit B' });

  act('priya');
  const open = await api.createHangout({ title: 'Open Jio: Chinatown food and culture', area: 'chinatown', visibility: 'public', capacity: 6, slotStart: at(3, 13), slotEnd: at(3, 19), interests: ['food', 'markets', 'arts'], description: 'Demo outing. Easy-paced food and culture; everyone is welcome.' });
  await join(open, ['jun', 'mei']);
  await makePlan(open, 'priya', ['priya', 'jun'], 3);

  act('andrew');
  const solo = await api.createHangout({ title: 'My solo afternoon', mode: 'solo', area: 'city-hall', slotStart: at(4, 13), slotEnd: at(4, 19), interests: ['arts', 'cafes'] });
  await makePlan(solo, 'andrew', [], 4, true);
  // Record a deterministic scenario timestamp, independent of how long generation took.
  for (const h of state.hangouts) { h.createdAt = now; h.updatedAt = now; }
  return { state, catalogue, anchorDate: sgDateKey(anchor), resetAt: toIso(now) };
}
