<script setup>
import { toasts, dismissToast } from '../lib/toast.js'
</script>

<template>
  <div class="toast-host" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast-x" :class="[t.tone, { 'has-action': t.action }]">
        <span>{{ t.message }}</span>
        <button v-if="t.action" type="button" class="toast-act" @click="dismissToast(t.id); t.action.run()">{{ t.action.label }}</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  /* Above map overlays such as Discover's preview card (z-index 500). */
  z-index: 1100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}
.toast-x {
  background: var(--ink);
  color: var(--paper);
  padding: 11px 16px;
  border-radius: 12px;
  font-weight: 550;
  font-size: 0.93rem;
  box-shadow: var(--shadow-soft);
}
.toast-x.has-action { display: flex; align-items: center; justify-content: space-between; gap: 12px; pointer-events: auto; }
.toast-act {
  flex: none;
  min-height: 36px;
  padding: 0 12px;
  border: 1.5px solid currentColor;
  border-radius: 999px;
  background: none;
  color: inherit;
  font-weight: 700;
  font-size: 0.9rem;
}
.toast-act:hover { background: color-mix(in srgb, currentColor 16%, transparent); }
.toast-act:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.toast-x.danger { background: var(--oj-toast-danger-bg); color: var(--oj-toast-danger-fg); }
.toast-enter-active, .toast-leave-active { transition: all 0.2s var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (min-width: 768px) {
  .toast-host { bottom: 24px; }
}
</style>
