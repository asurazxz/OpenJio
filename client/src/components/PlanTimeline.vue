<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
// Colour-coded itinerary timeline: numbered stops joined by travel legs.
// Legs draw once when the timeline first appears; reordering slides stops into place.
// Actions per stop come in through the `actions` slot.
import { fmtTime, fmtDuration } from '../lib/time.js'
import { TYPE_LABEL, TYPE_TONE } from '../lib/labels.js'
import CategoryIcon from './brand/CategoryIcon.vue'

const props = defineProps({
  stops: { type: Array, required: true },
  start: { type: Object, default: null },
  issues: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: -1 },
  now: { type: Number, default: null },
  reorderable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['focus', 'reorder'])

const canReorder = () => props.reorderable && !props.disabled
const pointer = ref(null)
const keyboardFrom = ref(null)
const keyboardTo = ref(null)
const liveMessage = ref('')
const timelineRoot = ref(null)
let edgeScrollFrame = 0
const retargetPointer = (drag) => {
  const target = document.elementFromPoint(drag.x, drag.y)?.closest('[data-stop-index]')
  drag.to = target && timelineRoot.value?.contains(target) ? Number(target.dataset.stopIndex) : null
}
const edgeScrollTick = () => {
  edgeScrollFrame = 0
  const drag = pointer.value
  if (!drag?.dragging || !canReorder()) return
  const edge = 72
  let amount = 0
  if (drag.y < edge) amount = -Math.ceil(18 * (edge - drag.y) / edge)
  else if (drag.y > window.innerHeight - edge) amount = Math.ceil(18 * (drag.y - (window.innerHeight - edge)) / edge)
  if (!amount) return
  const scroller = document.scrollingElement || document.documentElement
  const previous = scroller.scrollTop
  const maximum = Math.max(0, scroller.scrollHeight - window.innerHeight)
  const next = Math.max(0, Math.min(maximum, previous + amount))
  window.scrollTo({ top: next, behavior: 'instant' })
  if (scroller.scrollTop === previous) scroller.scrollTop = next
  if (scroller.scrollTop !== previous) {
    retargetPointer(drag)
    edgeScrollFrame = requestAnimationFrame(edgeScrollTick)
  }
}
const startEdgeScroll = () => {
  if (!edgeScrollFrame) edgeScrollFrame = requestAnimationFrame(edgeScrollTick)
}
const emitMove = (from, to) => {
  if (canReorder() && Number.isInteger(from) && Number.isInteger(to) && from !== to && to >= 0 && to < props.stops.length) {
    emit('reorder', { from, to })
  }
}
const stopPointer = () => {
  const drag = pointer.value
  if (drag?.handle?.hasPointerCapture?.(drag.pointerId)) {
    try { drag.handle.releasePointerCapture(drag.pointerId) } catch { /* pointer already ended */ }
  }
  if (edgeScrollFrame) cancelAnimationFrame(edgeScrollFrame)
  edgeScrollFrame = 0
  pointer.value = null
  window.removeEventListener('pointermove', pointerMove)
  window.removeEventListener('pointerup', pointerUp)
  window.removeEventListener('pointercancel', pointerCancel)
}
const pointerMove = (event) => {
  const drag = pointer.value
  if (!drag || drag.pointerId !== event.pointerId || !canReorder()) return
  if (!drag.dragging && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return
  drag.dragging = true
  drag.x = event.clientX
  drag.y = event.clientY
  retargetPointer(drag)
  if (drag.y < 72 || drag.y > window.innerHeight - 72) startEdgeScroll()
}
const pointerUp = (event) => {
  const drag = pointer.value
  if (!drag || drag.pointerId !== event.pointerId) return
  drag.x = event.clientX
  drag.y = event.clientY
  if (drag.dragging) {
    retargetPointer(drag)
  }
  if (drag.dragging && drag.to !== null) emitMove(drag.from, drag.to)
  stopPointer()
}
const pointerCancel = () => stopPointer()
const beginPointer = (event, index) => {
  if (!canReorder() || event.button !== 0) return
  try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* window listeners still track supported browsers */ }
  pointer.value = { pointerId: event.pointerId, from: index, to: index, x: event.clientX, y: event.clientY, dragging: false, handle: event.currentTarget }
  window.addEventListener('pointermove', pointerMove)
  window.addEventListener('pointerup', pointerUp, { once: true })
  window.addEventListener('pointercancel', pointerCancel, { once: true })
}
const onGripKeydown = (event, index) => {
  if (!canReorder()) return
  if (keyboardFrom.value === null && (event.key === ' ' || event.key === 'Enter')) {
    event.preventDefault()
    keyboardFrom.value = index
    keyboardTo.value = index
    liveMessage.value = `Picked up stop ${index + 1}, ${props.stops[index].listing.title}. Use arrow keys to choose a position.`
    return
  }
  if (keyboardFrom.value === null) return
  if (event.key === 'Escape') {
    event.preventDefault()
    keyboardFrom.value = keyboardTo.value = null
    liveMessage.value = 'Reordering cancelled.'
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    const delta = event.key === 'ArrowUp' ? -1 : 1
    keyboardTo.value = Math.max(0, Math.min(props.stops.length - 1, keyboardTo.value + delta))
    liveMessage.value = `Stop will move to position ${keyboardTo.value + 1}. Press Enter to drop or Escape to cancel.`
  } else if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    emitMove(keyboardFrom.value, keyboardTo.value)
    liveMessage.value = keyboardFrom.value === keyboardTo.value ? 'Stop kept in its current position.' : `Stop moved to position ${keyboardTo.value + 1}.`
    keyboardFrom.value = keyboardTo.value = null
  }
}
const cancelKeyboard = () => { keyboardFrom.value = keyboardTo.value = null }
const resetReorder = () => {
  stopPointer()
  cancelKeyboard()
}
watch(() => [props.reorderable, props.disabled], ([reorderable, disabled]) => {
  if (!reorderable || disabled) resetReorder()
})
watch(() => props.stops.map(stop => `${stop.listingId}:${stop.start}:${stop.end}`).join('|'), resetReorder)
onBeforeUnmount(() => {
  resetReorder()
})

const TONES = ['orange', 'teal', 'mango', 'pink']
const tone = (i) => TONES[i % TONES.length]
const modeText = (m) => (m === 'walk' ? 'walk' : 'by MRT or bus')
const hoursUnverified = (l) => l.type === 'place' && !l.openingHours
const icon = (l) => (l.kind === 'meal' ? 'food' : (l.interests || [])[0] || l.type)
</script>

<template>
  <div ref="timelineRoot" class="tl-wrap">
    <p v-if="start" class="tl-start">
      <span class="node start" aria-hidden="true"></span>
      <span class="small muted">Start around <strong>{{ start.label }}</strong></span>
    </p>
    <TransitionGroup tag="ol" name="tl" class="tl">
      <li
        v-for="(s, i) in stops"
        :key="s.listingId || s.id"
        :data-stop-index="i"
        class="stop"
        :class="['t-' + tone(i), { active: activeIndex === i, bad: issues.some((x) => x.index === i), past: now && s.end < now, 'drop-target': (pointer?.dragging && pointer.to === i) || (keyboardFrom !== null && keyboardTo === i), 'dragging': pointer?.dragging && pointer.from === i }]"
      >
        <div class="leg">
          <span class="leg-line" aria-hidden="true"></span>
          <span class="leg-txt small">
            <CategoryIcon :name="s.travelMode === 'walk' ? 'walk' : 'transit'" :size="16" />
            <span class="tnum">About {{ fmtDuration(s.travelMins) }} {{ modeText(s.travelMode) }}</span>
            <span v-if="s.travelEstimate" class="est">estimate</span>
            <span v-if="s.waitMins > 0" class="muted tnum">, {{ fmtDuration(s.waitMins) }} spare before it starts</span>
          </span>
        </div>
        <div class="row-stop">
          <span class="node tnum" aria-hidden="true">{{ i + 1 }}</span>
          <article class="stop-card" :aria-label="`Stop ${i + 1}: ${s.listing.title}`" @mouseenter="$emit('focus', i)" @focusin="$emit('focus', i)">
            <div class="stop-head">
              <button v-if="reorderable" type="button" class="grip" :disabled="disabled" :aria-label="`Reorder stop ${i + 1}: ${s.listing.title}`" :aria-pressed="keyboardFrom === i" :aria-keyshortcuts="'Space ArrowUp ArrowDown Enter Escape'" @pointerdown="beginPointer($event, i)" @keydown="onGripKeydown($event, i)" @blur="keyboardFrom !== null && cancelKeyboard()" @click="$event.preventDefault()">
                <svg aria-hidden="true" viewBox="0 0 12 18" width="12" height="18" focusable="false"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg>
              </button>
              <span class="cover" aria-hidden="true"><CategoryIcon :name="icon(s.listing)" :size="22" /></span>
              <div class="min-w-0">
                <p class="stop-time tnum">{{ fmtTime(s.start) }} to {{ fmtTime(s.end) }} <span class="muted fw-normal">({{ fmtDuration(Math.round((s.end - s.start) / 60000)) }})</span></p>
                <h4 class="stop-title">{{ s.listing.title }}</h4>
              </div>
              <span class="tag ms-auto" :class="TYPE_TONE[s.listing.type]">{{ s.listing.kind === 'meal' ? 'Meal' : TYPE_LABEL[s.listing.type] }}</span>
            </div>
            <label v-if="reorderable" class="position-picker small">Move to position
              <select :key="`${s.listingId || s.id}:${i}:${disabled}`" :value="i" :disabled="disabled" :aria-label="`Move stop ${i + 1} to position`" @change="emitMove(i, Number($event.target.value))">
                <option v-for="(_, position) in stops" :key="position" :value="position">{{ position + 1 }}</option>
              </select>
            </label>
            <p v-if="s.listing.dealText" class="deal">{{ s.listing.dealText }}<span v-if="s.listing.conditions?.length" class="muted fw-normal">. {{ s.listing.conditions.join(', ') }}</span></p>
            <p class="small muted m-0">{{ s.listing.address }}<template v-if="s.listing.priceText">. {{ s.listing.priceText }}</template></p>
            <p v-if="s.why" class="why small m-0">{{ s.why }}</p>
            <p v-if="hoursUnverified(s.listing)" class="m-0"><span class="tag tag-mustard">Hours not verified</span></p>
            <p v-for="iss in issues.filter((x) => x.index === i)" :key="iss.type" class="issue small m-0" role="alert">{{ iss.message }}</p>
            <slot name="actions" :stop="s" :index="i" />
          </article>
        </div>
      </li>
    </TransitionGroup>
    <p v-if="stops.some(stop => stop.listing.provider === 'geoapify')" class="small muted mt-3 mb-0">Venue data: <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Powered by Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>.</p>
    <span class="visually-hidden" aria-live="polite" aria-atomic="true">{{ liveMessage }}</span>
  </div>
</template>

<style scoped>
.tl-wrap { position: relative; }
.tl { list-style: none; padding: 0; margin: 0; position: relative; }
.tl-start { position: relative; padding-left: 44px; margin: 0; min-height: 28px; display: flex; align-items: center; }
.node.start { position: absolute; left: 8px; top: 4px; width: 20px; height: 20px; border-radius: 50%; background: var(--paper); border: 5px solid var(--ink); }
.stop {
  --c: var(--oj-primary);
  --c-soft: var(--tomato-soft);
  position: relative;
}
.t-teal { --c: var(--oj-teal); --c-soft: var(--teal-soft); }
.t-mango { --c: var(--oj-mango); --c-soft: var(--mustard-soft); }
.t-pink { --c: var(--oj-pink); --c-soft: var(--plum-soft); }
.leg { position: relative; padding-left: 44px; min-height: 40px; display: flex; align-items: center; }
.leg-line {
  position: absolute;
  left: 17px;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 3px;
  background: repeating-linear-gradient(to bottom, var(--c) 0 6px, transparent 6px 11px);
  transform-origin: top;
  animation: leg-draw var(--oj-t-story) var(--oj-ease-out) both;
}
.stop:nth-child(2) .leg-line { animation-delay: 80ms; }
.stop:nth-child(3) .leg-line { animation-delay: 160ms; }
.stop:nth-child(4) .leg-line { animation-delay: 240ms; }
.stop:nth-child(n + 5) .leg-line { animation-delay: 320ms; }
@keyframes leg-draw { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.leg-txt { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--ink-2); font-weight: 600; }
.est { font-size: 0.72rem; font-weight: 700; padding: 0 7px; border-radius: 999px; background: var(--paper-2); color: var(--ink-2); }
.row-stop { position: relative; padding-left: 44px; }
.node {
  position: absolute;
  left: 0;
  top: 14px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c);
  color: var(--on-accent);
  border: 3px solid var(--paper);
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 1rem;
  z-index: 1;
  box-shadow: 0 2px 6px rgba(var(--oj-shadow-rgb), 0.12);
}
.stop-card {
  display: grid;
  gap: 6px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  padding: 14px 16px;
  transition: border-color var(--oj-t-quick), box-shadow var(--oj-t-quick) var(--ease);
}
.stop.active .stop-card { border-color: var(--c); box-shadow: var(--shadow-pop); }
.stop.bad .stop-card { border-color: var(--danger); }
.stop.past { opacity: 0.6; }
.stop.drop-target .stop-card { outline: 3px solid var(--oj-teal); outline-offset: 2px; }
.stop.dragging { opacity: 0.55; }
.stop-head { display: flex; align-items: flex-start; gap: 10px; }
.grip { flex: none; width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper-2); color: var(--ink-2); font-size: 1.3rem; line-height: 1; cursor: grab; touch-action: none; }
.grip:active { cursor: grabbing; }
.grip svg { fill: currentColor; }
.grip:disabled { cursor: not-allowed; opacity: 0.5; }
.grip:focus-visible, .position-picker select:focus-visible { outline: 3px solid var(--oj-teal); outline-offset: 2px; }
.position-picker { display: flex; align-items: center; gap: 8px; color: var(--ink-2); }
.position-picker select { min-width: 44px; min-height: 44px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); padding: 3px 8px; }
.cover { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--c-soft); color: var(--ink); }
.min-w-0 { min-width: 0; }
.stop-time { margin: 0; font-weight: 700; font-size: 0.88rem; color: var(--ink-2); }
.stop-title { font-family: var(--font-display); font-weight: 800; font-size: 1.15rem; margin: 2px 0 0; }
.deal { margin: 0; font-weight: 700; color: var(--tomato-ink); font-size: 0.92rem; }
.why { color: var(--ink-2); font-style: normal; }
.why::before { content: 'Why: '; font-weight: 700; color: var(--ink); }
.issue { color: var(--danger); font-weight: 600; }
.tl-move { transition: transform var(--oj-t-standard) var(--ease); }
.tl-enter-active { transition: opacity var(--oj-t-standard) var(--ease); }
.tl-enter-from { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .leg-line { animation: none; }
  .tl-move, .tl-enter-active, .stop-card { transition: none; }
}
</style>
