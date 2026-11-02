// Per-person spend estimate from listings' free-text prices.
// Only text that states a clear per-person (or shared) amount is read. Anything vague, open-ended
// or partial ("from $5", "drinks extra", "per hour") is left as unknown, never guessed.

const NUMBER_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6 }

/**
 * Read one price text. Returns { low, high } in dollars per person, or null when it cannot be read safely.
 * "About $18 per person" -> 18, "$12 for two" -> 6, "Free" -> 0, "$15-20" -> 15 to 20.
 */
export function parsePrice(text) {
  if (typeof text !== 'string') return null
  const t = text.trim().replace(/[–—]/g, '-')
  if (!t) return null
  // Free, with nothing to pay on top.
  if (/^free\b/i.test(t) && !t.includes('$')) return { low: 0, high: 0 }
  // Open-ended or partial prices do not give a total.
  if (/\b(from|up to|extra|plus|upwards|onwards)\b|\bper (hour|hr|game|night|item|dish|drink|ride|session|minute)\b|\+/i.test(t)) return null
  if (/^free\b/i.test(t)) return null
  const money = /\$\s*(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*\$?\s*(\d+(?:\.\d+)?))?/gi
  const found = [...t.matchAll(money)]
  if (found.length !== 1) return null
  let low = Number(found[0][1])
  let high = found[0][2] !== undefined ? Number(found[0][2]) : low
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return null
  // "$12 for two": a shared price, split between the people named.
  const shared = t.match(/\bfor (two|three|four|five|six|[2-6])\b/i)
  if (shared) {
    const n = NUMBER_WORDS[shared[1].toLowerCase()] || Number(shared[1])
    low /= n
    high /= n
  }
  return { low, high }
}

/**
 * Total per-person spend across stops. `known` is true only when every stop has a readable price.
 * @returns {{known:boolean, low:number, high:number, unknownCount:number, count:number}}
 */
export function estimateSpend(listings) {
  let low = 0
  let high = 0
  let unknownCount = 0
  for (const l of listings) {
    const p = parsePrice(l?.priceText)
    if (!p) unknownCount += 1
    else {
      low += p.low
      high += p.high
    }
  }
  const known = listings.length > 0 && unknownCount === 0
  return { known, low: known ? low : 0, high: known ? high : 0, unknownCount, count: listings.length }
}

const dollars = (n) => (Number.isInteger(Math.round(n * 100) / 100) ? String(Math.round(n)) : n.toFixed(2))

/** "free", "about $46 each" or "$44-52 each"; null when the spend is not known. */
export function fmtSpend(spend) {
  if (!spend?.known) return null
  const lo = Math.round(spend.low)
  const hi = Math.round(spend.high)
  if (hi === 0) return 'free'
  if (lo === hi) return `about $${dollars(lo)} each`
  return `$${dollars(lo)}–${dollars(hi)} each`
}

/** Why the spend is missing: "1 stop has no clear price". */
export function spendGap(spend) {
  const n = spend?.unknownCount || 0
  return n === 1 ? '1 stop has no clear price' : `${n} stops have no clear price`
}
