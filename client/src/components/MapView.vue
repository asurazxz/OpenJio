<script setup>
// Leaflet map on OneMap tiles. Markers are numbered or dotted pins; a route line joins them when `path` is set.
// With `cluster`, nearby pins merge into numbered bubbles when zoomed out (Leaflet.markercluster 1.5.3, MIT,
// by Dave Leaver and contributors: https://github.com/Leaflet/Leaflet.markercluster). Only Discover sets it.
// With `pills` (Discover only), pins are small labelled pills (icon + short text) and clusters read "+N".
import { onMounted, onBeforeUnmount, ref, watch, nextTick, h, render } from 'vue'
import L from 'leaflet'
import CategoryIcon from './brand/CategoryIcon.vue'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

const props = defineProps({
  markers: { type: Array, default: () => [] }, // { id, lat, lng, label?, tone?, title?, active? }
  path: { type: Boolean, default: false },
  start: { type: Object, default: null }, // { lat, lng, label }
  height: { type: String, default: '320px' },
  scrollWheelZoom: { type: Boolean, default: false },
  trackLayout: { type: Boolean, default: false },
  dark: { type: Boolean, default: false },
  cluster: { type: Boolean, default: false }, // read once at mount
  pills: { type: Boolean, default: false }, // markers also take { icon, pill }; read once at mount
  highlightId: { type: [String, Number], default: null }, // pin drawn as hovered (pills)
  fitKey: { type: String, default: null }, // pills: re-fit the view only when this changes, not on every marker change
})
const emit = defineEmits(['select', 'layout', 'interact', 'hover', 'view'])

const el = ref(null)
let map = null
let layer = null
let clusterGroup = null
let ro = null
let geometry = ''
let lastFit = null
const NEVER = -1e9
let lastUserInput = NEVER
const markerLayers = new Map()
const activeIds = new Set()

const SG_BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.1])

function reportLayout() {
  if (!props.trackLayout || !map) return
  const size = map.getSize()
  emit('layout', {
    width: size.x, height: size.y,
    // Where the panes have been panned to, so an overlay drawn in the route pane lines up with the map.
    offset: L.DomUtil.getPosition(map.getPane('mapPane')),
    points: props.markers.filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng)).map(m => {
      const point = map.latLngToContainerPoint([m.lat, m.lng])
      return { id: m.id, x: point.x, y: point.y }
    }),
  })
}

// Pill icons reuse CategoryIcon: render it once into a detached node and keep the SVG markup.
const svgCache = new Map()
function svgFor(name) {
  const key = name || 'place'
  if (!svgCache.has(key)) {
    const host = document.createElement('div')
    render(h(CategoryIcon, { name: key, size: 15 }), host)
    svgCache.set(key, host.innerHTML)
    render(null, host)
  }
  return svgCache.get(key)
}
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function pillIcon(m) {
  const cls = `map-pill tone-${m.tone || 'tomato'}${m.active ? ' active' : ''}${props.highlightId != null && props.highlightId === m.id ? ' hot' : ''}`
  return L.divIcon({
    className: 'pin-wrap pill-wrap',
    html: `<span class="${cls}">${svgFor(m.icon)}${m.pill ? `<b>${esc(m.pill)}</b>` : ''}</span>`,
    iconSize: null, // sized by its content; CSS centres it over the point
  })
}

function icon(m) {
  if (props.pills) return pillIcon(m)
  const cls = `pin tone-${m.tone || 'tomato'}${m.active ? ' active' : ''}`
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="${cls}"><b>${m.label ?? ''}</b></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function clusterIcon(cluster) {
  const count = cluster.getChildCount()
  if (props.pills) {
    return L.divIcon({ className: 'oj-cluster oj-cluster-pill', html: `<div class="oj-cluster-in"><span>+${count}</span></div>`, iconSize: null })
  }
  const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large'
  const px = { small: 40, medium: 46, large: 52 }[size]
  return L.divIcon({
    className: `marker-cluster marker-cluster-${size} oj-cluster`,
    html: `<div class="oj-cluster-in"><span>${count}</span></div>`,
    iconSize: L.point(px, px),
  })
}

// Bubbles are plain divs, so give them a name and keyboard access after each (re)render.
const keyedBubbles = new WeakSet()
function labelClusters() {
  if (!map) return
  for (const bubble of map.getContainer().querySelectorAll('.oj-cluster')) {
    const count = bubble.textContent.trim()
    bubble.setAttribute('role', 'button')
    bubble.setAttribute('tabindex', '0')
    bubble.setAttribute('aria-label', `${count.replace('+', '')} places in this area. Zoom in to see them.`)
    if (keyedBubbles.has(bubble)) continue
    keyedBubbles.add(bubble)
    bubble.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return
      event.preventDefault()
      bubble.click()
    })
  }
}

// Selected and hovered state is a class on the live element, so a hover never rebuilds the pin under the cursor.
function applyState(id) {
  const mk = markerLayers.get(id)
  const el = mk?.getElement()
  if (!el) return
  const node = el.querySelector('.pin, .map-pill')
  node?.classList.toggle('active', activeIds.has(id))
  node?.classList.toggle('hot', props.pills && props.highlightId != null && props.highlightId === id)
  if (props.pills) mk.setZIndexOffset(activeIds.has(id) || props.highlightId === id ? 1000 : 0)
}

function draw() {
  if (!map) return
  const nextGeometry = JSON.stringify([props.start && [props.start.lat, props.start.lng], props.markers.map((m) => [m.id, m.lat, m.lng, m.label, m.tone, m.title, m.preview, m.icon, m.pill, m.fit]), props.path])
  activeIds.clear()
  for (const m of props.markers) if (m.active) activeIds.add(m.id)
  if (nextGeometry === geometry) {
    for (const m of props.markers) applyState(m.id)
    return
  }
  geometry = nextGeometry
  layer.clearLayers()
  clusterGroup?.clearLayers()
  markerLayers.clear()
  const pinTarget = clusterGroup || layer
  const pts = []
  const fitPts = [] // what the view fits: every pin unless a marker opts out with fit: false
  if (props.start) {
    const s = L.marker([props.start.lat, props.start.lng], {
      icon: L.divIcon({ className: 'pin-wrap', html: '<span class="pin start" aria-hidden="true"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      title: props.start.label || 'Start',
      keyboard: false,
    })
    s.addTo(layer)
    pts.push([props.start.lat, props.start.lng])
    fitPts.push([props.start.lat, props.start.lng])
  }
  for (const m of props.markers) {
    if (m.lat == null || m.lng == null) continue
    const mk = L.marker([m.lat, m.lng], { icon: icon(m), alt: m.title || 'Location', riseOnHover: true })
    if (m.title && !props.pills) {
      // Listing text is inserted as text, never interpreted as tooltip HTML.
      const preview = document.createElement('div')
      const fields = [
        ['kind', m.preview?.kind], ['title', m.title],
        ['location', m.preview?.location], ['when', m.preview?.when],
        ['price', m.preview?.price], ['spots', m.preview?.spots],
      ]
      for (const [name, value] of fields) {
        if (!value) continue
        const line = document.createElement(name === 'title' ? 'strong' : 'span')
        line.className = `map-preview-${name}`
        line.textContent = value
        preview.append(line)
      }
      mk.bindTooltip(preview, { className: 'map-pin-preview', direction: 'top', offset: [0, -25], opacity: 1 })
    }
    mk.on('tooltipopen', () => emit('interact'))
    mk.on('click', () => { mk.closeTooltip(); emit('select', m.id) })
    mk.on('keydown', event => {
      if (!['Enter', ' '].includes(event.originalEvent.key)) return
      L.DomEvent.stop(event.originalEvent)
      mk.closeTooltip()
      emit('select', m.id)
    })
    mk.on('add', () => {
      const el = mk.getElement()
      el?.setAttribute('aria-label', m.title || 'Open location details')
      if (!props.pills || !el) return
      // A pin that re-enters the map (cluster expanded) picks its state up again.
      el.addEventListener('focus', () => emit('hover', m.id))
      el.addEventListener('blur', () => emit('hover', null))
      applyState(m.id)
    })
    if (props.pills) {
      mk.on('mouseover', () => emit('hover', m.id))
      mk.on('mouseout', () => emit('hover', null))
    }
    mk.addTo(pinTarget)
    markerLayers.set(m.id, mk)
    pts.push([m.lat, m.lng])
    if (m.fit !== false) fitPts.push([m.lat, m.lng])
  }
  labelClusters()
  if (props.path && pts.length > 1) {
    L.polyline(pts, { color: getComputedStyle(el.value).getPropertyValue('--ink').trim() || '#2a1f17', weight: 3, dashArray: '2 8', lineCap: 'round' }).addTo(layer)
  }
  const fitSig = props.pills && props.fitKey != null ? props.fitKey : geometry
  if (fitSig === lastFit) return
  lastFit = fitSig
  lastUserInput = NEVER
  if (fitPts.length === 1) map.setView(fitPts[0], 15)
  else if (fitPts.length) map.fitBounds(L.latLngBounds(fitPts).pad(0.2), { maxZoom: 16 })
  else map.fitBounds(SG_BOUNDS)
}

// What Discover needs to know about the viewport. `user` is true when a person moved it (drag, wheel, keys,
// zoom buttons), false when the code did (initial fit, area shortcuts, revealing a pin).
function boundsNow() {
  const b = map.getBounds()
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
}
function reportView() {
  if (!map || !map.getSize().x || !map.getSize().y) return
  emit('view', { bounds: boundsNow(), user: performance.now() - lastUserInput < 1500 })
}

// Fly somewhere on request; resolves once the map has settled (or after a short wait if it was already there).
function flyTo(lat, lng, zoom = 14) {
  if (!map) return Promise.resolve()
  lastUserInput = NEVER
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); map?.off('moveend', done); resolve() }
    const timer = setTimeout(done, 1800)
    map.on('moveend', done)
    map.flyTo([lat, lng], zoom, { duration: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 0.8 })
  })
}

// Bring a pin into view and clear of the docked preview card: zoom out of its cluster, or pan to it.
function reveal(id, { bottomInset = 0 } = {}) {
  const mk = markerLayers.get(id)
  if (!map || !mk) return
  lastUserInput = NEVER
  const settle = () => {
    const size = map.getSize()
    const p = map.latLngToContainerPoint(mk.getLatLng())
    const pad = 56
    const dx = p.x < pad ? p.x - pad : p.x > size.x - pad ? p.x - (size.x - pad) : 0
    const dy = p.y < pad + 40 ? p.y - (pad + 40) : p.y > size.y - bottomInset - pad ? p.y - (size.y - bottomInset - pad) : 0
    if (dx || dy) map.panBy([dx, dy], { animate: true })
  }
  if (clusterGroup && !map.hasLayer(mk)) clusterGroup.zoomToShowLayer(mk, settle)
  else settle()
}

onMounted(async () => {
  await nextTick()
  // The component may have been unmounted while waiting.
  if (!el.value) return
  if (props.cluster) {
    // The plugin reads the global Leaflet object, so expose ours before loading it.
    window.L ??= L
    await import('leaflet.markercluster')
    if (!el.value) return
  }
  map = L.map(el.value, {
    maxBounds: SG_BOUNDS.pad(0.1),
    minZoom: 11,
    maxZoom: 18,
    zoomControl: true,
    scrollWheelZoom: props.scrollWheelZoom,
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
  if (props.cluster) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: props.pills ? 44 : 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      animate: !reduceMotion,
      animateAddingMarkers: false,
      iconCreateFunction: clusterIcon,
    }).addTo(map)
    clusterGroup.on('animationend', labelClusters)
    map.on('zoomend moveend', labelClusters)
  }
  // A pane for a caller's route overlay: above the tiles, below the pins (marker pane is 600).
  if (props.trackLayout) map.createPane('route').style.zIndex = 450
  map.on('move zoom resize', reportLayout)
  draw()
  reportLayout()
  map.on('dragstart zoomstart', () => emit('interact'))
  if (props.pills) {
    const noteInput = () => { lastUserInput = performance.now() }
    for (const evt of ['pointerdown', 'wheel', 'keydown', 'touchstart']) el.value.addEventListener(evt, noteInput, { passive: true })
    map.on('moveend', reportView)
    reportView()
  }
  // The container can change size after mount (tabs, sticky sidebars); keep Leaflet in sync.
  ro = new ResizeObserver(() => {
    if (!map) return
    map.invalidateSize()
  })
  ro.observe(el.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  // Leaflet ends a zoom animation from an untracked 250 ms timer that reads the removed panes.
  // Marking the zoom finished turns that timer into a no-op when the page closes mid-zoom.
  if (map) map._animatingZoom = false
  map?.remove()
  map = null
  clusterGroup = null
  markerLayers.clear()
})

watch(() => [props.markers, props.start], draw, { deep: true })
watch(() => props.highlightId, (next, prev) => { applyState(prev); applyState(next) })

defineExpose({ flyTo, reveal, getBounds: () => (map ? boundsNow() : null), invalidate: () => map?.invalidateSize(), routePane: () => map?.getPane('route') || null, focusMarker: id => markerLayers.get(id)?.getElement()?.focus({ preventScroll: true }) })
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
/* Pills (Discover): icon + short label, anchored at the bottom centre with a small tail. */
:global(.leaflet-marker-icon.pill-wrap) { width: max-content; overflow: visible; translate: -50% calc(-100% - 7px); }
:global(.map-pill) {
  --pill-bg: var(--tomato-soft);
  --pill-ink: var(--tomato-ink);
  --pill-edge: var(--tomato);
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 9px 0 7px;
  border-radius: 13px;
  white-space: nowrap;
  background: var(--pill-bg);
  color: var(--pill-ink);
  border: 1.5px solid var(--pill-edge);
  box-shadow: 0 2px 6px rgba(var(--oj-shadow-rgb), 0.28);
  font: 700 12px/1 var(--font-body);
  transform-origin: 50% 100%;
  transition: transform var(--oj-t-quick) var(--oj-ease-out), box-shadow var(--oj-t-quick) var(--oj-ease-out);
}
:global(.map-pill:not(:has(b))) { padding: 0 6px; }
:global(.map-pill b) { font-weight: 700; }
:global(.map-pill svg) { flex: none; }
:global(.map-pill::after) {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 8px;
  height: 8px;
  background: var(--pill-bg);
  border: solid var(--pill-edge);
  border-width: 0 1.5px 1.5px 0;
  transform: translateX(-50%) rotate(45deg);
  border-radius: 0 0 2px 0;
}
:global(.map-pill.tone-mustard) { --pill-bg: var(--mustard-soft); --pill-ink: var(--mustard-ink); --pill-edge: var(--mustard); }
:global(.map-pill.tone-plum) { --pill-bg: var(--plum-soft); --pill-ink: var(--plum-ink); --pill-edge: var(--plum); }
:global(.map-pill.tone-teal) { --pill-bg: var(--teal-soft); --pill-ink: var(--teal-ink); --pill-edge: var(--teal); }
:global(.map-pill.hot), :global(.map-pill.active) { transform: scale(1.16); box-shadow: 0 4px 12px rgba(var(--oj-shadow-rgb), 0.4); }
:global(.map-pill.hot), :global(.map-pill.active) { border-color: var(--ink); outline: 2px solid var(--ink); outline-offset: 1px; }
:global(.map-pill.active::after), :global(.map-pill.hot::after) { border-color: var(--ink); }
:global(.leaflet-marker-icon:focus-visible .map-pill) { outline: 3px solid var(--ink); outline-offset: 2px; }
:global(.leaflet-marker-icon:focus-visible) { outline: none; }
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
.map-pin-preview.leaflet-tooltip { padding: 14px 16px; width: max-content; max-width: min(260px, calc(100vw - 64px)); white-space: normal; overflow-wrap: anywhere; background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-pop); font-family: var(--font-body); font-size: .85rem; line-height: 1.4; }
.map-pin-preview.leaflet-tooltip-top::before { border-top-color: var(--card); }
.map-pin-preview > div { display: grid; gap: 5px; }
.map-preview-title { font-family: var(--font-display); font-size: 1rem; }
.map-preview-kind { color: var(--teal-ink); font-size: .75rem; font-weight: 700; }
.map-preview-location { color: var(--ink-2); }
.map-preview-when, .map-preview-spots { font-weight: 600; }
:root[data-theme='dark'] .map-x .leaflet-tile-pane { filter: invert(0.9) hue-rotate(180deg) sepia(0.35) brightness(0.85) contrast(0.9); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .map-x .leaflet-tile-pane { filter: invert(0.9) hue-rotate(180deg) sepia(0.35) brightness(0.85) contrast(0.9); }
}

/* Cluster bubbles (Leaflet.markercluster). They replace its default green and yellow with an orange fill
   and white numerals (about 7:1 on the light fill, 5:1 on the dark one) and a teal halo. The dark fill is
   set explicitly because --oj-orange-ink flips to a pale tint in dark mode, where white text would fail. */
.map-x { --cluster-fill: var(--oj-orange-ink); }
:root[data-theme='dark'] .map-x { --cluster-fill: #C2410C; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .map-x { --cluster-fill: #C2410C; }
}
.map-x .marker-cluster-small, .map-x .marker-cluster-medium, .map-x .marker-cluster-large {
  background-color: color-mix(in srgb, var(--teal) 35%, transparent);
  border-radius: 50%;
}
.map-x .marker-cluster-small div, .map-x .marker-cluster-medium div, .map-x .marker-cluster-large div {
  background-color: var(--cluster-fill);
  box-shadow: 0 0 0 3px var(--card), 0 3px 8px rgba(var(--oj-shadow-rgb), 0.25);
}
.map-x .oj-cluster .oj-cluster-in {
  display: grid;
  place-items: center;
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  margin: 4px;
  border-radius: 50%;
  color: #fff;
}
.map-x .oj-cluster-in span { line-height: 1; font: 800 14px/1 var(--font-display); }
.map-x .oj-cluster:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
/* Pill-mode clusters: a neutral "+N" pill, not the numbered orange bubble. */
.map-x .oj-cluster-pill { background: none; border: 0; }
.map-x .leaflet-marker-icon.oj-cluster-pill { width: max-content; translate: -50% calc(-100% - 4px); }
.map-x .oj-cluster-pill .oj-cluster-in {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 26px;
  padding: 0 9px;
  margin: 0;
  width: auto;
  border-radius: 13px;
  background: var(--card);
  color: var(--ink);
  border: 1.5px solid var(--line-strong);
  box-shadow: 0 2px 6px rgba(var(--oj-shadow-rgb), 0.28);
}
.map-x .oj-cluster-pill .oj-cluster-in span { font: 800 12px/1 var(--font-display); white-space: nowrap; }
.map-x .oj-cluster-pill:hover .oj-cluster-in { border-color: var(--ink); }
@media (prefers-reduced-motion: reduce) {
  .map-x .leaflet-cluster-anim .leaflet-marker-icon,
  .map-x .leaflet-cluster-anim .leaflet-marker-shadow,
  .map-x .leaflet-cluster-spider-leg { transition: none !important; }
}
</style>
