<script setup>
// Native <dialog> wrapper: the browser handles focus trapping, Escape and the backdrop.
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  wide: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])
const el = ref(null)

function sync() {
  if (!el.value) return
  if (props.open && !el.value.open) el.value.showModal()
  else if (!props.open && el.value.open) el.value.close()
}
watch(() => props.open, sync)
onMounted(sync)

function onClick(e) {
  if (e.target === el.value) emit('close')
}
</script>

<template>
  <dialog ref="el" class="dlg" :class="{ wide }" :aria-label="title" @close="emit('close')" @click="onClick">
    <div class="dlg-body">
      <header class="dlg-head">
        <h2 class="h3 m-0">{{ title }}</h2>
        <button type="button" class="btn btn-ghost btn-sm close" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
      </header>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.dlg {
  border: 1.5px solid var(--line-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop-lg);
  padding: 0;
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--card);
  color: var(--ink);
}
.dlg.wide { width: min(760px, calc(100vw - 32px)); }
.dlg::backdrop { background: rgba(42, 31, 23, 0.45); }
.dlg-body { padding: 20px; }
.dlg-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.close { width: 36px; height: 36px; padding: 0; display: grid; place-items: center; }
</style>
