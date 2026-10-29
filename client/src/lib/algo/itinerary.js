// Constrained itinerary generation (R4).
// Hard checks: slot boundaries, opening/event windows, deal validity, travel time,
// meal coverage when wanted, no back-to-back meals. Unknown hours are never treated as open.
// Search: beam search over stop sequences, with a greedy baseline for comparison.

import { estimateTravel, haversineKm } from '../geo.js'
import { MIN, minutesOfDay, fmtTime, fmtDuration } from '../time.js'
import { scheduleAt, isVerifiedDeal } from './validity.js'

export const DEFAULT_OPTIONS = {
  maxStops: 4,
  minStops: 2,
  mealWanted: true,
  beamWidth: 12,
  radiusKm: 6,
  poolSize: 40,
  maxWaitMins: 40,
  excludeIds: [],
}

export const WEIGHTS = {
  satisfaction: 0.6,
  variety: 0.06,
  deal: 0.08,
  coverage: 0.12,
  meal: 0.12,
  travel: 0.35,
  wait: 0.25,
}

const MEAL_WINDOWS = [
  { name: 'lunch', start: 11 * 60 + 30, end: 14 * 60 },
  { name: 'dinner', start: 17 * 60 + 30, end: 20 * 60 + 30 },
]

/** 0..1 match between one member's interest weights and a listing. Main interest counts fully. */
export function memberScore(listing, member) {
  const weights = member.interests || {}
  let best = 0
  ;(listing.interests || []).forEach((slug, i) => {
    const w = (weights[slug] || 0) * (i === 0 ? 1 : 0.7)
    if (w > best) best = w
  })
  return best
}

export function groupScore(listing, members) {
  if (!members.length) return { avg: 0.5, min: 0.5, per: {} }
  const per = {}
  for (const m of members) per[m.id] = memberScore(listing, m)
  const vals = Object.values(per)
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, min: Math.min(...vals), per }
}

/** Meal windows the slot covers for at least an hour. */
export function requiredMeals(slot) {
  const s = minutesOfDay(slot.start)
  const e = s + Math.round((slot.end - slot.start) / MIN)
  return MEAL_WINDOWS.filter((w) => Math.min(e, w.end) - Math.max(s, w.start) >= 60)
}

function coversMeal(stop, w) {
  if (stop.listing.kind !== 'meal') return false
  const s = minutesOfDay(stop.start)
  const e = s + Math.round((stop.end - stop.start) / MIN)
  return Math.min(e, w.end) - Math.max(s, w.start) >= 30
}

function makeCtx(input) {
  const options = { ...DEFAULT_OPTIONS, ...(input.options || {}) }
  const travel = input.travel || estimateTravel
  const meals = options.mealWanted ? requiredMeals(input.slot) : []
  return { ...input, options, travel, meals, slotLen: input.slot.end - input.slot.start }
}

/** Candidate pool near the start point, best individual matches first, with enough meals kept. */
export function buildPool(candidates, ctx) {
  const { start, members, options } = ctx
  const usable = candidates.filter(
    (c) => c.status !== 'draft' && !options.excludeIds.includes(c.id) && c.lat != null && c.lng != null,
  )
  const pick = (radius) =>
    usable
      .map((c) => {
        const d = haversineKm(start, c)
        return { c, d, pre: groupScore(c, members).avg * 0.7 + Math.max(0, 1 - d / radius) * 0.3 }
      })
      .filter((x) => x.d <= radius)
  let scored = pick(options.radiusKm)
  if (scored.length < 12) scored = pick(options.radiusKm * 2)
  scored.sort((a, b) => b.pre - a.pre || a.c.id.localeCompare(b.c.id))
  const meals = scored.filter((x) => x.c.kind === 'meal').slice(0, 10)
  const rest = scored.filter((x) => !meals.includes(x)).slice(0, options.poolSize - meals.length)
  return [...meals, ...rest].map((x) => x.c)
}

/** Try appending a listing to a partial plan. Returns the new stop or null. */
function extend(state, listing, ctx) {
  const leg = ctx.travel(state.pos, listing)
  const arrive = state.time + leg.mins * MIN
  const sched = scheduleAt(listing, arrive)
  if (!sched.ok) return null
  if (sched.waitMins > ctx.options.maxWaitMins) return null
  if (sched.end > ctx.slot.end) return null
  const last = state.stops[state.stops.length - 1]
  if (last && last.listing.kind === 'meal' && listing.kind === 'meal') return null
  return {
    listingId: listing.id,
    listing,
    start: sched.start,
    end: sched.end,
    travelMins: leg.mins,
    travelMode: leg.mode,
    travelEstimate: leg.estimate !== false,
    waitMins: sched.waitMins || 0,
  }
}

/** Plan score with its components, so the UI and evaluation can explain it. */
export function scorePlan(stops, ctx) {
  const n = stops.length
  if (!n) return { total: -1, parts: {} }
  const members = ctx.members.length ? ctx.members : [{ id: 'anyone', interests: {} }]
  const perMember = members.map((m) => stops.reduce((a, s) => a + memberScore(s.listing, m), 0) / n)
  const avgSat = perMember.reduce((a, b) => a + b, 0) / perMember.length
  const minSat = Math.min(...perMember)
  const satisfaction = 0.6 * avgSat + 0.4 * minSat
  const variety = new Set(stops.map((s) => s.listing.interests?.[0])).size / n
  const deal = Math.min(1, stops.filter((s) => isVerifiedDeal(s.listing)).length * 0.5)
  const coverage = (stops[n - 1].end - ctx.slot.start) / ctx.slotLen
  const travelMins = stops.reduce((a, s) => a + s.travelMins, 0)
  const waitMins = stops.reduce((a, s) => a + s.waitMins, 0)
  const travel = (travelMins * MIN) / ctx.slotLen
  const wait = (waitMins * MIN) / ctx.slotLen
  const meal = ctx.meals.length ? ctx.meals.filter((w) => stops.some((s) => coversMeal(s, w))).length / ctx.meals.length : 1
  const W = WEIGHTS
  const total =
    W.satisfaction * satisfaction +
    W.variety * variety +
    W.deal * deal +
    W.coverage * coverage +
    W.meal * meal -
    W.travel * travel -
    W.wait * wait
  return {
    total: Math.round(total * 10000) / 10000,
    parts: { avgSat, minSat, satisfaction, variety, deal, coverage, meal, travelMins, waitMins },
  }
}

function mealsSatisfied(stops, ctx) {
  return ctx.meals.every((w) => stops.some((s) => coversMeal(s, w)))
}

function finalize(stops, ctx, method) {
  const score = scorePlan(stops, ctx)
  return { ok: true, method, stops, score: score.total, parts: score.parts, reasons: explain(stops, score.parts, ctx) }
}

/** Beam search over stop sequences. */
export function generateItinerary(input) {
  const ctx = makeCtx(input)
  const pool = buildPool(input.candidates, ctx)
  if (ctx.options.method === 'greedy') return greedyItinerary(input, pool)

  let beam = [{ stops: [], time: ctx.slot.start, pos: ctx.start, ids: new Set() }]
  const finished = []
  for (let depth = 0; depth < ctx.options.maxStops; depth++) {
    const next = []
    const seen = new Set()
    for (const state of beam) {
      for (const listing of pool) {
        if (state.ids.has(listing.id)) continue
        const stop = extend(state, listing, ctx)
        if (!stop) continue
        const stops = [...state.stops, stop]
        const key = stops.map((s) => s.listingId).join('>')
        if (seen.has(key)) continue
        seen.add(key)
        const s = { stops, time: stop.end, pos: listing, ids: new Set([...state.ids, listing.id]) }
        s.score = scorePlan(stops, ctx).total
        next.push(s)
      }
    }
    if (!next.length) break
    next.sort((a, b) => b.score - a.score || a.stops.map((x) => x.listingId).join().localeCompare(b.stops.map((x) => x.listingId).join()))
    beam = next.slice(0, ctx.options.beamWidth)
    finished.push(...beam)
  }

  const complete = finished
    .filter((s) => s.stops.length >= ctx.options.minStops && mealsSatisfied(s.stops, ctx))
    .sort((a, b) => b.score - a.score)
  if (!complete.length) return { ok: false, method: 'beam', stops: [], ...diagnose(pool, ctx, input.candidates) }
  return finalize(complete[0].stops, ctx, 'beam')
}

/** Baseline: repeatedly take the feasible stop with the highest group interest. Ignores meals and travel cost. */
export function greedyItinerary(input, pool = null) {
  const ctx = makeCtx(input)
  const candidates = pool || buildPool(input.candidates, ctx)
  const state = { stops: [], time: ctx.slot.start, pos: ctx.start, ids: new Set() }
  for (let i = 0; i < ctx.options.maxStops; i++) {
    let best = null
    for (const listing of candidates) {
      if (state.ids.has(listing.id)) continue
      const stop = extend(state, listing, ctx)
      if (!stop) continue
      const g = groupScore(listing, ctx.members).avg
      if (!best || g > best.g || (g === best.g && stop.travelMins < best.stop.travelMins)) best = { stop, g }
    }
    if (!best) break
    state.stops.push(best.stop)
    state.time = best.stop.end
    state.pos = best.stop.listing
    state.ids.add(best.stop.listingId)
  }
  if (state.stops.length < ctx.options.minStops) {
    return { ok: false, method: 'greedy', stops: state.stops, ...diagnose(candidates, ctx, input.candidates) }
  }
  return finalize(state.stops, ctx, 'greedy')
}

/**
 * Recompute times for a fixed sequence of listings (manual edits, swaps, final validation).
 * Stops keep a best-effort time even when a check fails; failures are listed in `issues`.
 */
export function retime(listings, input) {
  const ctx = makeCtx(input)
  const stops = []
  const issues = []
  let time = ctx.slot.start
  let pos = ctx.start
  listings.forEach((listing, index) => {
    const leg = ctx.travel(pos, listing)
    const arrive = time + leg.mins * MIN
    const sched = scheduleAt(listing, arrive)
    const start = sched.start ?? arrive
    const end = sched.end ?? arrive + (listing.durationMins || 60) * MIN
    if (!sched.ok) {
      const type = sched.unknown ? 'unknown_hours' : sched.dealInvalid ? 'deal_invalid' : listing.type === 'event' ? 'event_missed' : 'closed'
      issues.push({ index, type, message: `${listing.title}: ${sched.reason}` })
    } else if (sched.waitMins > ctx.options.maxWaitMins) {
      issues.push({ index, type: 'long_wait', message: `${listing.title}: ${fmtDuration(sched.waitMins)} wait before it starts` })
    }
    if (end > ctx.slot.end) {
      issues.push({ index, type: 'over_time', message: `${listing.title} ends at ${fmtTime(end)}, after the slot ends` })
    }
    const prev = stops[stops.length - 1]
    if (prev && prev.listing.kind === 'meal' && listing.kind === 'meal') {
      issues.push({ index, type: 'double_meal', message: 'Two meals in a row' })
    }
    stops.push({
      listingId: listing.id,
      listing,
      start,
      end,
      travelMins: leg.mins,
      travelMode: leg.mode,
      travelEstimate: leg.estimate !== false,
      waitMins: sched.waitMins || 0,
    })
    time = end
    pos = listing
  })
  if (ctx.meals.length && stops.length) {
    for (const w of ctx.meals) {
      if (!stops.some((s) => coversMeal(s, w))) {
        issues.push({ index: -1, type: 'no_meal', message: `No meal stop around ${w.name} time` })
      }
    }
  }
  const score = stops.length ? scorePlan(stops, ctx) : { total: 0, parts: {} }
  return { stops, issues, ok: issues.length === 0, score: score.total, parts: score.parts, reasons: stops.length ? explain(stops, score.parts, ctx) : [] }
}

/** Alternatives for one stop that keep the whole plan feasible, best first. */
export function alternativesFor(listings, index, input, k = 3) {
  const ctx = makeCtx(input)
  const pool = buildPool(input.candidates, ctx)
  const current = listings[index]
  const base = retime(listings, input)
  const used = new Set(listings.map((l) => l.id))
  const options = []
  for (const cand of pool) {
    if (used.has(cand.id) || cand.kind !== current.kind) continue
    const trial = listings.slice()
    trial[index] = cand
    const r = retime(trial, input)
    if (!r.ok) continue
    const g = groupScore(cand, ctx.members)
    const why = []
    const curG = groupScore(current, ctx.members)
    if (g.avg > curG.avg + 0.05) why.push('Better interest match')
    if (r.parts.travelMins < base.parts.travelMins - 4) why.push(`${base.parts.travelMins - r.parts.travelMins} min less travel`)
    if (isVerifiedDeal(cand)) why.push('Has a verified deal')
    if (!why.length) why.push('Fits the same time')
    options.push({ listing: cand, score: r.score, delta: Math.round((r.score - base.score) * 1000) / 1000, reasons: why })
  }
  options.sort((a, b) => b.score - a.score || a.listing.id.localeCompare(b.listing.id))
  return options.slice(0, k)
}

/** Plain-language reasons for a plan. */
export function explain(stops, parts, ctx) {
  const n = stops.length
  const first = stops[0]
  const last = stops[n - 1]
  const out = [`Fits your slot: ${fmtTime(first.start)} to ${fmtTime(last.end)}`]
  if (ctx.members.length > 1) {
    const matched = ctx.members.filter((m) => stops.some((s) => memberScore(s.listing, m) >= 0.6)).length
    out.push(`Matches the interests of ${matched} of ${ctx.members.length} members`)
  }
  out.push(`About ${fmtDuration(parts.travelMins)} of travel in total`)
  const deals = stops.filter((s) => isVerifiedDeal(s.listing)).length
  if (deals) out.push(deals === 1 ? 'Includes 1 verified deal' : `Includes ${deals} verified deals`)
  if (ctx.meals.length) out.push(`Covers ${ctx.meals.map((m) => m.name).join(' and ')}`)
  return out
}

/** Why no plan was found, with a concrete relaxation for each cause. */
export function diagnose(pool, ctx, all) {
  const problems = []
  const slotMins = ctx.slotLen / MIN
  const openSomewhere = pool.filter((l) => {
    for (let t = ctx.slot.start; t < ctx.slot.end; t += 30 * MIN) if (scheduleAt(l, t).ok) return true
    return false
  })
  if (!pool.length) {
    problems.push({ cause: 'Nothing listed near the start area', relax: 'widen_area', label: 'Search a wider area' })
  } else if (!openSomewhere.length) {
    problems.push({ cause: 'Nothing nearby is open during this slot', relax: 'change_slot', label: 'Pick a different slot' })
  }
  if (slotMins < ctx.options.minStops * 60) {
    problems.push({ cause: `The slot is only ${fmtDuration(slotMins)}, too short for ${ctx.options.minStops} stops`, relax: 'fewer_stops', label: 'Allow a single stop' })
  }
  if (ctx.meals.length && !openSomewhere.some((l) => l.kind === 'meal')) {
    problems.push({ cause: 'No meal places nearby are open at meal time', relax: 'no_meal', label: 'Skip the meal stop' })
  }
  const unknown = (all || []).filter((l) => !l.openingHours && l.type !== 'event' && l.type !== 'hangout').length
  if (!problems.length) {
    problems.push({ cause: 'The stops that are open cannot be chained within the slot', relax: 'fewer_stops', label: 'Allow fewer stops' })
  }
  return { problems, unknownHoursSkipped: unknown }
}
