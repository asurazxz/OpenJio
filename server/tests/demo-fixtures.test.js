import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoFixture, DEMO_ACCOUNTS } from '../src/demo-fixtures.js';

const users = DEMO_ACCOUNTS.map((account, i) => ({ ...account, id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}` }));

for (const now of ['2026-11-03T14:00:00+08:00', '2026-12-25T23:59:00+08:00', '2028-02-16T00:05:00+08:00']) {
  test(`demo reset builds a usable future planner fixture relative to ${now}`, async () => {
    const fixture = await buildDemoFixture({ users, now: Date.parse(now) });
    const { state, catalogue, anchorDate } = fixture;
    const today = new Date(Date.parse(now) + 8 * 3600e3).toISOString().slice(0, 10);
    assert.equal((Date.parse(anchorDate) - Date.parse(today)) / 864e5, 14);
    assert.equal(state.users.length, 6);
    assert.equal(state.hangouts.length, 5);
    assert.ok(state.hangouts.some(h => h.stage === 'collecting'));
    assert.ok(state.hangouts.some(h => h.stage === 'voting' && h.visibility === 'private'));
    assert.ok(state.hangouts.some(h => h.stage === 'final'));
    assert.ok(state.hangouts.some(h => h.visibility === 'public'));
    assert.ok(state.hangouts.some(h => h.mode === 'solo'));
    for (const h of state.hangouts) {
      if (h.dateFrom) assert.ok(h.dateFrom >= anchorDate);
      const members = state.members.filter(m => m.hangoutId === h.id);
      assert.equal(members.filter(m => m.role === 'host').length, 1);
      if (h.stage !== 'collecting') {
        assert.ok(h.lockedSlot.start > Date.parse(now));
        const itinerary = state.itineraries[h.id];
        assert.ok(itinerary.stops.length >= 2, `${h.title} must have a usable itinerary`);
        assert.ok(itinerary.stops.every(s => s.scheduledStart >= h.lockedSlot.start && s.scheduledEnd <= h.lockedSlot.end));
      }
    }
    assert.ok(Object.keys(state.votes).length > 0);
    assert.ok(Object.values(state.availability).some(group => Object.keys(group).length >= 3));
    assert.ok(catalogue.some(l => l.type === 'event'));
    assert.ok(catalogue.some(l => l.type === 'deal'));
    assert.ok(catalogue.every(l => l.sample === true));
    for (const l of catalogue) {
      if (l.startsAt) assert.ok(Date.parse(l.startsAt) >= Date.parse(`${anchorDate}T00:00:00+08:00`));
      if (l.validity) assert.ok(l.validity.dateTo >= anchorDate);
    }
  });
}

test('fixture validation rejects incomplete or duplicate account identities', async () => {
  await assert.rejects(() => buildDemoFixture({ users: users.slice(1) }), /six/i);
  await assert.rejects(() => buildDemoFixture({ users: users.map(u => ({ ...u, id: users[0].id })) }), /unique/i);
});
