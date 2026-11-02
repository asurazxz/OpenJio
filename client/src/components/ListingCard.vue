<script setup>
import { computed } from 'vue'
import { TYPE_LABEL, interestLabel, areaLabel, sourceLine, spotsText, dealHeadline, priceShort, validityText, openingSummary, timeSpan } from '../lib/labels.js'
import { fmtAge, toMs, fmtDay, fmtRange, fmtDateKey, sgParts, sgDateKey } from '../lib/time.js'
import CategoryIcon from './brand/CategoryIcon.vue'

const props = defineProps({
  listing: { type: Object, required: true },
  km: { type: Number, default: null },
  available: { type: Boolean, default: null },
  compact: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
})
defineEmits(['add', 'open'])

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const l = computed(() => props.listing)
const icon = computed(() => (l.value.interests || [])[0] || l.value.type)
const where = computed(() => {
  const area = areaLabel(l.value.area)
  if (props.km == null) return area
  return `${area}, ${props.km < 1 ? Math.round(props.km * 1000) + ' m' : props.km.toFixed(1) + ' km'}`
})
const age = computed(() => {
  const t = toMs(l.value.source?.verifiedAt || l.value.source?.retrievedAt)
  return t ? fmtAge(t) : null
})
// Cards say only that something is missing; the detail dialog lists which details.
const hasGaps = computed(() => l.value.autoPublished && ((l.value.missing || []).length > 0 || l.value.locationKnown === false))
const isOsm = computed(() => l.value.source?.kind === 'osm')
const sourceText = computed(() => (isOsm.value ? 'OpenStreetMap via Geoapify' : sourceLine(l.value)))
const price = computed(() => priceShort(l.value.priceText))

// Deal: the offer leads, validity in plain words.
const headline = computed(() => dealHeadline(l.value.dealText, l.value.title))
const validity = computed(() => validityText(l.value.validity) || (l.value.validity?.dateTo ? `Until ${fmtDateKey(l.value.validity.dateTo)}` : ''))

// Event: a date block plus a time line.
const start = computed(() => toMs(l.value.startsAt))
const end = computed(() => toMs(l.value.endsAt))
const dateBlock = computed(() => {
  if (!start.value) return null
  const p = sgParts(start.value)
  const multi = end.value && sgDateKey(start.value) !== sgDateKey(end.value - 1)
  let to = ''
  if (multi) {
    const e = sgParts(end.value - 1)
    to = `to ${e.day} ${MONTH[e.month - 1]}${e.year !== p.year ? ' ' + e.year : ''}`
  }
  return { weekday: WEEKDAY[p.weekday], day: p.day, month: MONTH[p.month - 1], to }
})
const timeLine = computed(() => (start.value && end.value ? timeSpan(start.value, end.value) : 'Time not confirmed'))
const fullWhen = computed(() => (start.value && end.value ? fmtRange(start.value, end.value) : 'Time not confirmed'))

// Place: kind plus whether it is open.
const placeLine = computed(() => {
  const kind = l.value.interests?.[0] ? interestLabel(l.value.interests[0]) : l.value.kind === 'meal' ? 'Food' : 'Place'
  return [kind, openingSummary(l.value.openingHours)].filter(Boolean).join(' · ')
})

// Open Jio: time first, the host's own words, seats.
const jioWhen = computed(() => (start.value && end.value ? `${fmtDay(start.value)} · ${timeSpan(start.value, end.value)}` : 'Time not confirmed'))
const quote = computed(() => (l.value.summary && !/^Open Jio hosted by /.test(l.value.summary) ? l.value.summary : ''))
const spots = computed(() => (l.value.type === 'hangout' && l.value.capacity ? spotsText(l.value.capacity, l.value.memberCount) : null))
const hostLine = computed(() => {
  const first = (l.value.hostName || '').split(' ')[0]
  return [first && `${first} hosting`, spots.value].filter(Boolean).join(' · ')
})
const seats = computed(() => {
  const cap = l.value.capacity
  if (!cap || cap > 8) return null
  const taken = Math.min(l.value.memberCount || 0, cap)
  return Array.from({ length: cap }, (_, i) => i < taken)
})
const fill = computed(() => (l.value.capacity ? Math.min(100, Math.round(((l.value.memberCount || 0) / l.value.capacity) * 100)) : 0))

// One quiet line for everything else.
const fine = computed(() => {
  const x = l.value
  const out = []
  const interests = (x.interests || []).slice(x.type === 'place' ? 1 : 0, 3).map(interestLabel)
  if (interests.length) out.push({ t: interests.join(', ') })
  if (x.type === 'place' && !x.openingHours) out.push({ t: 'Hours not verified' })
  if (x.type === 'place' && price.value) out.push({ t: price.value })
  if (x.type === 'hangout') out.push({ t: where.value })
  if (hasGaps.value) out.push({ t: 'Some details not stated', cls: 'gaps' })
  if (x.routeReady === false && !x.autoPublished) out.push({ t: 'Visit details incomplete' })
  out.push({
    t: `${sourceText.value}${age.value && x.source?.kind !== 'curated' && x.source?.kind !== 'openjio' ? ', checked ' + age.value : ''}`,
    cls: x.source?.kind === 'curated' ? 'sample' : '',
    title: x.source?.url || '',
  })
  return out
})
</script>

<template>
  <article class="listing" :class="[{ compact, active }, 'ty-' + l.type]">
    <!-- Decorative lead: voucher stub, date block or postcard band. The same facts are in the text. -->
    <div v-if="l.type !== 'hangout'" class="lead" aria-hidden="true">
      <template v-if="l.type === 'deal'">
        <CategoryIcon :name="icon" :size="compact ? 20 : 24" />
        <span class="offer" :class="{ long: headline.length > 5 }">{{ headline.replace(/-/g, '‑') }}</span>
      </template>
      <template v-else-if="l.type === 'event'">
        <template v-if="dateBlock">
          <span class="wd">{{ dateBlock.weekday }}</span>
          <span class="dn tnum">{{ dateBlock.day }}</span>
          <span class="mo">{{ dateBlock.month }}</span>
          <span v-if="dateBlock.to" class="to">{{ dateBlock.to }}</span>
        </template>
        <CategoryIcon v-else :name="icon" :size="24" />
      </template>
      <template v-else>
        <CategoryIcon :name="icon" :size="compact ? 28 : 36" />
        <span class="band-where tnum">{{ where }}</span>
      </template>
    </div>

    <div class="body">
      <p v-if="l.type === 'deal' || l.type === 'event'" class="kicker small muted tnum">{{ where ? `${TYPE_LABEL[l.type]} · ${where}` : TYPE_LABEL[l.type] }}</p>
      <p v-else-if="l.type === 'hangout'" class="kicker jio-when">
        <span class="tag tag-tomato">{{ TYPE_LABEL.hangout }}</span>
        <span class="tnum">{{ jioWhen }}</span>
      </p>
      <span v-if="l.type === 'event' && dateBlock" class="visually-hidden">{{ fullWhen }}</span>

      <h3 class="title">
        <button type="button" class="title-btn" @click="$emit('open', l)">{{ l.title }}</button>
      </h3>

      <template v-if="l.type === 'deal'">
        <p v-if="l.dealText" class="line deal-text">{{ l.dealText }}</p>
        <p v-if="validity" class="line tnum">{{ validity }}</p>
      </template>
      <p v-else-if="l.type === 'event'" class="line tnum">{{ timeLine }}<template v-if="price"> · {{ price }}</template></p>
      <p v-else-if="l.type === 'place'" class="line">{{ placeLine }}</p>
      <p v-else-if="quote" class="quote">“{{ quote }}”</p>

      <p class="fine">
        <template v-for="(p, i) in fine" :key="i"><span v-if="i" aria-hidden="true"> · </span><span :class="p.cls" :title="p.title || null">{{ p.t }}</span></template>
      </p>

      <div class="foot">
        <div class="foot-info">
          <template v-if="l.type === 'hangout'">
            <span v-if="seats" class="seats" aria-hidden="true"><i v-for="(taken, i) in seats" :key="i" :class="{ taken }" /></span>
            <span v-else-if="l.capacity" class="seat-bar" aria-hidden="true"><i :style="{ width: fill + '%' }" /></span>
            <span class="host-line tnum" :class="{ full: spots === 'Full' }">{{ hostLine }}</span>
          </template>
          <template v-else>
            <span v-if="l.type === 'deal' && price" class="price">{{ price }}</span>
            <span v-if="available === true" class="fits">✓ Fits your time</span>
            <span v-else-if="available === false" class="not-then">Not at that time</span>
          </template>
        </div>
        <slot name="actions">
          <!-- Auto-extracted listings are view-only, so they link to their source instead. -->
          <a v-if="l.autoPublished" :href="l.source?.url" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">View post</a>
          <button v-else-if="l.type === 'hangout'" type="button" class="btn btn-primary btn-sm" @click="$emit('add', l)">{{ spots === 'Full' ? 'View' : 'Join' }}</button>
          <button v-else type="button" class="btn btn-secondary btn-sm" @click="$emit('add', l)">Suggest for a jio</button>
        </slot>
      </div>
    </div>
  </article>
</template>

<style scoped>
.listing {
  --tint: var(--teal-soft);
  --tint-ink: var(--teal-ink);
  --lead-w: 90px;
  position: relative;
  overflow: hidden;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  height: 100%;
  transition: border-color var(--oj-t-quick), box-shadow var(--oj-t-quick) var(--ease);
}
.ty-event { --tint: var(--plum-soft); --tint-ink: var(--plum-ink); --lead-w: 68px; }
.ty-deal { --tint: var(--mustard-soft); --tint-ink: var(--mustard-ink); }
.ty-hangout { --tint: var(--tomato-soft); --tint-ink: var(--tomato-ink); border-color: var(--tomato); }
.listing:hover { border-color: var(--line-strong); box-shadow: var(--shadow-pop); }
.ty-hangout:hover { border-color: var(--tomato); }
.listing.active { border-color: var(--tomato); box-shadow: 0 0 0 2px color-mix(in srgb, var(--tomato) 35%, transparent), var(--shadow-pop); }

/* Voucher and ticket: a coloured stub, a dashed perforation, then the body. */
.ty-deal, .ty-event { display: grid; grid-template-columns: var(--lead-w) minmax(0, 1fr); }
.ty-deal .lead, .ty-event .lead {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 6px;
  text-align: center;
  background: var(--tint);
  color: var(--tint-ink);
  border-right: 2px dashed color-mix(in srgb, var(--tint-ink) 35%, transparent);
}
.ty-deal .lead::before, .ty-deal .lead::after, .ty-event .lead::before, .ty-event .lead::after {
  content: '';
  position: absolute;
  left: calc(var(--lead-w) - 9px);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--paper);
  border: 1px solid var(--line);
}
.ty-deal .lead::before, .ty-event .lead::before { top: -9px; }
.ty-deal .lead::after, .ty-event .lead::after { bottom: -9px; }
.offer { font-family: var(--font-display); font-weight: 800; font-size: 1.45rem; line-height: 1.05; letter-spacing: -0.01em; }
.offer.long { font-size: 1.1rem; }
.ty-event .lead { gap: 1px; }
.wd { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.dn { font-family: var(--font-display); font-weight: 800; font-size: 1.9rem; line-height: 1; }
.mo { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.to { font-size: 0.68rem; line-height: 1.15; font-weight: 600; opacity: 0.85; }

/* Postcard: a tinted band with the category icon and the place on it. */
.ty-place .lead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  background: var(--tint);
  color: var(--tint-ink);
}
.compact.ty-place .lead { padding: 9px 14px; }
.band-where { font-size: 0.82rem; font-weight: 700; text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.body { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; min-width: 0; flex: 1; }
.compact .body { padding: 10px 14px; gap: 4px; }
.kicker { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jio-when { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; font-weight: 700; flex-wrap: wrap; }
.title { font-size: 1.12rem; margin: 0; line-height: 1.25; }
.compact .title { font-size: 1.02rem; }
.title-btn {
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.title-btn:hover { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--tomato); }
.line { margin: 0; font-size: 0.9rem; color: var(--ink-2); }
.deal-text { color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quote {
  margin: 0;
  font-size: 0.92rem;
  color: var(--ink-2);
  font-style: italic;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.compact .quote { -webkit-line-clamp: 1; line-clamp: 1; }
.fine { margin: 0; font-size: 0.78rem; line-height: 1.4; color: var(--ink-2); }
.fine .sample { font-weight: 700; color: var(--mustard-ink); }
.fine .gaps { font-weight: 600; }

.foot { margin-top: auto; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.foot-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.foot .btn { flex: none; white-space: nowrap; }
.price { font-weight: 700; font-size: 0.92rem; }
.fits { font-size: 0.82rem; font-weight: 700; color: var(--teal-ink); }
.not-then { font-size: 0.82rem; color: var(--ink-2); }

/* Slip: the stub tears off along a dashed line above the seats. */
.ty-hangout .body { padding-bottom: 0; }
.ty-hangout .foot {
  position: relative;
  margin: 8px -16px 0;
  padding: 12px 16px 14px;
  border-top: 2px dashed color-mix(in srgb, var(--tomato) 45%, transparent);
  background: color-mix(in srgb, var(--tomato-soft) 55%, var(--card));
}
.compact.ty-hangout .foot { margin: 6px -14px 0; padding: 9px 14px 11px; }
.ty-hangout .foot::before, .ty-hangout .foot::after {
  content: '';
  position: absolute;
  top: -8px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--paper);
  border: 1px solid var(--tomato);
}
.ty-hangout .foot::before { left: -8px; }
.ty-hangout .foot::after { right: -8px; }
.seats { display: flex; gap: 5px; flex-wrap: wrap; }
.seats i { width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--tomato); box-sizing: border-box; }
.seats i.taken { background: var(--tomato); }
.seat-bar { display: block; height: 5px; width: 100%; max-width: 120px; border-radius: 999px; background: color-mix(in srgb, var(--tomato) 22%, transparent); overflow: hidden; }
.seat-bar i { display: block; height: 100%; background: var(--tomato); }
.host-line { font-size: 0.86rem; font-weight: 600; color: var(--ink-2); }
.host-line.full { color: var(--ink); }

@media (max-width: 400px) {
  .ty-deal { --lead-w: 80px; }
  .ty-event { --lead-w: 60px; }
  .offer { font-size: 1.25rem; }
  .offer.long { font-size: 1rem; }
}
</style>
