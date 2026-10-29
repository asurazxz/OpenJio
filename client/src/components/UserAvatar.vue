<script setup>
import { computed } from 'vue'
import { initials } from '../data/personas.js'

const props = defineProps({
  user: { type: Object, default: null },
  size: { type: Number, default: 36 },
  ring: { type: Boolean, default: false },
})
const text = computed(() => (props.user ? initials(props.user.name) : '?'))
</script>

<template>
  <span
    class="avatar"
    :class="[`c-${user?.color || 'ink'}`, { ring }]"
    :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.38 + 'px' }"
    :title="user?.name"
    aria-hidden="true"
  >{{ text }}</span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  font-family: var(--oj-font-heading);
  font-weight: 900;
  letter-spacing: 0.02em;
  border: 2px solid var(--card);
  color: var(--ink);
}
.ring { box-shadow: 0 0 0 3px var(--paper); }
.c-tomato { background: var(--tomato-soft); color: var(--tomato-ink); }
.c-teal { background: var(--teal-soft); color: var(--teal-ink); }
.c-mustard { background: var(--mustard-soft); color: var(--mustard-ink); }
.c-plum { background: var(--plum-soft); color: var(--plum-ink); }
.c-sky { background: color-mix(in srgb, var(--sky) 25%, var(--card)); }
.c-ink { background: var(--paper-2); }
</style>
