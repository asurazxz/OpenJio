<script setup>
import { computed } from 'vue'
import { TYPE_LABEL, TYPE_TONE, interestLabel, areaLabel, sourceLine } from '../lib/labels.js'
import { fmtRange, fmtDateKey, toMs } from '../lib/time.js'
import CategoryIcon from './brand/CategoryIcon.vue'

const props = defineProps({ listing: { type: Object, required: true } })
defineEmits(['add'])
const days = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']]
const hours = (windows) => windows?.length ? windows.map(([a, b]) => `${a} – ${b === '23:59' ? 'midnight' : b}`).join(', ') : 'Closed'
const sourceUrl = computed(() => {
  try { const u = new URL(props.listing.source?.url); return ['https:', 'http:'].includes(u.protocol) ? u.href : '' } catch { return '' }
})
const directions = computed(() => Number.isFinite(props.listing.lat) && Number.isFinite(props.listing.lng)
  ? `https://www.google.com/maps/search/?api=1&query=${props.listing.lat},${props.listing.lng}` : '')
</script>

<template>
  <article class="listing-details">
    <p v-if="listing.routeReady === false" class="notice small">This listing is available to browse, but its visit details are incomplete. It can be saved to a shortlist; it cannot yet be added as an itinerary stop.</p>
    <div class="detail-intro">
      <div class="category-art" aria-hidden="true"><CategoryIcon :name="listing.interests?.[0] || 'outdoors'" :size="40" /></div>
      <div>
        <div class="chip-row mb-2"><span class="tag" :class="TYPE_TONE[listing.type]">{{ TYPE_LABEL[listing.type] }}</span><span class="small muted">{{ areaLabel(listing.area) }}</span></div>
        <p class="intro-copy">{{ listing.summary }}</p>
        <div class="chip-row"><span v-for="interest in listing.interests" :key="interest" class="tag">{{ interestLabel(interest) }}</span></div>
      </div>
    </div>

    <section aria-labelledby="visit-heading" class="visit-section">
      <h3 id="visit-heading">Plan your visit</h3>
      <dl class="visit-facts">
        <div><dt>Typical spend</dt><dd>{{ listing.priceText || 'Price not stated' }}</dd></div>
        <div><dt>Allow around</dt><dd>{{ listing.durationMins ? `${listing.durationMins} minutes` : 'Duration not stated' }}</dd></div>
        <div v-if="listing.startsAt"><dt>When</dt><dd>{{ fmtRange(toMs(listing.startsAt), toMs(listing.endsAt)) }}</dd></div>
        <div v-else-if="listing.validity?.dateFrom && listing.validity?.dateTo"><dt>Deal dates</dt><dd>{{ fmtDateKey(listing.validity.dateFrom) }} – {{ fmtDateKey(listing.validity.dateTo) }}</dd></div>
      </dl>
    </section>

    <div class="detail-columns">
      <section class="detail-section">
        <h3>Where you'll go</h3>
        <p class="address">{{ listing.address || 'Exact address not confirmed' }}</p>
        <ul v-if="listing.outlets?.length > 1" class="outlets"><li v-for="(outlet, i) in listing.outlets" :key="i"><strong>{{ outlet.name }}</strong><br />{{ outlet.address }}</li></ul>
        <a v-if="directions" :href="directions" target="_blank" rel="noopener noreferrer" class="location-link">Open location <span aria-hidden="true">↗</span></a>
        <template v-if="listing.type !== 'event' && listing.type !== 'hangout'">
          <h3 class="mt-4">Opening hours</h3>
          <dl v-if="listing.openingHours" class="hours"><div v-for="[key, label] in days" :key="key"><dt>{{ label }}</dt><dd>{{ hours(listing.openingHours[key]) }}</dd></div></dl>
          <p v-else class="notice small">Hours haven't been confirmed. This listing won't be added automatically to a generated plan.</p>
        </template>
      </section>

      <section class="detail-section">
        <template v-if="listing.type === 'deal'">
          <h3>The offer</h3>
          <p class="offer">{{ listing.dealText || listing.summary }}</p>
          <p v-if="listing.validity?.daysOfWeek?.length" class="small muted">{{ listing.validity.daysOfWeek.join(' · ') }}</p>
          <p v-if="listing.validity?.timeWindows?.length" class="small tnum">{{ listing.validity.timeWindows.map((w) => `${w.start} – ${w.end}`).join(', ') }}</p>
        </template>
        <h3>{{ listing.type === 'deal' ? 'Before you redeem' : 'Good to know' }}</h3>
        <ul v-if="listing.conditions?.length"><li v-for="condition in listing.conditions" :key="condition">{{ condition }}</li></ul>
        <p v-else class="small muted">Check the original listing for booking requirements and any conditions before heading out.</p>
        <p v-if="listing.exclusions?.length" class="small"><strong>Not valid:</strong> {{ listing.exclusions.join('; ') }}</p>
        <div class="provenance"><span class="small muted">{{ sourceLine(listing) }}</span><a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer">{{ listing.type === 'event' ? 'Booking and original details' : 'View original details' }} <span aria-hidden="true">↗</span></a></div>
      </section>
    </div>

    <p v-if="listing.sample" class="sample-note">Sample listing. Hours and prices are approximate; event and deal names are made up.</p>
    <footer class="detail-actions"><span class="small muted">{{ listing.type === 'hangout' ? 'See the plan and who is going.' : 'Save this idea to a plan’s shortlist. It does not make a booking.' }}</span><button type="button" class="btn btn-primary" @click="$emit('add')">{{ listing.type === 'hangout' ? 'View open jio' : 'Add to a plan' }}</button></footer>
  </article>
</template>

<style scoped>
.detail-intro { display: flex; gap: 18px; align-items: flex-start; margin-bottom: 24px; }
.category-art { display: grid; place-items: center; width: 80px; height: 80px; flex: none; background: var(--teal-soft); color: var(--teal-ink); border-radius: 22px; }
.intro-copy { font-size: 1.05rem; margin-bottom: 12px; }
h3 { font-family: var(--font-display); font-size: 1rem; margin-bottom: 12px; }
.visit-section { background: var(--paper-2); border-radius: 16px; padding: 18px; margin-bottom: 24px; }
.visit-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 18px; margin: 0; }
dt { font-size: .8rem; font-weight: 500; color: var(--ink-2); }
dd { margin: 4px 0 0; font-weight: 700; }
.detail-columns { display: grid; gap: 24px; }
.detail-section { min-width: 0; }
.address { margin-bottom: 8px; overflow-wrap: anywhere; }
.location-link { font-weight: 700; font-size: .9rem; }
.hours { display: grid; gap: 6px; margin: 0; }
.hours div { display: flex; justify-content: space-between; gap: 12px; }
.hours dd { margin: 0; font-size: .85rem; font-weight: 500; font-variant-numeric: tabular-nums; }
.offer { padding: 12px; border-left: 3px solid var(--mustard); background: var(--mustard-soft); border-radius: 0 10px 10px 0; }
.outlets { padding-left: 20px; font-size: .9rem; }
.provenance { display: grid; gap: 8px; margin-top: 20px; padding-top: 14px; border-top: 1px dashed var(--line); font-size: .85rem; }
.sample-note { font-size: .8rem; color: var(--ink-2); margin: 20px 0 0; }
.detail-actions { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding-top: 18px; margin-top: 18px; border-top: 1px solid var(--line); }
.detail-actions span { max-width: 35ch; }
@media (min-width: 600px) { .detail-columns { grid-template-columns: 1fr 1fr; gap: 32px; } }
@media (max-width: 575.98px) { .category-art { width: 52px; height: 52px; border-radius: 14px; } .detail-intro { gap: 12px; } .detail-actions { flex-direction: column; align-items: stretch; } .detail-actions span { max-width: none; } }
</style>
