<script setup>
// Leaflet map on OneMap tiles. Markers are numbered or dotted pins; a route line joins them when `path` is set.
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import L from 'leaflet'

const props = defineProps({
  markers: { type: Array, default: () => [] }, // { id, lat, lng, label?, tone?, title?, active? }
  path: { type: Boolean, default: false },
  start: { type: Object, default: null }, // { lat, lng, label }
  height: { type: String, default: '320px' },
  dark: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const el = ref(null)
let map = null
let layer = null
let ro = null

const SG_BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.1])

function icon(m) {
  const cls = `pin tone-${m.tone || 'tomato'}${m.active ? ' active' : ''}`
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="${cls}"><b>${m.label ?? ''}</b></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function draw() {
  if (!map) return
  layer.clearLayers()
  const pts = []
  if (props.start) {
    const s = L.marker([props.start.lat, props.start.lng], {
      icon: L.divIcon({ className: 'pin-wrap', html: '<span class="pin start" aria-hidden="true"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      title: props.start.label || 'Start',
      keyboard: false,
    })
    s.addTo(layer)
    pts.push([props.start.lat, props.start.lng])
  }
  for (const m of props.markers) {
    if (m.lat == null || m.lng == null) continue
    const mk = L.marker([m.lat, m.lng], { icon: icon(m), title: m.title || '', riseOnHover: true })
    mk.on('click', () => emit('select', m.id))
    mk.addTo(layer)
    pts.push([m.lat, m.lng])
  }
  if (props.path && pts.length > 1) {
    L.polyline(pts, { color: getComputedStyle(el.value).getPropertyValue('--ink').trim() || '#2a1f17', weight: 3, dashArray: '2 8', lineCap: 'round' }).addTo(layer)
  }
  if (pts.length === 1) map.setView(pts[0], 15)
  else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 16 })
  else map.fitBounds(SG_BOUNDS)
}

onMounted(async () => {
  await nextTick()
  // The component may have been unmounted while waiting.
  if (!el.value) return
  map = L.map(el.value, {
    maxBounds: SG_BOUNDS.pad(0.1),
    minZoom: 11,
    maxZoom: 18,
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: true,
  })
  L.tileLayer('https://www.onemap.gov.sg/maps/tiles/{style}/{z}/{x}/{y}.png', {
    style: 'Grey',
    detectRetina: true,
    maxZoom: 19,
    minZoom: 11,
    attribution:
      '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>',
  }).addTo(map)
  layer = L.layerGroup().addTo(map)
  draw()
  // The container can change size after mount (tabs, sticky sidebars); keep Leaflet in sync.
  ro = new ResizeObserver(() => {
    if (!map) return
    map.invalidateSize()
    draw()
  })
  ro.observe(el.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  map?.remove()
  map = null
})

watch(() => [props.markers, props.start], draw, { deep: true })

defineExpose({ invalidate: () => map?.invalidateSize() })
</script>

<template>
  <div ref="el" class="map-x" :style="{ height }" role="region" aria-label="Map"></div>
</template>

<style scoped>
.map-x {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
  z-index: 0;
}
:global(.pin-wrap) { background: none; border: 0; }

:global(.pin) {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50% 50% 50% 4px;
  transform: rotate(-45deg);
  border: 2.5px solid var(--card);
  font: 900 13px/1 var(--font-display);
  color: var(--on-accent);
  background: var(--tomato);
  box-shadow: 0 3px 8px rgba(var(--oj-shadow-rgb), 0.25);
  transition: transform var(--oj-t-quick) var(--oj-ease-out);
}
:global(.pin b) { transform: rotate(45deg); font-weight: 700; }
:global(.pin.tone-teal) { background: var(--teal); }
:global(.pin.tone-mustard) { background: var(--mustard); color: var(--ink); }
:global(.pin.tone-plum) { background: var(--plum); color: var(--on-accent); }
:global(.pin.tone-ink) { background: var(--ink); color: var(--paper); }
:global(.pin.active) { outline: 3px solid var(--ink); outline-offset: 1px; transform: rotate(-45deg) scale(1.15); }
:global(.pin.start) {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  transform: none;
  background: var(--paper);
  border: 5px solid var(--ink);
  box-shadow: none;
}
</style>

<style>
/* Unscoped: warm tint on map tiles, inverted for dark mode. */
.map-x .leaflet-tile-pane { filter: sepia(0.35) saturate(0.85) brightness(1.02); }
:root[data-theme='dark'] .map-x .leaflet-tile-pane { filter: invert(0.9) hue-rotate(180deg) sepia(0.35) brightness(0.85) contrast(0.9); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .map-x .leaflet-tile-pane { filter: invert(0.9) hue-rotate(180deg) sepia(0.35) brightness(0.85) contrast(0.9); }
}
</style>
