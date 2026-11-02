<script setup>
import { computed, ref, shallowRef, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { LISTINGS } from '../data/seed-listings.js'
import { journeyFrame, JOURNEY_DURATION } from '../lib/landingJourney.js'
import MapView from './MapView.vue'
import CategoryIcon from './brand/CategoryIcon.vue'

// A compact Marina Bay example, using the project's existing geographic sample data.
const ids = ['pl-artscience-museum', 'pl-gardens-by-the-bay', 'pl-satay-by-the-bay']
const stops = ids.map(id => LISTINGS.find(place => place.id === id))
const labels = ['A little art', 'A garden walk', 'Finish with makan']
const captions = ['Art by the waterfront.', 'A little fresh air.', 'Food and a catch-up.']
const icons = ['museums', 'outdoors', 'food']
const selected = ref(null)
const mapView = ref(null)
const stage = ref(null)
const previewHeading = ref(null)
const interacted = ref(false)
const stopButtons = []
let origin = 'map'

const layout = ref({ width: 0, height: 0, offset: { x: 0, y: 0 }, points: [] })
// The route is drawn inside the map's route pane so the pins stay on top of the line.
const routePane = shallowRef(null)
function onLayout(next) {
  layout.value = next
  routePane.value ??= mapView.value?.routePane() || null
}
const overlayStyle = computed(() => ({ width: layout.value.width + 'px', height: layout.value.height + 'px', transform: `translate(${-layout.value.offset.x}px, ${-layout.value.offset.y}px)` }))
const elapsed = ref(0)
const started = ref(false)
const paused = ref(false)
const reducedMotion = ref(false)
const visible = ref(false)
const documentVisible = ref(true)
let raf = 0
let lastFrame = null
let visibilityObserver = null
let motionQuery = null
const frame = computed(() => journeyFrame(elapsed.value))
const complete = computed(() => elapsed.value >= JOURNEY_DURATION)
const points = computed(() => ids.map(id => layout.value.points.find(point => point.id === id)).filter(Boolean))
const ready = computed(() => points.value.length === stops.length && layout.value.width > 0)
const eligible = computed(() => ready.value && visible.value && documentVisible.value && !reducedMotion.value)
const running = computed(() => started.value && eligible.value && !paused.value && !complete.value)
const showCheckpoint = computed(() => started.value && !reducedMotion.value && !interacted.value && frame.value.phase === 'stop')
const reached = computed(() => complete.value || reducedMotion.value ? 2 : frame.value.reached)
const activeStop = computed(() => selected.value ? ids.indexOf(selected.value.id) : !complete.value && started.value ? frame.value.checkpoint : null)
const markers = computed(() => stops.map((place, index) => ({
  id: place.id, title: place.title, lat: place.lat, lng: place.lng,
  label: index + 1, tone: ['plum', 'teal', 'mustard'][index], active: activeStop.value === index,
  preview: { kind: labels[index], location: place.address },
})))
const linePoints = computed(() => points.value.map(point => point.x + ',' + point.y).join(' '))
const legLengths = computed(() => points.value.slice(1).map((point, index) => Math.hypot(point.x - points.value[index].x, point.y - points.value[index].y)))
const routeProgress = computed(() => {
  if (complete.value || reducedMotion.value) return 1
  const total = legLengths.value.reduce((sum, length) => sum + length, 0)
  if (!total) return 0
  const arrived = frame.value.reached
  const distance = legLengths.value.slice(0, arrived).reduce((sum, length) => sum + length, 0)
  return (distance + (frame.value.phase === 'travel' ? legLengths.value[arrived] * frame.value.progress : 0)) / total
})
const traveler = computed(() => {
  const index = frame.value.reached
  const from = points.value[index], to = points.value[index + 1]
  if (!from || !to) return null
  return { x: from.x + (to.x - from.x) * frame.value.progress, y: from.y + (to.y - from.y) * frame.value.progress }
})
const checkpointStyle = computed(() => {
  const point = points.value[frame.value.checkpoint]
  if (!point) return {}
  const width = Math.min(252, layout.value.width - 24)
  const left = Math.max(12, Math.min(point.x - width / 2, layout.value.width - width - 12))
  const preferredTop = point.y > layout.value.height / 2 ? point.y - 136 : point.y + 24
  const top = Math.max(68, Math.min(preferredTop, layout.value.height - 124))
  return { left: left + 'px', top: top + 'px', width: width + 'px' }
})
function tick(now) {
  if (!running.value) { lastFrame = null; return }
  if (lastFrame !== null) elapsed.value = Math.min(JOURNEY_DURATION, elapsed.value + now - lastFrame)
  lastFrame = now
  if (!complete.value) raf = requestAnimationFrame(tick)
}
watch(running, run => {
  cancelAnimationFrame(raf)
  lastFrame = null
  if (run) raf = requestAnimationFrame(tick)
}, { flush: 'sync' })
watch(eligible, canStart => { if (canStart && !started.value) started.value = true })
function togglePlayback() {
  if (complete.value) {
    selected.value = null
    interacted.value = false
    elapsed.value = 0
    started.value = true
    paused.value = false
  } else paused.value = !paused.value
}
function stopStory() {
  elapsed.value = JOURNEY_DURATION
  interacted.value = true
}
async function select(id, source = 'map') {
  stopStory()
  origin = source
  selected.value = stops.find(place => place.id === id) || null
  await nextTick()
  previewHeading.value?.focus({ preventScroll: true })
}
async function closePreview() {
  const id = selected.value.id
  selected.value = null
  await nextTick()
  if (origin === 'list') stopButtons[ids.indexOf(id)]?.focus({ preventScroll: true })
  else mapView.value?.focusMarker(id)
}
function syncMotion() {
  reducedMotion.value = motionQuery.matches
  if (reducedMotion.value) elapsed.value = JOURNEY_DURATION
}
function syncDocument() { documentVisible.value = !document.hidden }
onMounted(() => {
  routePane.value ??= mapView.value?.routePane() || null
  motionQuery = matchMedia('(prefers-reduced-motion: reduce)')
  syncMotion()
  syncDocument()
  motionQuery.addEventListener('change', syncMotion)
  document.addEventListener('visibilitychange', syncDocument)
  visibilityObserver = new IntersectionObserver(([entry]) => { visible.value = entry.isIntersecting }, { threshold: .25 })
  visibilityObserver.observe(stage.value)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  visibilityObserver?.disconnect()
  motionQuery?.removeEventListener('change', syncMotion)
  document.removeEventListener('visibilitychange', syncDocument)
})
</script>

<template>
  <section class="landing-map" :data-reached="reached" :class="{ paused }" aria-label="Example outing map">
    <div ref="stage" class="map-stage">
      <MapView ref="mapView" :markers="markers" track-layout height="100%" @select="select" @layout="onLayout" @interact="stopStory" />
      <Teleport v-if="ready && routePane" :to="routePane">
      <svg class="journey-overlay" :style="overlayStyle" :viewBox="'0 0 ' + layout.width + ' ' + layout.height" aria-hidden="true">
        <polyline class="journey-guide" :points="linePoints" />
        <polyline class="journey-trace" :points="linePoints" pathLength="1" stroke-dasharray="1" :stroke-dashoffset="1 - routeProgress" />
        <circle v-if="frame.phase === 'travel' && traveler && !complete" class="journey-traveler" :cx="traveler.x" :cy="traveler.y" r="7" />
      </svg>
      </Teleport>
      <div class="map-toolbar">
        <span class="example-label">Marina Bay example</span>
        <button v-if="!reducedMotion" type="button" class="playback-button" :aria-label="complete ? 'Replay route' : paused ? 'Resume animation' : 'Pause animation'" @click="togglePlayback">{{ complete ? 'Replay' : paused ? 'Resume' : 'Pause' }}</button>
      </div>
      <div v-if="showCheckpoint && ready" :key="frame.checkpoint" class="checkpoint-card" :class="{ leaving: frame.leaving }" :style="checkpointStyle" :data-stop="frame.checkpoint" aria-hidden="true">
        <span class="checkpoint-label"><CategoryIcon :name="icons[frame.checkpoint]" :size="18" />Stop {{ frame.checkpoint + 1 }}</span>
        <strong>{{ stops[frame.checkpoint].title }}</strong>
        <span>{{ captions[frame.checkpoint] }}</span>
      </div>
    </div>
    <div class="landing-itinerary">
      <template v-if="selected">
        <div class="selected-place">
          <div><h2 ref="previewHeading" tabindex="-1">{{ selected.title }}</h2><p>{{ selected.address }}</p></div>
          <button type="button" class="btn btn-ghost btn-sm" aria-label="Close place preview" @click="closePreview">Close</button>
        </div>
        <RouterLink :to="{ path: '/discover', query: { q: selected.title } }" class="place-link">See this place in Discover</RouterLink>
      </template>
      <template v-else>
        <h2>A Marina Bay jio.</h2>
        <ol class="example-stops">
          <li v-for="(place, index) in stops" :key="place.id">
            <button :ref="el => { stopButtons[index] = el }" type="button" @click="select(place.id, 'list')"><span class="stop-icon" :class="'stop-' + index"><CategoryIcon :name="icons[index]" :size="21" /></span><span>{{ labels[index] }}</span></button>
          </li>
        </ol>
      </template>
    </div>
    <p class="map-note">An example to explore. The line connects stops; it isn’t a calculated travel route.</p>
  </section>
</template>

<style scoped>
/* Hawker Glow: a finite Marina Bay route with a readable stop at each checkpoint. */
.landing-map :is(a, button):focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 3px; }
.example-stops button:active, .playback-button:active { transform: translateY(1px); }
.landing-map { min-width: 0; position: relative; }
.map-stage { height: clamp(390px, 55svh, 560px); min-width: 0; position: relative; background: var(--paper-2); border-radius: 28px; overflow: clip; }
.map-stage :deep(.map-x) { border-radius: 28px; }
.journey-overlay { position: absolute; top: 0; left: 0; overflow: visible; pointer-events: none; }
.journey-overlay polyline { fill: none; stroke: var(--teal); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
.journey-overlay .journey-guide { opacity: .18; stroke-width: 3; }
.journey-traveler { fill: var(--teal); stroke: var(--card); stroke-width: 3; }
.map-toolbar { position: absolute; top: 12px; left: 12px; right: 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; z-index: 3; pointer-events: none; }
.example-label { margin-left: 42px; background: var(--card); color: var(--ink-2); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: .8rem; }
.playback-button { flex: none; pointer-events: auto; background: var(--card); color: var(--ink); font: inherit; font-size: .8rem; font-weight: 700; border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; min-height: 44px; cursor: pointer; }
.playback-button:hover { background: var(--paper-2); border-color: var(--line-strong); }
.checkpoint-card { position: absolute; z-index: 2; display: grid; gap: 6px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--card); color: var(--ink); box-shadow: var(--shadow-pop); pointer-events: none; animation: checkpoint-arrive .3s var(--oj-ease-out) backwards; transition: opacity .28s var(--oj-ease-out), transform .28s var(--oj-ease-out); }
.checkpoint-card.leaving { opacity: 0; transform: translateY(-8px); }
.checkpoint-label { display: flex; align-items: center; gap: 8px; color: var(--teal-ink); font-size: .75rem; font-weight: 700; }
.checkpoint-card strong { font-family: var(--font-display); font-size: 1rem; }
.checkpoint-card > span:last-child { color: var(--ink-2); font-size: .85rem; }
.paused .checkpoint-card { animation: none; opacity: 1; transform: none; transition: none; }
.landing-itinerary { position: relative; z-index: 1; margin: 12px 24px 0; padding: 24px; background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow-pop); }
.landing-itinerary h2 { text-wrap: balance; font-size: 1.15rem; margin: 0 0 16px; }
.example-stops { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; padding: 0; margin: 0; gap: 12px; }
.example-stops button { display: flex; gap: 8px; align-items: center; min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: .82rem; font-weight: 600; text-align: left; cursor: pointer; }
.example-stops button:hover { color: var(--tomato-ink); }
.stop-icon { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 12px; background: var(--mustard-soft); color: var(--mustard-ink); }
.stop-0 { background: var(--plum-soft); color: var(--plum-ink); }
.stop-1 { background: var(--teal-soft); color: var(--teal-ink); }
.selected-place { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.selected-place h2 { margin-bottom: 8px; }
.selected-place p { margin: 0 0 12px; color: var(--ink-2); font-size: .85rem; }
.place-link { font-size: .85rem; font-weight: 700; }
.map-note { font-size: .75rem; color: var(--ink-2); margin: 16px 24px 0; max-width: 60ch; }
.map-stage :deep(.pin) { transition: opacity .25s var(--oj-ease-out), transform .25s var(--oj-ease-out); }
[data-reached='0'] .map-stage :deep(.leaflet-marker-icon:nth-child(n+2) .pin), [data-reached='1'] .map-stage :deep(.leaflet-marker-icon:nth-child(3) .pin) { opacity: .35; }
@keyframes checkpoint-arrive { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (max-width: 575.98px) {
  .map-stage { height: 350px; border-radius: 22px; }
  .map-stage :deep(.map-x) { border-radius: 22px; }
  .example-label { font-size: .72rem; padding: 8px; }
  .landing-itinerary { margin-inline: 12px; padding: 20px; }
  .example-stops { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .example-stops button { font-size: .9rem; }
  .map-note { margin-inline: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .map-stage :deep(.pin), .checkpoint-card { animation: none; transition: none; }
}
</style>
