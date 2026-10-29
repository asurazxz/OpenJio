<script setup>
// Native <dialog> wrapper: the browser handles focus trapping, Escape, the backdrop and
// returning focus to the control that opened it. `sheet` makes it a bottom sheet on phones
// and a side drawer on wider screens.
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  wide: { type: Boolean, default: false },
  sheet: { type: Boolean, default: false },
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
  <dialog ref="el" class="dlg" :class="{ wide, sheet }" :aria-label="title" @close="emit('close')" @click="onClick">
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
  border: 1px solid var(--line);
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
.dlg[open] { animation: dlg-in var(--oj-t-standard) var(--oj-ease-out); }
.dlg.wide { width: min(760px, calc(100vw - 32px)); }
.dlg::backdrop { background: rgba(28, 25, 23, 0.45); }
.dlg-body { padding: 20px; }
.dlg-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.close { width: 44px; height: 44px; padding: 0; display: grid; place-items: center; }
@keyframes dlg-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

.dlg.sheet {
  margin: auto 0 0;
  width: 100vw;
  max-width: 100vw;
  max-height: 88vh;
  border-radius: 24px 24px 0 0;
  border-bottom: 0;
  padding-bottom: env(safe-area-inset-bottom);
}
.dlg.sheet .dlg-body { padding-top: 12px; }
.dlg.sheet .dlg-body::before {
  content: '';
  display: block;
  width: 44px;
  height: 5px;
  border-radius: 999px;
  background: var(--line-strong);
  margin: 0 auto 12px;
}
@media (min-width: 768px) {
  .dlg.sheet {
    margin: 0 0 0 auto;
    width: min(460px, 100vw);
    height: 100vh;
    max-height: 100vh;
    border-radius: 24px 0 0 24px;
    border-bottom: 1px solid var(--line);
  }
  .dlg.sheet[open] { animation-name: drawer-in; }
  .dlg.sheet .dlg-body::before { display: none; }
}
@keyframes drawer-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
</style>
