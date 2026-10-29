// Late-join suggestions (R5). Locations are the published schedule, not live positions.
// A stop is suggested only if the joiner arrives with a useful overlap before the group leaves.

import { estimateTravel } from '../geo.js'
import { MIN } from '../time.js'

/**
 * @param {object} p
 * @param {{listing:object,start:number,end:number}[]} p.stops scheduled stops in order
 * @param {{lat:number,lng:number}} p.from joiner's origin
 * @param {number} p.departMs when the joiner leaves
 * @param {(a,b)=>{mins:number,mode:string}} [p.travel]
 * @param {number} [p.minOverlapMins]
 */
export function joinSuggestions({ stops, from, departMs, travel = estimateTravel, minOverlapMins = 20 }) {
  if (!stops.length) return { best: null, options: [], reason: 'The plan has no stops yet' }
  const outingEnd = stops[stops.length - 1].end
  if (departMs >= outingEnd) return { best: null, options: [], reason: 'The outing has already ended by then' }

  const options = []
  stops.forEach((stop, index) => {
    if (stop.end <= departMs) return
    const leg = travel(from, stop.listing)
    if (!leg || !Number.isFinite(leg.mins) || leg.mins <= 0) return
    const arriveMs = departMs + leg.mins * MIN
    const overlapMins = Math.round((stop.end - Math.max(arriveMs, stop.start)) / MIN)
    if (overlapMins < minOverlapMins) return
    options.push({
      index,
      stop,
      arriveMs,
      travelMins: leg.mins,
      travelMode: leg.mode,
      estimate: leg.estimate !== false,
      overlapMins,
      waitMins: Math.max(0, Math.round((stop.start - arriveMs) / MIN)),
    })
  })

  if (!options.length) {
    return { best: null, options, reason: 'You would not reach any remaining stop in time to spend at least ' + minOverlapMins + ' minutes with the group' }
  }
  // Join as early in the plan as possible; the first reachable stop is the best one.
  return { best: options[0], options, reason: null }
}
