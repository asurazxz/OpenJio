<script setup>
import { toasts } from '../lib/toast.js'
</script>

<template>
  <div class="toast-host" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast-x" :class="t.tone">{{ t.message }}</div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  z-index: 80;
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
.toast-x.danger { background: var(--danger); color: #fff; }
.toast-enter-active, .toast-leave-active { transition: all 0.2s var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (min-width: 768px) {
  .toast-host { bottom: 24px; }
}
</style>
