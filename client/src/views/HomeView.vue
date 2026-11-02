<script setup>
import { ref, computed, watch } from 'vue'
import { listMyHangouts, listListings, getHangout, currentUser } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { fmtRange, fmtDateKey, sgDateKey, fromDateKey, DAY } from '../lib/time.js'
import UserAvatar from '../components/UserAvatar.vue'
import SteamDoodle from '../components/brand/SteamDoodle.vue'
import NextUpTicket from '../components/home/NextUpTicket.vue'
import WeekStrip from '../components/home/WeekStrip.vue'

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
const ACTION_LINK = {
  'Add your free times': 'Add your times',
  'Pick a time': 'Pick a time',
  'Build the plan': 'Build the plan',
  'Review votes and confirm': 'Review votes',
  'Vote on the plan': 'Vote on the plan',
}

const isPast = (h, now = Date.now()) => h.stage === 'ended' || h.stage === 'cancelled' || (h.lockedSlot && h.lockedSlot.end < now - 6 * 3600e3)
const groups = computed(() => {
  const list = hangouts.value || []
  const now = Date.now()
  return {
    action: list.filter((h) => !isPast(h, now) && needsMe(h)),
    upcoming: list.filter((h) => !isPast(h, now) && !needsMe(h)),
    past: list.filter((h) => isPast(h, now)),
  }
})

// Next up: the soonest confirmed hangout, or else the soonest one with a time locked in.
const nextUp = computed(() => {
  const now = Date.now()
  const live = (hangouts.value || []).filter((h) => h.lockedSlot && h.lockedSlot.end > now && !isPast(h, now))
  const soonest = (stage) => live.filter((h) => h.stage === stage).sort((a, b) => a.lockedSlot.start - b.lockedSlot.start)[0]
  return soonest('final') || soonest('voting') || null
})
const comingUp = computed(() => groups.value.upcoming.filter((h) => h.id !== nextUp.value?.id))

const mineThisWeek = computed(() => (hangouts.value || []).filter((h) => h.lockedSlot && !isPast(h)))
// Home keeps curated listings and auto-extracted ones with nothing missing; the rest stay in Discover.
const weekListings = computed(() => {
  const mine = new Set((hangouts.value || []).map((h) => h.id))
  return (listings.value || [])
    .filter((l) => !l.autoPublished || (!(l.missing || []).length && l.locationKnown !== false))
    .filter((l) => !(l.type === 'hangout' && mine.has(l.hangoutId)))
})

function when(h) {
  if (h.lockedSlot) return fmtRange(h.lockedSlot.start, h.lockedSlot.end)
  if (h.dateFrom) return h.dateFrom === h.dateTo ? fmtDateKey(h.dateFrom) : `${fmtDateKey(h.dateFrom)} to ${fmtDateKey(h.dateTo)}`
  return ''
}
const shortWhen = (h) => (h.lockedSlot ? fmtRange(h.lockedSlot.start, h.lockedSlot.end).split(',')[0] : when(h))
const dots = (h) => Array.from({ length: Math.min(h.memberCount, 8) }, (_, i) => i < h.respondedCount)

// Your usual crew: distinct groups of 2+ others from past and current jios, most recent first.
const crews = ref([])
let crewSeq = 0
watch(hangouts, async (list) => {
  const mine = ++crewSeq
  const own = (list || []).filter((h) => h.mode !== 'solo' && h.visibility !== 'public' && h.stage !== 'cancelled' && h.memberCount > 2)
  const settled = await Promise.allSettled(own.map((h) => getHangout(h.id)))
  if (mine !== crewSeq) return
  const seen = new Set()
  const out = []
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const others = r.value.members.filter((m) => m.userId !== user.value?.id).map((m) => m.user).filter(Boolean)
    const key = others.map((u) => u.id).sort().join('|')
    if (others.length < 2 || seen.has(key)) return
    seen.add(key)
    out.push({ id: own[i].id, title: own[i].title, people: others })
  })
  crews.value = out.slice(0, 3)
}, { immediate: true })

const firstName = computed(() => user.value?.name.split(' ')[0] || '')
const away = (h) => {
  const d = Math.round((fromDateKey(sgDateKey(h.lockedSlot.start)) - fromDateKey(sgDateKey(Date.now()))) / DAY)
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`
}
const greeting = computed(() => {
  const hr = new Date().getHours()
  const line = hr < 11 ? `Kopi first, ${firstName.value}?` : hr < 17 ? `Free later, ${firstName.value}?` : `Jio makan, ${firstName.value}?`
  const n = groups.value.action.length
  const parts = []
  if (nextUp.value) parts.push(`${nextUp.value.title} is ${away(nextUp.value)}.`)
  if (n) parts.push(n === 1 ? 'One jio needs you.' : `${n} jios need you.`)
  else if (hangouts.value?.length) parts.push("You're all caught up.")
  const sub = parts.length ? parts.join(' ') : 'Start a jio, or see what is on around Singapore this week.'
  return { line, sub }
})
</script>

<template>
  <div class="page">
    <header class="hello">
      <div class="hello-text">
        <h1>{{ greeting.line }}</h1>
        <p>{{ loading ? 'Checking in on your jios…' : greeting.sub }}</p>
      </div>
      <SteamDoodle class="hello-art" :size="84" />
    </header>

    <div v-if="loading" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>
    <div v-else-if="error" class="notice danger"><p>{{ error.message }}</p></div>
    <template v-else>
      <div class="top" :class="{ solo: !hangouts?.length }">
        <NextUpTicket :hangout="nextUp" />

        <section v-if="hangouts?.length" class="side" aria-labelledby="g-wait">
          <h2 id="g-wait" class="sec-title">Waiting on you <span v-if="groups.action.length" class="count tnum">{{ groups.action.length }}</span></h2>
          <ul v-if="groups.action.length" class="wait-list">
            <li v-for="h in groups.action" :key="h.id">
              <RouterLink :to="`/h/${h.id}`" class="wait-row">
                <span class="w-main">
                  <span class="w-title">{{ h.title }}</span>
                  <span v-if="h.memberCount > 1" class="w-prog small">
                    <span class="w-dots" aria-hidden="true"><i v-for="(on, i) in dots(h)" :key="i" :class="{ on }"></i></span>
                    <span class="tnum">{{ h.respondedCount }} of {{ h.memberCount }} replied</span>
                  </span>
                </span>
                <span class="w-go">{{ ACTION_LINK[needsMe(h)] }} <span aria-hidden="true">→</span></span>
              </RouterLink>
            </li>
          </ul>
          <p v-else class="calm">You're all caught up.</p>

          <template v-if="comingUp.length">
            <h3 class="sub-title">Coming up</h3>
            <ul class="plain-list">
              <li v-for="h in comingUp" :key="h.id">
                <RouterLink :to="`/h/${h.id}`" class="plain-row">
                  <span class="p-title">{{ h.title }}</span>
                  <span class="p-when small tnum">{{ shortWhen(h) }}</span>
                </RouterLink>
              </li>
            </ul>
          </template>

          <details v-if="groups.past.length" class="past">
            <summary>Past <span class="tnum">({{ groups.past.length }})</span></summary>
            <ul class="plain-list">
              <li v-for="h in groups.past" :key="h.id">
                <RouterLink :to="`/h/${h.id}`" class="plain-row">
                  <span class="p-title">{{ h.title }}</span>
                  <span class="p-when small tnum">{{ shortWhen(h) }}</span>
                </RouterLink>
              </li>
            </ul>
          </details>
        </section>
      </div>

      <WeekStrip :listings="weekListings" :hangouts="mineThisWeek" />

      <section v-if="crews.length" class="crew" aria-labelledby="g-crew">
        <h2 id="g-crew" class="sec-title">Plan with your usual crew again</h2>
        <ul class="crew-list">
          <li v-for="c in crews" :key="c.id">
            <RouterLink :to="{ path: '/new', query: { again: c.id } }" class="crew-pill" :aria-label="`Reuse details from ${c.title}, planned with ${c.people.map((p) => p.name.split(' ')[0]).join(', ')}. You invite friends again`">
              <span class="stack" aria-hidden="true"><UserAvatar v-for="p in c.people.slice(0, 4)" :key="p.id" :user="p" :size="28" class="stacked" /></span>
              <span class="c-title">{{ c.title }}</span>
              <span class="c-go">Reuse details</span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.hello { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.hello h1 { margin: 0; }
.hello p { margin: 6px 0 0; color: var(--ink-2); max-width: 60ch; }
.hello-art { flex: none; margin-bottom: -6px; }
.top { display: grid; gap: 28px; margin-bottom: 32px; align-items: start; }
.sec-title { font-size: 1.25rem; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
.count {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--tomato-soft);
  color: var(--tomato-ink);
}
.sub-title { font-size: 0.95rem; margin: 22px 0 8px; color: var(--ink-2); }
.calm { margin: 0; color: var(--ink-2); }
.wait-list, .plain-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.wait-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--ink);
  text-decoration: none;
  transition: border-color var(--oj-t-quick), box-shadow var(--oj-t-quick);
}
.wait-row:hover { border-color: var(--line-strong); box-shadow: var(--shadow-soft); color: var(--ink); }
.w-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.w-title { font-weight: 800; font-size: 1.02rem; overflow-wrap: anywhere; }
.w-prog { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-2); }
.w-dots { display: inline-flex; gap: 4px; }
.w-dots i { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--tomato); }
.w-dots i.on { background: var(--tomato); }
.w-go { flex: none; font-weight: 700; font-size: 0.9rem; color: var(--tomato-ink); text-align: right; }
.wait-row:hover .w-go { text-decoration: underline; }
.plain-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 6px 2px; color: var(--ink); text-decoration: none; border-bottom: 1px dashed var(--line); }
.plain-row:hover { color: var(--tomato-ink); }
.p-title { font-weight: 700; overflow-wrap: anywhere; }
.p-when { flex: none; color: var(--ink-2); }
.past { margin-top: 18px; }
.past summary { cursor: pointer; font-weight: 700; font-size: 0.92rem; color: var(--ink-2); min-height: 32px; }
.past .plain-list { margin-top: 6px; opacity: 0.8; }
.crew { margin-bottom: 32px; }
.crew-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 10px; }
.crew-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 8px 8px 12px;
  background: var(--card);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--ink);
  text-decoration: none;
  transition: border-color var(--oj-t-quick), box-shadow var(--oj-t-quick), transform var(--oj-t-feedback);
}
.crew-pill:hover { border-color: var(--tomato); box-shadow: var(--shadow-soft); color: var(--ink); }
.crew-pill:active { transform: scale(0.98); }
.stack { display: inline-flex; }
.stack .stacked { margin-left: -6px; box-shadow: 0 0 0 2px var(--card); }
.stack .stacked:first-child { margin-left: 0; }
.c-title { font-weight: 800; min-width: 0; }
.c-go { white-space: nowrap; margin-left: auto; font-weight: 700; font-size: 0.85rem; padding: 5px 12px; border-radius: 999px; background: var(--tomato-soft); color: var(--tomato-ink); }
@media (max-width: 575.98px) {
  .hello-art { width: 64px; height: 64px; }
  .top { gap: 24px; }
  .crew-list li, .crew-pill { width: 100%; }
  .w-go { max-width: 9ch; }
}
@media (min-width: 992px) {
  .top { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 32px; }
  .top.solo { grid-template-columns: minmax(0, 3fr); }
}
</style>
