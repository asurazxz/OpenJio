import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePrice, estimateSpend, fmtSpend, spendGap } from '../src/lib/algo/spend.js'

test('reads clear per-person prices', () => {
  assert.deepEqual(parsePrice('About $18 per person'), { low: 18, high: 18 })
  assert.deepEqual(parsePrice('About $28 per person for the conservatories'), { low: 28, high: 28 })
  assert.deepEqual(parsePrice('$12 entry'), { low: 12, high: 12 })
})

test('splits shared prices and reads free and ranges', () => {
  assert.deepEqual(parsePrice('$12 for two'), { low: 6, high: 6 })
  assert.deepEqual(parsePrice('Free'), { low: 0, high: 0 })
  assert.deepEqual(parsePrice('Free to browse'), { low: 0, high: 0 })
  assert.deepEqual(parsePrice('$15–20'), { low: 15, high: 20 })
  assert.deepEqual(parsePrice('$15-20'), { low: 15, high: 20 })
  assert.deepEqual(parsePrice('About $42 to $48 per person'), { low: 42, high: 48 })
  assert.deepEqual(parsePrice('Varies by facility, about $5 to $10'), { low: 5, high: 10 })
})

test('does not guess from vague or partial prices', () => {
  for (const t of ['Pay your own way', '', null, undefined, 'Free entry, food from $5', 'Free, with the National Orchid Garden about $5 extra', '$15 entry, drinks extra', '$10 to $15 per hour', '$8 to $12 per person per game', 'Prices vary']) {
    assert.equal(parsePrice(t), null, String(t))
  }
})

test('shows a total only when every stop has a price', () => {
  const ok = estimateSpend([{ priceText: 'About $18 per person' }, { priceText: '$12 for two' }, { priceText: 'Free' }])
  assert.equal(ok.known, true)
  assert.equal(ok.low, 24)
  assert.equal(fmtSpend(ok), 'about $24 each')
  const range = estimateSpend([{ priceText: '$15-20' }, { priceText: 'About $10 per person' }])
  assert.equal(fmtSpend(range), '$25–30 each')
  const gap = estimateSpend([{ priceText: 'About $18 per person' }, { priceText: 'Pay your own way' }])
  assert.equal(gap.known, false)
  assert.equal(fmtSpend(gap), null)
  assert.equal(spendGap(gap), '1 stop has no clear price')
  assert.equal(fmtSpend(estimateSpend([{ priceText: 'Free' }])), 'free')
  assert.equal(estimateSpend([]).known, false)
})
