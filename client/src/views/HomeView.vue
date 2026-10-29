<script setup>
import { computed } from 'vue'
import { listMyHangouts, listListings, currentUser } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { fmtRange, fmtDateKey, toMs } from '../lib/time.js'
import { STAGE_LABEL, interestLabel } from '../lib/labels.js'
import UserAvatar from '../components/UserAvatar.vue'
import EmptyState from '../components/EmptyState.vue'
import WashiHeading from '../components/brand/WashiHeading.vue'
import SteamDoodle from '../components/brand/SteamDoodle.vue'
import CategoryIcon from '../components/brand/CategoryIcon.vue'
import ListingCard from '../components/ListingCard.vue'

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
    .slice(0, 2),
)
// What's happening: soonest upcoming events and still-valid deals, after any open jios.
const happening = computed(() => {
  const all = listings.value || []
  const now = Date.now()
  const events = all
    .filter((l) => l.type === 'event' && toMs(l.endsAt) > now)
    .sort((a, b) => toMs(a.startsAt) - toMs(b.startsAt))
    .slice(0, 2)
  const deals = all.filter((l) => l.type === 'deal' && (!l.validity?.dateTo || toMs(l.validity.dateTo + 'T23:59:59+08:00') > now)).slice(0, 2)
  return [...events, ...deals]
})

function when(h) {
  if (h.lockedSlot) return fmtRange(h.lockedSlot.start, h.lockedSlot.end)
  if (h.dateFrom) return h.dateFrom === h.dateTo ? fmtDateKey(h.dateFrom) : `${fmtDateKey(h.dateFrom)} to ${fmtDateKey(h.dateTo)}`
  return ''
}
const firstName = computed(() => user.value?.name.split(' ')[0] || '')
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 11) return { line: `Kopi first, ${firstName.value}?`, sub: 'Good morning. Here is what your groups are up to.' }
  if (h < 17) return { line: `Free later, ${firstName.value}?`, sub: 'Your jios, and a few things happening around Singapore.' }
  return { line: `Jio makan, ${firstName.value}?`, sub: 'Your jios, and a few things happening tonight and this week.' }
})
</script>

<template>
  <div class="page">
    <header class="hello">
      <div class="hello-text">
        <h1>{{ greeting.line }}</h1>
        <p>{{ greeting.sub }}</p>
      </div>
      <SteamDoodle class="hello-art" :size="84" />
    </header>

    <section class="starters" aria-label="Start something">
      <RouterLink to="/new?mode=group" class="starter s-create">
        <span class="s-ico" aria-hidden="true"><CategoryIcon name="plus" :size="30" /></span>
        <span class="s-title">Create a jio</span>
        <span class="s-sub">Pick a few days, see who is free, plan it together.</span>
      </RouterLink>
      <RouterLink to="/discover?type=hangout" class="starter s-find">
        <span class="s-ico" aria-hidden="true"><CategoryIcon name="hangout" :size="30" /></span>
        <span class="s-title">Find open jios</span>
        <span class="s-sub">Join a public hangout with spots left.</span>
      </RouterLink>
      <RouterLink to="/discover" class="starter s-discover">
        <span class="s-ico" aria-hidden="true"><CategoryIcon name="place" :size="30" /></span>
        <span class="s-title">Discover</span>
        <span class="s-sub">Places, events and deals near you.</span>
      </RouterLink>
    </section>
    <p class="also">
      <RouterLink to="/new?mode=solo">Plan a free afternoon for yourself</RouterLink>
      <span aria-hidden="true" class="sep">/</span>
      <RouterLink to="/new?mode=public">Host an open jio</RouterLink>
    </p>

    <div v-if="loading" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>
    <div v-else-if="error" class="notice danger"><p>{{ error.message }}</p></div>
    <template v-else>
      <EmptyState
        v-if="!hangouts?.length"
        title="No jios yet"
        body="Start one with your friends, or see what is on in Discover."
        tone="tomato"
      >
        <RouterLink to="/new?mode=group" class="btn btn-primary">Create a jio</RouterLink>
        <RouterLink to="/discover" class="btn btn-secondary">Browse Discover</RouterLink>
      </EmptyState>

      <section v-for="(list, key) in groups" v-show="list.length" :key="key" class="group" :aria-labelledby="`g-${key}`">
        <h2 :id="`g-${key}`" class="group-title">{{ { action: 'Needs you', upcoming: 'Coming up', past: 'Past' }[key] }} <span class="count tnum">{{ list.length }}</span></h2>
        <ul class="hangouts">
          <li v-for="h in list" :key="h.id">
            <RouterLink :to="`/h/${h.id}`" class="hcard" :class="[{ faded: key === 'past' }, 'st-' + h.stage]">
              <div class="hc-top">
                <span class="tag" :class="{ 'tag-mustard': h.stage === 'collecting', 'tag-tomato': h.stage === 'voting', 'tag-teal': h.stage === 'final' }">{{ STAGE_LABEL[h.stage] }}</span>
                <span v-if="h.mode === 'solo'" class="tag">Solo</span>
                <span v-else-if="h.visibility === 'public'" class="tag tag-plum">Open jio</span>
              </div>
              <h3 class="hc-title">{{ h.title }}</h3>
              <p class="hc-when tnum">{{ when(h) }}</p>
              <p class="hc-where">Around {{ h.startArea.label }}</p>
              <div class="hc-foot">
                <span class="small muted tnum">
                  <template v-if="h.mode === 'solo'">Just you</template>
                  <template v-else>{{ h.memberCount }} {{ h.memberCount === 1 ? 'person' : 'people' }}<template v-if="h.stage === 'collecting'">, {{ h.respondedCount }} replied</template></template>
                </span>
                <span v-if="needsMe(h)" class="cta">{{ needsMe(h) }}</span>
                <UserAvatar v-else :user="h.host" :size="26" />
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="openJios.length || happening.length" class="group" aria-labelledby="g-open">
        <div class="d-flex justify-content-between align-items-baseline gap-3 mb-3">
          <WashiHeading id="g-open" tone="pink" class="group-title m-0">What's happening?</WashiHeading>
          <RouterLink to="/discover" class="small fw-bold">See all in Discover</RouterLink>
        </div>
        <ul class="hangouts">
          <li v-for="o in openJios" :key="o.id">
            <RouterLink :to="`/o/${o.hangoutId}`" class="hcard jio">
              <div class="hc-top"><span class="tag tag-tomato">Open jio</span><span class="small muted tnum">{{ o.memberCount }} of {{ o.capacity }} going</span></div>
              <h3 class="hc-title">{{ o.title }}</h3>
              <p class="hc-when tnum">{{ fmtRange(toMs(o.startsAt), toMs(o.endsAt)) }}</p>
              <p class="hc-where">{{ o.address }}</p>
              <div class="hc-foot">
                <span class="small muted">{{ (o.interests || []).map(interestLabel).join(', ') }}</span>
                <span class="cta">Have a look</span>
              </div>
            </RouterLink>
          </li>
          <li v-for="l in happening" :key="l.id">
            <ListingCard :listing="l" compact>
              <template #actions><RouterLink :to="{ path: '/discover', query: { q: l.title } }" class="btn btn-secondary btn-sm">View</RouterLink></template>
            </ListingCard>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.hello { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.hello h1 { margin: 0; }
.hello p { margin: 6px 0 0; color: var(--ink-2); max-width: 52ch; }
.hello-art { flex: none; margin-bottom: -6px; }
.starters { display: grid; gap: 12px; margin-bottom: 10px; }
.starter {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 14px;
  align-items: center;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  border: 1px solid transparent;
  text-decoration: none;
  color: var(--ink);
  box-shadow: var(--shadow-soft);
  transition: transform var(--oj-t-feedback) var(--ease), box-shadow var(--oj-t-quick) var(--ease);
}
.starter:hover { color: var(--ink); box-shadow: var(--shadow-pop); }
.starter:active { transform: scale(0.98); }
.s-ico {
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--card);
  transform: rotate(-4deg);
  box-shadow: 0 2px 0 rgba(var(--oj-shadow-rgb), 0.08);
}
.s-create { background: var(--tomato); color: var(--on-accent); }
.s-create:hover { color: var(--on-accent); }
.s-create .s-ico { color: var(--tomato-ink); }
.s-create .s-sub { color: color-mix(in srgb, var(--on-accent) 78%, var(--tomato)); }
.s-find { background: var(--teal-soft); border-color: color-mix(in srgb, var(--teal) 30%, transparent); }
.s-find .s-ico { color: var(--teal-ink); transform: rotate(3deg); }
.s-discover { background: var(--mustard-soft); border-color: color-mix(in srgb, var(--mustard) 30%, transparent); }
.s-discover .s-ico { color: var(--mustard-ink); transform: rotate(-2deg); }
.s-title { font-family: var(--font-display); font-weight: 900; font-size: 1.25rem; line-height: 1.2; }
.s-sub { color: var(--ink-2); font-size: 0.92rem; }
.also { margin: 0 0 32px; font-size: 0.92rem; font-weight: 600; display: flex; flex-wrap: wrap; gap: 4px 10px; }
.also .sep { color: var(--line-strong); }
.group { margin-bottom: 32px; }
.group-title { font-size: 1.25rem; margin-bottom: 12px; display: inline-flex; align-items: center; gap: 8px; }
.group-title .count {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--paper-2);
  color: var(--ink-2);
}
.hangouts { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.hcard {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: 16px 18px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  color: var(--ink);
  text-decoration: none;
  transition: box-shadow var(--oj-t-quick) var(--ease), border-color var(--oj-t-quick);
}
.hcard:hover { border-color: var(--line-strong); box-shadow: var(--shadow-pop); color: var(--ink); }
.hcard.faded { opacity: 0.72; box-shadow: none; }
.hc-top { display: flex; gap: 6px; align-items: center; justify-content: space-between; }
.hc-top .tag + .tag { margin-right: auto; }
.hc-title { margin: 6px 0 0; font-size: 1.2rem; }
.hc-when { margin: 0; font-weight: 600; font-size: 0.95rem; }
.hc-where { margin: 0; color: var(--ink-2); font-size: 0.9rem; }
.hc-foot { margin-top: auto; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.cta {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--tomato-ink);
  background: var(--tomato-soft);
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
@media (max-width: 575.98px) {
  .hello-art { width: 64px; height: 64px; }
  .starters { gap: 10px; }
  .starter { padding: 12px 14px; }
  .s-ico { width: 44px; height: 44px; }
}
@media (min-width: 768px) {
  .starters { grid-template-columns: 1.3fr 1fr 1fr; }
  .starter { grid-template-columns: 1fr; grid-template-rows: auto auto auto; row-gap: 4px; align-items: start; padding: 20px; }
  .s-ico { grid-row: auto; margin-bottom: 10px; }
  .hangouts { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1100px) {
  .hangouts { grid-template-columns: repeat(3, 1fr); }
}
</style>
