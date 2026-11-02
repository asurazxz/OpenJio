import { reactive } from 'vue'

// One app-wide confirmation dialog, rendered by ConfirmHost in App.vue.
// Replaces window.confirm(): `if (!(await confirmDialog({ ... }))) return`.
// An optional third choice (`extraLabel`) makes the promise resolve 'extra' when picked.
export const confirmState = reactive({ open: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', extraLabel: '', danger: false })
let settle = null

export function confirmDialog({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', extraLabel = '', danger = false }) {
  // A newer request replaces an unanswered one, which counts as cancelled.
  settle?.(false)
  Object.assign(confirmState, { open: true, title, message, confirmLabel, cancelLabel, extraLabel, danger })
  return new Promise((resolve) => { settle = resolve })
}

export function answerConfirm(ok) {  // true, false or 'extra'
  confirmState.open = false
  const resolve = settle
  settle = null
  resolve?.(ok)
}
