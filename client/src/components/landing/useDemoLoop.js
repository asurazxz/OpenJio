import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'

// Shared clock for the landing demos. Each demo owns a timeline in milliseconds: it plays for
// `playMs`, holds the finished frame for HOLD_MS, then starts again. The clock only runs while the
// demo is on screen, the tab is visible and the visitor has not paused it. Under
// prefers-reduced-motion the finished frame is shown and the clock never starts.
export const HOLD_MS = 3000
const MAX_STEP_MS = 100

export function useDemoLoop(playMs, target) {
  const cycle = playMs + HOLD_MS
  const elapsed = ref(0)
  const paused = ref(false)
  const inView = ref(false)
  const tabVisible = ref(true)
  const reduced = ref(false)
  const running = computed(() => !reduced.value && inView.value && tabVisible.value && !paused.value)
  // Position on the timeline. Reduced motion always reads the finished frame.
  const t = computed(() => (reduced.value ? playMs : elapsed.value))

  let frameId = 0
  let last = null
  let observer = null
  let motion = null

  function tick(now) {
    frameId = 0
    if (!running.value) { last = null; return }
    if (last !== null) elapsed.value = (elapsed.value + Math.min(now - last, MAX_STEP_MS)) % cycle
    last = now
    frameId = requestAnimationFrame(tick)
  }
  watch(running, (on) => {
    cancelAnimationFrame(frameId)
    frameId = 0
    last = null
    if (on) frameId = requestAnimationFrame(tick)
  })

  function onMotion() { reduced.value = motion.matches }
  function onVisibility() { tabVisible.value = !document.hidden }

  onMounted(() => {
    motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    onMotion()
    motion.addEventListener('change', onMotion)
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    const el = unref(target)
    const node = el?.$el ?? el
    observer = new IntersectionObserver(([entry]) => { inView.value = entry.isIntersecting }, { threshold: 0.35 })
    if (node) observer.observe(node)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(frameId)
    observer?.disconnect()
    motion?.removeEventListener('change', onMotion)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  function toggle() { paused.value = !paused.value }
  function replay() { elapsed.value = 0; paused.value = false }

  return { t, paused, reduced, toggle, replay }
}
