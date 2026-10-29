<script setup>
// Outlined category icons, one stroke weight. Names match interest slugs and listing types.
import { computed } from 'vue'
const props = defineProps({ name: { type: String, required: true }, size: { type: Number, default: 24 } })
const PATHS = {
  food: 'M4 12h16a8 7 0 0 1-16 0ZM9 9c-1.2-1.6 1.2-2.6 0-4.5M13 9c-1.2-1.6 1.2-2.6 0-4.5M17 9c-1.2-1.6 1.2-2.6 0-4.5',
  cafes: 'M5 9h11v5a5 5 0 0 1-10 0V9ZM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-1 1.2 1 2 0 3.2M12 3.5c-1 1.2 1 2 0 3.2M4 21h14',
  nightlife: 'M6 4h12l-6 7-6-7ZM12 11v8M8 20h8M15 4l2-2',
  outdoors: 'M3 19 9 9l4 6 2-3 6 7H3ZM16 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  arts: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8ZM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  museums: 'M3 9 12 4l9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  shopping: 'M5 8h14l-1 12H6L5 8ZM9 8V6a3 3 0 0 1 6 0v2',
  music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  games: 'M7 9h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L14 14h-4l-1.6 1.8A3 3 0 0 1 3 14v-1a4 4 0 0 1 4-4ZM8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01',
  wellness: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  markets: 'M4 10h16l-1.5-5h-13L4 10ZM4 10a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8h13v-8M10 20v-4h4v4',
  workshops: 'M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z',
  place: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  event: 'M5 6h14v14H5V6ZM5 10h14M9 3v5M15 3v5M9 14h2',
  deal: 'M4 12V5h7l9 9-7 7-9-9ZM8.5 8.5h.01',
  hangout: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19a5 5 0 0 1 10 0M13.5 15.5A5 5 0 0 1 21 19',
  walk: 'M13 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 21l2-6 3 3v3M9 11l1.5-4 3.5 1 2 3M10.5 7 8 9v3',
  transit: 'M7 4h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM5 11h14M8.5 14h.01M15.5 14h.01M8 17l-2 3M16 17l2 3',
  plus: 'M12 5v14M5 12h14',
}
const d = computed(() => PATHS[props.name] || PATHS.place)
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" class="cat-icon">
    <path :d="d" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
