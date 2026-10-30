import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as weather from '../src/lib/weather.js'
const fixtures = JSON.parse(await readFile(new URL('./fixtures/weather.json', import.meta.url)))
const city = { lat: 1.292, lng: 103.844 }
const at = (date) => Date.parse(`${date}+08:00`)
test('matching two-hour validity wins and carries source, issue and coverage', () => {
  const result = weather.selectForecast(fixtures, city, at('2026-10-29T22:00:00'))
  assert.equal(result.horizon, '2-hour')
  assert.equal(result.forecast, 'Cloudy')
  assert.equal(result.issuedAt, '2026-10-29T21:30:00+08:00')
  assert.equal(result.source, 'NEA via data.gov.sg')
  assert.equal(result.validTo, '2026-10-29T23:30:00+08:00')
})
test('tomorrow outing uses matching regional 24-hour period, not current two hours', () => {
  const result = weather.selectForecast(fixtures, city, at('2026-10-30T14:00:00'))
  assert.equal(result.horizon, '24-hour')
  assert.equal(result.area, 'Central region')
  assert.equal(result.forecast, 'Partly Cloudy (Day)')
})
test('four-day timestamp selects actual outing date and nested forecast and temperatures', () => {
  const result = weather.selectForecast(fixtures, city, at('2026-11-01T18:00:00'))
  assert.equal(result.horizon, '4-day outlook')
  assert.equal(result.forecast, 'Afternoon thundery showers')
  assert.deepEqual(result.temperature, { low: 25, high: 33 })
  assert.equal(result.wet, true)
  assert.equal(result.validFrom, '2026-11-01T00:00:00+08:00')
  assert.equal(Date.parse(result.validTo) - Date.parse(result.validFrom), 86400000)
  assert.equal(result.area, 'Singapore-wide')
})
test('outside the published forecast horizon is explicitly unavailable', () => {
  const result = weather.selectForecast(fixtures, city, at('2026-11-10T14:00:00'))
  assert.equal(result.available, false)
  assert.match(result.reason, /no published.*outing/i)
})
test('two-hour coverage ends exclusively and malformed payloads never become weather', () => {
  assert.equal(weather.selectForecast({ twoHour: fixtures.twoHour }, city, at('2026-10-29T23:30:00')).available, false)
  assert.equal(weather.selectForecast({ twoHour: { data: {} } }, city, at('2026-10-29T22:00:00')).available, false)
})
test('forecast client requests latest v2 issuances without a future date query', async () => {
  const requested = []
  const fetchImpl = async (url) => { requested.push(url); return { ok: true, json: async () => url.endsWith('two-hr-forecast') ? fixtures.twoHour : url.endsWith('twenty-four-hr-forecast') ? fixtures.day : fixtures.fourDay } }
  const result = await weather.forecastNear(city, at('2026-11-01T18:00:00'), { fetchImpl, fresh: true })
  assert.equal(result.horizon, '4-day outlook')
  assert.equal(requested.length, 3)
  assert.ok(requested.every((url) => url.startsWith('https://api-open.data.gov.sg/v2/real-time/api/') && !url.includes('?')))
})
test('outside a successfully loaded four-day horizon stays unavailable if short-range endpoints fail', async () => {
  const fetchImpl = async (url) => ({ ok: url.endsWith('four-day-outlook'), json: async () => fixtures.fourDay })
  const result = await weather.forecastNear(city, at('2026-11-10T14:00:00'), { fetchImpl, fresh: true })
  assert.equal(result.available, false)
  assert.match(result.reason, /no published.*outing/i)
})
test('a complete weather transport failure remains retryable rather than claiming no forecast exists', async () => {
  await assert.rejects(() => weather.forecastNear(city, at('2026-11-01T18:00:00'), { fetchImpl: async () => ({ ok: false }), fresh: true }), /try again/i)
})
