// Display labels shared across views.
import { INTERESTS, AREAS } from '../data/seed-listings.js'

export const interestLabel = (slug) => INTERESTS.find((i) => i.slug === slug)?.label || slug
export const areaLabel = (slug) => AREAS.find((a) => a.slug === slug)?.label || slug

export const TYPE_LABEL = { place: 'Place', event: 'Event', deal: 'Deal', hangout: 'Open Jio' }
export const TYPE_TONE = { place: 'tag-teal', event: 'tag-plum', deal: 'tag-mustard', hangout: 'tag-tomato' }

export const STAGES = [
  { key: 'collecting', label: 'Find a time' },
  { key: 'voting', label: 'Shape the plan' },
  { key: 'final', label: 'Go' },
]

export const STAGE_LABEL = {
  collecting: 'Finding a time',
  voting: 'Planning',
  final: 'Confirmed',
  ended: 'Ended',
  cancelled: 'Cancelled',
}

export function priceDots(level) {
  if (level == null) return ''
  return level === 0 ? 'Free' : '$'.repeat(level)
}

export function sourceLine(listing) {
  const s = listing.source || {}
  if (s.kind === 'openjio') return 'Hosted on OpenJio'
  if (s.kind === 'curated') return 'Sample data'
  if (s.kind === 'scraped') return `From ${s.name || 'a public source'}`
  return 'Source unknown'
}

// "3 of 8 spots left" or "Full", the same wording on Home, Discover and the join page.
export function spotsText(capacity, memberCount) {
  const left = Math.max(0, capacity - memberCount)
  return left ? `${left} of ${capacity} spots left` : 'Full'
}
