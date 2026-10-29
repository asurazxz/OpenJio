<script setup>
import { computed } from 'vue'
import { listMyHangouts, listListings, currentUser } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { fmtRange, fmtDateKey, toMs } from '../lib/time.js'
import { STAGE_LABEL, interestLabel } from '../lib/labels.js'
import UserAvatar from '../components/UserAvatar.vue'
import EmptyState from '../components/EmptyState.vue'

const { data: hangouts, error, loading } = useLive(listMyHangouts)
const { data: listings } = useLive(listListings)
const user = computed(() => currentUser())

function needsMe(h) {
  if (h.stage === 'collecting' && !h.iResponded) return 'Add your free times'
  if (h.stage === 'collecting' && h.myRole === 'host' && h.respondedCount >= 2) return 'Pick a time'
  if (h.stage === 'voting' && h.myRole === 'host' && !h.stopCount) return 'Build the plan'
  if (h.stage === 'voting' && h.stopCount) return h.myRole === 'host' ? 'Review votes and confirm' : 'Vote on the plan'
  return null
}

const groups = computed(() => {
  const list = hangouts.value || []
  const now = Date.now()
  const past = (h) => h.stage === 'ended' || h.stage === 'cancelled' || (h.lockedSlot && h.lockedSlot.end < now - 6 * 3600e3)
  return {
    action: list.filter((h) => !past(h) && needsMe(h)),
    upcoming: list.filter((h) => !past(h) && !needsMe(h)),
    past: list.filter(past),
  }
})

const openJios = computed(() =>
  (listings.value || [])
    .filter((l) => l.type === 'hangout' && toMs(l.endsAt) > Date.now() - 864e5)
    .filter((l) => !(hangouts.value || []).some((h) => h.id === l.hangoutId))
    .slice(0, 3),
)

function when(h) {
  if (h.lockedSlot) return fmtRange(h.lockedSlot.start, h.lockedSlot.end)
  if (h.dateFrom) return h.dateFrom === h.dateTo ? fmtDateKey(h.dateFrom) : `${fmtDateKey(h.dateFrom)} to ${fmtDateKey(h.dateTo)}`
  return ''
}
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
})
</script>

<template>
  <div class="page">
    <header class="page-head d-flex flex-wrap justify-content-between align-items-end gap-3">
      <div>
        <p class="small-caps m-0">{{ greeting }}, {{ user?.name.split(' ')[0] }}</p>
        <h1 class="m-0">Your plans</h1>
      </div>
    </header>

    <section class="starters" aria-label="Start something">
      <RouterLink to="/new?mode=group" class="starter s-tomato">
        <span class="s-title">Plan with friends</span>
        <span class="s-sub">Find a time everyone is free, then build the outing together.</span>
      </RouterLink>
      <RouterLink to="/new?mode=solo" class="starter s-teal">
        <span class="s-title">Plan for me</span>
        <span class="s-sub">Got a free afternoon? Get a plan from your own interests.</span>
      </RouterLink>
      <RouterLink to="/new?mode=public" class="starter s-mustard">
        <span class="s-title">Start an open jio</span>
        <span class="s-sub">Set a time and let anyone join from Discover.</span>
      </RouterLink>
    </section>

    <div v-if="loading" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>
    <div v-else-if="error" class="notice danger"><p>{{ error.message }}</p></div>
    <template v-else>
      <EmptyState
        v-if="!hangouts?.length"
        title="No plans yet"
        body="Start one above, or browse Discover for something to do."
      >
        <RouterLink to="/discover" class="btn btn-secondary">Browse Discover</RouterLink>
      </EmptyState>

      <section v-for="(list, key) in groups" v-show="list.length" :key="key" class="group" :aria-labelledby="`g-${key}`">
        <h2 :id="`g-${key}`" class="group-title">{{ { action: 'Needs you', upcoming: 'Coming up', past: 'Past' }[key] }}</h2>
        <ul class="hangouts">
          <li v-for="h in list" :key="h.id">
            <RouterLink :to="`/h/${h.id}`" class="hcard" :class="{ faded: key === 'past' }">
              <div class="hc-top">
                <span class="tag" :class="{ 'tag-mustard': h.stage === 'collecting', 'tag-tomato': h.stage === 'voting', 'tag-teal': h.stage === 'final' }">{{ STAGE_LABEL[h.stage] }}</span>
                <span v-if="h.mode === 'solo'" class="tag">Solo</span>
                <span v-else-if="h.visibility === 'public'" class="tag tag-plum">Open jio</span>
              </div>
              <h3 class="hc-title">{{ h.title }}</h3>
              <p class="hc-when">{{ when(h) }} · {{ h.startArea.label }}</p>
              <div class="hc-foot">
                <span class="small muted">
                  <template v-if="h.mode === 'solo'">Just you</template>
                  <template v-else>{{ h.memberCount }} {{ h.memberCount === 1 ? 'person' : 'people' }}<template v-if="h.stage === 'collecting'"> · {{ h.respondedCount }} replied</template></template>
                </span>
                <span v-if="needsMe(h)" class="cta">{{ needsMe(h) }} <span aria-hidden="true">&rarr;</span></span>
                <UserAvatar v-else :user="h.host" :size="26" />
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="openJios.length" class="group" aria-labelledby="g-open">
        <div class="d-flex justify-content-between align-items-baseline">
          <h2 id="g-open" class="group-title">Open jios you could join</h2>
          <RouterLink to="/discover?type=hangout" class="small">See all</RouterLink>
        </div>
        <ul class="hangouts">
          <li v-for="o in openJios" :key="o.id">
            <RouterLink :to="`/o/${o.hangoutId}`" class="hcard">
              <div class="hc-top"><span class="tag tag-plum">Open jio</span><span class="small muted">{{ o.memberCount }}/{{ o.capacity }} going</span></div>
              <h3 class="hc-title">{{ o.title }}</h3>
              <p class="hc-when">{{ fmtRange(toMs(o.startsAt), toMs(o.endsAt)) }} · {{ o.address }}</p>
              <div class="hc-foot">
                <span class="small muted">{{ (o.interests || []).map(interestLabel).join(', ') }}</span>
                <span class="cta">Have a look <span aria-hidden="true">&rarr;</span></span>
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.starters { display: grid; gap: 12px; margin-bottom: 32px; }
.starter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 18px 20px;
  border-radius: var(--radius);
  border: 1.5px solid var(--line-strong);
  text-decoration: none;
  color: var(--ink);
  box-shadow: var(--shadow-pop);
  transition: transform 0.12s var(--ease), box-shadow 0.12s var(--ease);
  position: relative;
  overflow: hidden;
}
.starter::after {
  content: '';
  position: absolute;
  right: -28px;
  bottom: -44px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 14px solid currentColor;
  opacity: 0.12;
}
.starter:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--line-strong); color: var(--ink); }
.s-tomato { background: var(--tomato-soft); }
.s-teal { background: var(--teal-soft); }
.s-mustard { background: var(--mustard-soft); }
.s-title { font-family: var(--font-display); font-weight: 700; font-size: 1.25rem; font-variation-settings: 'SOFT' 100; }
.s-sub { color: var(--ink-2); font-size: 0.92rem; max-width: 34ch; }
.group { margin-bottom: 32px; }
.group-title { font-size: 1.2rem; margin-bottom: 12px; }
.hangouts { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.hcard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  padding: 16px;
  background: var(--card);
  border: 1.5px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  text-decoration: none;
  transition: border-color 0.12s;
}
.hcard:hover { border-color: var(--line-strong); color: var(--ink); }
.hcard.faded { opacity: 0.7; }
.hc-top { display: flex; gap: 6px; align-items: center; justify-content: space-between; }
.hc-top .tag + .tag { margin-right: auto; }
.hc-title { margin: 4px 0 0; font-size: 1.2rem; }
.hc-when { margin: 0; color: var(--ink-2); font-size: 0.92rem; }
.hc-foot { margin-top: auto; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.cta { font-weight: 700; color: var(--tomato-ink); font-size: 0.92rem; }
@media (max-width: 575.98px) {
  .starters { gap: 10px; }
  .starter { padding: 12px 14px 14px; }
  .s-title { font-size: 1.1rem; }
  .s-sub { font-size: 0.85rem; }
}
@media (min-width: 768px) {
  .starters { grid-template-columns: repeat(3, 1fr); }
  .hangouts { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1100px) {
  .hangouts { grid-template-columns: repeat(3, 1fr); }
}
</style>
