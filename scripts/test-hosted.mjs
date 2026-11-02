#!/usr/bin/env node
// Mutating HTTP smoke: use only an isolated, disposable Compose database.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

if (process.env.OPENJIO_TEST_ALLOW_WRITES !== '1') {
  throw new Error('Account/planning smoke requires OPENJIO_TEST_ALLOW_WRITES=1 and a disposable test database.')
}

const base = new URL(process.env.OPENJIO_BASE_URL || 'http://localhost:8080')
if (!['localhost', '127.0.0.1', '::1'].includes(base.hostname) && !process.env.OPENJIO_ALLOW_REMOTE) {
  throw new Error('Refusing a non-local target. Set OPENJIO_ALLOW_REMOTE=1 only for a trusted test stack.')
}
const basePath = base.pathname.replace(/\/$/, '')
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
const password = `Jio-${randomBytes(18).toString('hex')}!`

async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(new URL(`${basePath}${path}`, base), {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  })
  const data = await response.json().catch(() => null)
  return { response, data }
}
async function signup(label) {
  const email = `openjio-smoke-${label}-${suffix}@example.test`
  const { response, data } = await request('/supabase/auth/v1/signup', {
    method: 'POST', body: { email, password, data: { display_name: `Smoke ${label}` } },
  })
  assert.equal(response.ok, true, `Auth signup failed (${response.status})`)
  assert.ok(data?.access_token && data?.user?.id, 'Auth did not return a confirmed session')
  return { token: data.access_token, id: data.user.id }
}
async function call(actor, operation, ...args) {
  const { response, data } = await request(`/api/app/${operation}`, { method: 'POST', token: actor?.token, body: { args } })
  if (!response.ok) throw Object.assign(new Error(`${operation} failed (${response.status}): ${data?.message || data?.error || 'request rejected'}`), { errorCode: data?.error })
  return data.result
}
async function expectHttpDenied(path, options, label) {
  const { response } = await request(path, options)
  assert.ok([401, 403].includes(response.status), `${label} must be denied (received ${response.status})`)
}

const [host, member, outsider] = await Promise.all([signup('host'), signup('member'), signup('outsider')])
const listings = await call(host, 'listListings')
assert.ok(listings.every(item => item.sample !== true), 'A demo/sample listing leaked into the shared catalogue')
const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const minutes = value => {
  const [hours, mins] = value.split(':').map(Number)
  return hours * 60 + mins
}
let day, start, end, liveVenue
// Use a weekday where an actual active catalogue activity has opening hours;
// keep the date within the domain's seven-day collection range.
for (let offset = 14; offset <= 20 && !liveVenue; offset++) {
  const candidateDate = new Date(Date.now() + offset * 86400000)
  const key = dayKeys[candidateDate.getUTCDay()]
  for (const listing of listings) {
    if (listing.type !== 'place' || listing.kind !== 'activity' || listing.routeReady === false || listing.sample === true) continue
    const windows = listing.openingHours?.[key] || []
    const duration = Math.max(60, Number(listing.durationMins) || 60)
    const window = windows.find(([opens, closes]) => minutes(closes) - minutes(opens) >= duration + 30)
    if (!window) continue
    const candidateStart = Date.parse(`${candidateDate.toISOString().slice(0, 10)}T${window[0]}:00+08:00`)
    const candidateEnd = candidateStart + (duration + 30) * 60000
    if (candidateEnd - candidateStart > 12 * 60 * 60000) continue
    day = candidateDate.toISOString().slice(0, 10)
    start = candidateStart
    end = candidateEnd
    liveVenue = listing
    break
  }
}
if (!liveVenue) {
  const future = new Date(Date.now() + 14 * 86400000)
  day = future.toISOString().slice(0, 10)
  start = Date.parse(`${day}T14:00:00+08:00`)
  end = Date.parse(`${day}T19:00:00+08:00`)
  console.log('Optional live listing persistence skipped: no active activity has hours in the next seven days.')
}
const publicDate = new Date(`${day}T12:00:00+08:00`)
publicDate.setUTCDate(publicDate.getUTCDate() + 1)
const nextDay = publicDate.toISOString().slice(0, 10)
const hangout = await call(host, 'createHangout', { title: `Local smoke ${suffix}`, area: 'bugis', dateFrom: day, dateTo: day, mealWanted: false })
await call(member, 'joinHangout', { token: hangout.inviteToken })
await call(host, 'updateProfile', { interests: { games: 1 } })
await call(host, 'updateHangout', hangout.id, { meetingPoint: 'Smoke test meeting point' })
assert.equal((await call(host, 'getHangout', hangout.id)).hangout.meetingPoint, 'Smoke test meeting point')
assert.equal((await call(member, 'getHangout', hangout.id)).hangout.meetingPoint, 'Smoke test meeting point')
const invite = await call(null, 'previewHangout', { token: hangout.inviteToken })
assert.equal(invite.id, hangout.id)
assert.ok(!('meetingPoint' in invite), 'Invite preview exposed exact meeting point')
await expectDenied(() => call(member, 'updateHangout', hangout.id, { meetingPoint: 'Spoofed point' }), 'forbidden')
await call(host, 'saveAvailability', hangout.id, [{ start, end }])
await call(member, 'saveAvailability', hangout.id, [{ start, end }])
assert.equal((await call(host, 'getSlots', hangout.id)).responded, 2)
await expectDenied(() => call(outsider, 'getHangout', hangout.id), 'forbidden')
await call(host, 'lockSlot', hangout.id, { start, end })
const generated = await call(host, 'generatePlan', hangout.id, { method: 'greedy', relax: 'fewer_stops' })
assert.equal(typeof generated.ok, 'boolean', 'Plan generation returned an unexpected result')
if (liveVenue) {
  await call(host, 'setPlanStops', hangout.id, [liveVenue.id])
  const livePlan = await call(member, 'getPlan', hangout.id)
  assert.equal(livePlan.stops[0]?.listingId, liveVenue.id, 'Live listing did not persist through its SQL foreign key')
}
const custom = await call(host, 'addCustomStop', hangout.id, {
  name: `Smoke café ${suffix}`, address: '12 Test Street, Singapore', lat: 1.298, lng: 103.851,
  durationMins: 60, kind: 'activity', providerId: `smoke-${suffix}`, provider: 'geoapify', openingHoursText: 'Mo-Su 10:00-22:00',
})
assert.ok(custom?.id, 'Custom stop was not created')
await call(host, 'setPlanStops', hangout.id, [custom.id])
const plan = await call(member, 'getPlan', hangout.id)
assert.ok(plan.stops.some(stop => stop.listingId === custom.id), 'Custom stop did not round-trip to a member')
await call(member, 'vote', hangout.id, plan.stops[0].id, 1)
await call(host, 'finalizePlan', hangout.id)
assert.equal((await call(host, 'getHangout', hangout.id)).hangout.stage, 'final')

// Exercise the final-seat transaction with two independent signed-in actors.
const publicHangout = await call(host, 'createHangout', {
  title: `Local seat smoke ${suffix}`, area: 'bugis', visibility: 'public', capacity: 2,
  slotStart: Date.parse(`${nextDay}T14:00:00+08:00`), slotEnd: Date.parse(`${nextDay}T19:00:00+08:00`),
})
const joins = await Promise.all([member, outsider].map(actor => request('/api/app/joinHangout', {
  method: 'POST', token: actor.token, body: { args: [{ id: publicHangout.id }] },
})))
assert.equal(joins.filter(item => item.response.ok).length, 1, 'Exactly one public final seat should be claimed')
assert.equal((await call(host, 'getHangout', publicHangout.id)).members.length, 2)

let runtimeKey = process.env.OPENJIO_ANON_KEY
if (!runtimeKey) {
  const { response, data } = await request('/config.json')
  assert.equal(response.ok, true, 'Runtime public config could not be loaded')
  runtimeKey = data?.supabaseAnonKey
  assert.ok(runtimeKey, 'Runtime public config is missing the anon key')
}
const rpcPath = '/supabase/rest/v1/rpc/openjio_snapshot'
const rpcBody = { p_actor: null, p_operation: 'listListings', p_args: [] }
await expectHttpDenied(rpcPath, {
  method: 'POST', headers: { apikey: runtimeKey, Authorization: `Bearer ${runtimeKey}` }, body: rpcBody,
}, 'Anon application RPC')
await expectHttpDenied(rpcPath, {
  method: 'POST', token: member.token, headers: { apikey: runtimeKey }, body: rpcBody,
}, 'Authenticated application RPC')
await expectHttpDenied(`/supabase/rest/v1/profiles?id=eq.${encodeURIComponent(member.id)}`, {
  method: 'PATCH', token: member.token, headers: { apikey: runtimeKey, Prefer: 'return=minimal' }, body: { reviewer: true },
}, 'Browser table write')
console.log('Local Supabase HTTP smoke passed. Created three accounts and two outings; they remain in the database.')

async function expectDenied(action, code) {
  let error
  try { await action() } catch (caught) { error = caught }
  assert.ok(error, `Expected ${code} access denial`)
  assert.equal(error.errorCode, code, `Expected ${code} denial`)
}
