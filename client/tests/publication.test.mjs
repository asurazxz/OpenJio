import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } }
globalThis.localStorage = memory()
globalThis.sessionStorage = memory()
const api = await import('../src/api/index.js')
const { load } = await import('../src/api/store.js')
const draft = { id: 'publication-fixture', type: 'deal', title: 'Reviewed deal', area: 'city-hall', validity: { dateFrom: '2026-11-01', dateTo: '2026-11-30' } }
// Publishing reads the pipeline's copy of the draft, so serve it from the drafts endpoint.
const serveDraft = () => { globalThis.fetch = async () => ({ ok: true, json: async () => ({ [draft.id]: { ...draft, status: 'draft' } }) }) }
beforeEach(async () => { serveDraft(); api.resetDemo(); await api.signIn('u-mei') })
test('publishing incomplete draft keeps it manual-only with no centroid or default duration', async () => {
  const result = await api.publishDraft(draft)
  assert.equal(result.routeReady, false)
  assert.equal(result.lat, null)
  assert.equal(result.durationMins, null)
})
test('route-ready validation runs at API boundary', async () => {
  await assert.rejects(() => api.publishDraft({ ...draft, routeReady: true }), (error) => error.code === 'invalid')
  assert.equal(load().published.some((l) => l.id === `pub-${draft.id}`), false)
})
test('unpublishing returns review status to pending', async () => {
  const result = await api.publishDraft(draft)
  await api.unpublish(result.id)
  assert.equal(load().reviews[draft.id], undefined)
  assert.equal(load().published.some((l) => l.id === result.id), false)
})
test('rejecting a formerly published draft removes its public listing', async () => {
  const result = await api.publishDraft(draft)
  await api.rejectDraft(draft.id)
  assert.equal(load().published.some((l) => l.id === result.id), false)
  assert.equal(load().reviews[draft.id].status, 'rejected')
})
test('retired source drafts hide from review and withdraw stale publication while retaining review audit', async () => {
  const listing = await api.publishDraft(draft)
  const fetchBefore = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ [draft.id]: { ...draft, status: 'retired', retiredReason: 'source-no-longer-listing', retiredAt: '2026-10-29T12:00:00+08:00' } }) })
  try {
    const result = await api.listDrafts()
    assert.equal(result.drafts.some((d) => d.id === draft.id), false)
    assert.equal(result.published.some((l) => l.id === listing.id), false)
    assert.equal(load().reviews[draft.id].status, 'retired')
    assert.equal(load().reviews[draft.id].previousReview.status, 'published')
    await api.listDrafts()
    assert.equal(load().reviews[draft.id].previousReview.status, 'published')
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ [draft.id]: { ...draft, status: 'draft' } }) })
    assert.equal((await api.listDrafts()).drafts[0].review, null)
  } finally { globalThis.fetch = fetchBefore }
})
