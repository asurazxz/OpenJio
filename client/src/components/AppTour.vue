<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { session } from '../api/index.js'
import AppDialog from './AppDialog.vue'

const route = useRoute()
const router = useRouter()
const KEY = 'openjio:onboarding:v1'
const welcome = ref(false)
const active = ref(false)
const moving = ref(false)
const ready = ref(false)
const index = ref(0)
const card = ref(null)
const heading = ref(null)
const spot = ref({ x: 0, y: 0, width: 0, height: 0 })
const cardStyle = ref({})
const placement = ref('bottom')
const arrowStyle = ref({})
const unavailable = ref(false)
let marked = null
let previousFocus = null
let offered = false
let frame = 0
let observer = null
let pending = null
let appWasInert = false

// Routes are part of the tour: Next and Back keep the walkthrough open across pages.
const steps = [
  { path: '/', target: 'home-next', title: 'Start with your next outing', text: 'Your next confirmed jio sits here, with the route and who is going. With nothing planned, Create a jio starts one: pick possible days, invite the group, then find a time that works.' },
  { path: '/discover', target: 'discover-filters', title: 'Narrow down the ideas', text: 'Search places, events and deals by name or area. Open Filters to choose interests and find something your group will enjoy.' },
  { path: '/discover', target: 'discover-view', title: 'Explore or compare', text: 'Map view shows where ideas are. Switch to Cards when you want to compare the details side by side.' },
  { path: '/discover', target: 'discover-map', title: 'A pin is an idea you can open', text: 'Select a pin for the address, opening hours, conditions and source. Add an idea to a jio’s shortlist when it suits you.' },
  { path: '/discover?type=hangout', target: 'discover-intro', title: 'Meet people through Open Jios', text: 'Open Jios are public hangouts with spots left. Browse the cards, open one to check the time and details, then join if it suits you.' },
  { path: '/how', target: 'how-overview', title: 'The whole journey at a glance', text: 'How it works explains finding a common time, shaping an outing and agreeing on the plan. The algorithm comparison below is optional.' },
  { path: '/how', target: 'nav-create', title: 'Create a jio from any page', text: 'Ready to host? Use Create a jio in the desktop header, or Create in the bottom navigation on your phone.' },
]
const step = computed(() => steps[index.value])
const spotStyle = computed(() => ({ left: `${spot.value.x}px`, top: `${spot.value.y}px`, width: `${spot.value.width}px`, height: `${spot.value.height}px` }))
function remember() {
  offered = true
  try { localStorage.setItem(KEY, 'done') } catch { /* guidance also works without storage */ }
}
function clearMark() {
  observer?.disconnect()
  observer = null
  marked?.removeAttribute('data-tour-active')
  marked = null
}
const clamp = (n, low, high) => Math.max(low, Math.min(n, high))
function position() {
  if (!active.value || !marked || !card.value) return
  if (!marked.getClientRects().length) {
    const visible = [...document.querySelectorAll(`[data-tour="${step.value.target}"]`)].find(el => el.getClientRects().length)
    if (!visible) return
    observer?.unobserve(marked)
    marked.removeAttribute('data-tour-active')
    marked = visible
    marked.setAttribute('data-tour-active', 'true')
    observer?.observe(marked)
  }
  const rect = marked.getBoundingClientRect()
  const width = document.documentElement.clientWidth
  const height = window.innerHeight
  const margin = 12
  const gap = 16
  const cw = card.value.offsetWidth
  const ch = card.value.offsetHeight
  const header = marked.closest('.app-header') ? 0 : document.querySelector('.app-header')?.getBoundingClientRect().bottom || 0
  const bottomNav = document.querySelector('.bottom-nav')
  const bottom = bottomNav?.getClientRects().length && !marked.closest('.bottom-nav') ? bottomNav.getBoundingClientRect().top : height
  const x = clamp(rect.left - 6, margin, width - margin - 1)
  const y = clamp(rect.top - 6, Math.max(margin, header + 8), height - margin - 1)
  const right = clamp(rect.right + 6, x + 1, width - margin)
  let end = clamp(rect.bottom + 6, y + 1, Math.max(y + 1, bottom - 8))
  const centeredX = () => clamp((x + right - cw) / 2, margin, width - cw - margin)
  const centeredY = () => clamp((y + end - ch) / 2, margin, height - ch - margin)
  let left, top, side
  if (right + gap + cw <= width - margin) { side = 'right'; left = right + gap; top = centeredY() }
  else if (x - gap - cw >= margin) { side = 'left'; left = x - gap - cw; top = centeredY() }
  else if (end + gap + ch <= height - margin) { side = 'bottom'; left = centeredX(); top = end + gap }
  else if (y - gap - ch >= margin) { side = 'top'; left = centeredX(); top = y - gap - ch }
  else {
    // Tall sections (e.g. the map on a phone) get a spotlight on their visible
    // portion, leaving room for the explanation without covering that spotlight.
    end = Math.max(y + 1, height - margin - ch - gap)
    side = 'bottom'; left = centeredX(); top = end + gap
  }
  spot.value = { x, y, width: right - x, height: end - y }
  placement.value = side
  cardStyle.value = { left: `${left}px`, top: `${top}px` }
  arrowStyle.value = ['top', 'bottom'].includes(side)
    ? { left: `${clamp((x + right) / 2 - left, 24, cw - 24)}px` }
    : { top: `${clamp((y + end) / 2 - top, 24, ch - 24)}px` }
}
function schedulePosition() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(position)
}
function findTarget(signal) {
  return new Promise(resolve => {
    let timer, changes
    const done = target => { clearTimeout(timer); changes?.disconnect(); signal.removeEventListener('abort', abort); resolve(target) }
    const abort = () => done(null)
    const check = () => {
      const target = [...document.querySelectorAll(`[data-tour="${step.value.target}"]`)].find(el => el.getClientRects().length)
      if (target) done(target)
    }
    changes = new MutationObserver(check)
    changes.observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    timer = setTimeout(() => done(null), 5000)
    signal.addEventListener('abort', abort, { once: true })
    check()
  })
}
async function showStep() {
  pending?.abort()
  const controller = new AbortController()
  pending = controller
  moving.value = true
  ready.value = false
  unavailable.value = false
  clearMark()
  try {
    // Keep a current page's filters/form intact when moving between its steps.
    const destination = router.resolve(step.value.path)
    if (route.path !== destination.path || (route.query.type === 'hangout') !== (destination.query.type === 'hangout')) {
      const failure = await router.push(step.value.path)
      if (failure) { finish({ navigate: false }); return }
    }
    if (step.value.target === 'discover-map' && route.query.view === 'cards') {
      await router.replace({ query: { ...route.query, view: undefined } })
    }
    await nextTick()
    if (controller.signal.aborted) return
    marked = await findTarget(controller.signal)
    if (controller.signal.aborted) return
    if (marked) {
      marked.setAttribute('data-tour-active', 'true')
      marked.scrollIntoView({ behavior: 'instant', block: 'center' })
      await nextTick()
      position()
      observer = new ResizeObserver(schedulePosition)
      observer.observe(marked)
      observer.observe(card.value)
    } else {
      unavailable.value = true
      cardStyle.value = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    }
    ready.value = true
    await nextTick()
    if (!controller.signal.aborted) heading.value?.focus({ preventScroll: true })
  } finally {
    if (pending === controller) moving.value = false
  }
}
function dismissWelcome() { welcome.value = false; remember() }
async function finish({ navigate = true } = {}) {
  pending?.abort()
  pending = null
  active.value = false
  ready.value = false
  moving.value = false
  clearMark()
  cancelAnimationFrame(frame)
  const app = document.getElementById('app')
  if (app) app.inert = appWasInert
  remember()
  if (navigate && session.userId) {
    await router.push('/discover')
    await nextTick()
  }
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  else document.getElementById('main')?.focus({ preventScroll: true })
}
async function start() {
  dismissWelcome()
  await nextTick()
  // Begin with the current page when it is included in the walkthrough.
  const pageStart = steps.findIndex(s => {
    const destination = router.resolve(s.path)
    return destination.path === route.path && (destination.query.type === 'hangout') === (route.query.type === 'hangout')
  })
  index.value = Math.max(0, pageStart)
  const app = document.getElementById('app')
  appWasInert = app?.inert || false
  active.value = true
  if (app) app.inert = true
  await nextTick()
  showStep()
}
function advance(direction) {
  if (moving.value) return
  if (index.value + direction >= steps.length) return finish()
  index.value = Math.max(0, index.value + direction)
  showStep()
}
function maybeOffer() {
  if (!session.userId || route.name !== 'home' || offered || active.value) return
  try { if (localStorage.getItem(KEY)) return } catch { /* offer once for this page */ }
  previousFocus = document.activeElement
  welcome.value = true
  remember()
}
function onKey(event) {
  if (!active.value) return
  if (event.key === 'Escape') { event.preventDefault(); finish() }
  if (event.key === 'Tab') {
    const buttons = [...card.value.querySelectorAll('button:not(:disabled)')]
    const first = buttons[0], last = buttons.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.value)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
}
async function replay() {
  // The header can be usable before the first lazy page has finished loading.
  // Offer the tour after that navigation so it cannot immediately close it.
  await router.isReady()
  await nextTick()
  if (active.value) finish({ navigate: false })
  previousFocus = document.activeElement
  welcome.value = true
}
watch(() => [session.userId, route.name], maybeOffer, { flush: 'post' })
watch([() => route.path, () => route.query.type], () => { if (active.value && !moving.value) finish({ navigate: false }); welcome.value = false }, { flush: 'sync' })
watch(() => session.userId, () => { if (active.value && !session.userId) finish({ navigate: false }) })
onMounted(() => {
  maybeOffer()
  window.addEventListener('openjio:tour', replay)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', schedulePosition)
  window.addEventListener('scroll', schedulePosition, true)
  window.visualViewport?.addEventListener('resize', schedulePosition)
})
onBeforeUnmount(() => {
  if (active.value) finish({ navigate: false })
  window.removeEventListener('openjio:tour', replay)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', schedulePosition)
  window.removeEventListener('scroll', schedulePosition, true)
  window.visualViewport?.removeEventListener('resize', schedulePosition)
})
</script>

<template>
  <AppDialog :open="welcome" title="A quick look around" @close="dismissWelcome">
    <p class="tour-intro">A time that works. A plan worth going out for.</p>
    <p class="muted">Take a short tour through Home, Discover, Open Jios, How it works and where to create a jio. You can skip it now and open <strong>Quick tour</strong> from the header any time.</p>
    <div class="tour-welcome-actions"><button type="button" class="btn btn-ghost" @click="dismissWelcome">Skip tour</button><button type="button" class="btn btn-primary" @click="start">Show me around</button></div>
  </AppDialog>
  <Teleport to="body">
    <template v-if="active && step">
      <svg class="tour-shade" aria-hidden="true" @wheel.prevent @touchmove.prevent>
        <defs><mask id="tour-cutout" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><rect width="100%" height="100%" fill="white" /><rect v-if="ready && !unavailable" :x="spot.x" :y="spot.y" :width="spot.width" :height="spot.height" rx="14" fill="black" /></mask></defs>
        <rect width="100%" height="100%" fill="rgba(12, 20, 22, .64)" mask="url(#tour-cutout)" />
      </svg>
      <div v-if="ready && !unavailable" class="tour-spotlight" :style="spotStyle" aria-hidden="true"></div>
      <aside ref="card" class="tour-card" :style="cardStyle" :data-placement="placement" :class="{ 'tour-ready': ready }" role="dialog" aria-modal="true" aria-labelledby="tour-heading" aria-describedby="tour-description" :aria-busy="moving">
        <span v-if="!unavailable" class="tour-arrow" :style="arrowStyle" aria-hidden="true"></span>
        <div class="tour-content">
        <div class="tour-top"><span class="small muted">Quick tour · {{ index + 1 }} of {{ steps.length }}</span><button type="button" class="btn btn-ghost btn-sm" aria-label="Close tour" @click="finish">Close</button></div>
        <h2 id="tour-heading" ref="heading" tabindex="-1">{{ step.title }}</h2>
        <p id="tour-description">{{ unavailable ? 'This section is not available right now. You can continue to the next stop or close the tour.' : step.text }}</p>
        <div class="tour-actions"><button type="button" class="btn btn-ghost btn-sm" :disabled="index === 0 || moving" @click="advance(-1)">Back</button><button type="button" class="btn btn-primary btn-sm" :disabled="moving" @click="advance(1)">{{ index === steps.length - 1 ? 'Got it' : 'Next' }}</button></div>
        </div>
      </aside>
    </template>
  </Teleport>
</template>

<style scoped>
.tour-intro { font-family: var(--font-display); font-weight: 800; font-size: 1.25rem; }
.tour-welcome-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
.tour-shade { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 1000; touch-action: none; }
.tour-spotlight { position: fixed; z-index: 1001; border: 3px solid var(--teal); border-radius: 14px; pointer-events: none; box-shadow: 0 0 0 2px rgba(255,255,255,.6); }
.tour-card { position: fixed; z-index: 1002; visibility: hidden; width: min(360px, calc(100vw - 24px)); background: var(--card); color: var(--ink); border: 2px solid var(--teal); border-radius: 18px; box-shadow: var(--shadow-pop-lg); }
.tour-content { max-height: calc(100dvh - 28px); overflow-y: auto; padding: 16px 18px; }
.tour-card.tour-ready { visibility: visible; }
.tour-top, .tour-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.tour-card h2 { font-size: 1.15rem; margin: 8px 0; }
.tour-card p { font-size: .9rem; margin-bottom: 12px; color: var(--ink-2); }
.tour-card button { min-height: 44px; }
.tour-actions { justify-content: flex-end; }
.tour-arrow { position: absolute; width: 12px; height: 12px; background: var(--card); border: solid var(--teal); transform: rotate(45deg); }
[data-placement='bottom'] .tour-arrow { top: -7px; margin-left: -6px; border-width: 2px 0 0 2px; }
[data-placement='top'] .tour-arrow { bottom: -7px; margin-left: -6px; border-width: 0 2px 2px 0; }
[data-placement='right'] .tour-arrow { left: -7px; margin-top: -6px; border-width: 0 0 2px 2px; }
[data-placement='left'] .tour-arrow { right: -7px; margin-top: -6px; border-width: 2px 2px 0 0; }
</style>
