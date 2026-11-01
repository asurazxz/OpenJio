<script setup>
// Renders the shared confirmation dialog requested through lib/confirm.js.
import { ref, watch, nextTick } from 'vue'
import AppDialog from './AppDialog.vue'
import { confirmState, answerConfirm } from '../lib/confirm.js'

const cancelBtn = ref(null)
// Focus the safe choice first, so Enter never confirms a destructive action by accident.
watch(() => confirmState.open, async (open) => { if (open) { await nextTick(); cancelBtn.value?.focus() } })
</script>

<template>
  <AppDialog :open="confirmState.open" :title="confirmState.title" class="confirm-dlg" @close="confirmState.open && answerConfirm(false)">
    <p v-if="confirmState.message" class="confirm-msg">{{ confirmState.message }}</p>
    <div class="confirm-actions">
      <button ref="cancelBtn" type="button" class="btn btn-secondary" @click="answerConfirm(false)">{{ confirmState.cancelLabel }}</button>
      <button type="button" class="btn" :class="confirmState.danger ? 'btn-danger' : 'btn-primary'" @click="answerConfirm(true)">{{ confirmState.confirmLabel }}</button>
    </div>
  </AppDialog>
</template>

<style scoped>
.confirm-msg { margin: 0 0 20px; color: var(--ink-2); line-height: 1.55; }
.confirm-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.confirm-actions .btn { min-height: 44px; }
</style>
