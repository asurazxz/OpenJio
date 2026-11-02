// Tiny global toast queue.
import { reactive } from 'vue'

export const toasts = reactive([])
let n = 0

// `action` adds one button ({ label, run }); a toast with an action stays long enough to reach it.
export function toast(message, tone = 'default', ms = 3200, action = null) {
  const id = ++n
  toasts.push({ id, message, tone, action })
  setTimeout(() => dismissToast(id), action ? Math.max(ms, 8000) : ms)
}

export function dismissToast(id) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i !== -1) toasts.splice(i, 1)
}

export function toastError(err) {
  toast(err?.message || 'Something went wrong. Try again.', 'danger', 4500)
}
